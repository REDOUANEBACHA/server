import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { notifyGroupNewMember } from "../services/notifications.js";

export const groupsRouter = Router();

// All group routes require authentication
groupsRouter.use(authMiddleware);

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Create group
groupsRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "Nom du groupe requis" });
      return;
    }

    // Generate unique code
    let code = generateCode();
    while (await prisma.group.findUnique({ where: { code } })) {
      code = generateCode();
    }

    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        code,
        creatorId: req.userId!,
        members: {
          create: { userId: req.userId!, role: "admin" },
        },
      },
      include: { members: { include: { user: { select: { id: true, name: true, handicap: true } } } } },
    });

    res.status(201).json(group);
  } catch (error) {
    console.error("Create group error:", error);
    res.status(500).json({ error: "Erreur lors de la création du groupe" });
  }
});

// List my groups
groupsRouter.get("/", async (req: AuthRequest, res) => {
  try {
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: req.userId! } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, handicap: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(groups);
  } catch (error) {
    console.error("List groups error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Join group by code
groupsRouter.post("/join", async (req: AuthRequest, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) {
      res.status(400).json({ error: "Code requis" });
      return;
    }

    const group = await prisma.group.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!group) {
      res.status(404).json({ error: "Code invalide" });
      return;
    }

    // Check if already member
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: req.userId! } },
    });
    if (existing) {
      res.status(409).json({ error: "Vous êtes déjà dans ce groupe" });
      return;
    }

    await prisma.groupMember.create({
      data: { groupId: group.id, userId: req.userId! },
    });

    const fullGroup = await prisma.group.findUnique({
      where: { id: group.id },
      include: {
        members: { include: { user: { select: { id: true, name: true, handicap: true } } } },
      },
    });

    // Notify group creator
    const joiner = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    if (joiner) {
      notifyGroupNewMember(group.creatorId, joiner.name, group.name, group.id).catch(() => {});
    }

    res.json(fullGroup);
  } catch (error) {
    console.error("Join group error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Get group detail with leaderboard
groupsRouter.get("/:id", async (req: AuthRequest, res) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, handicap: true },
            },
          },
        },
      },
    });

    if (!group) {
      res.status(404).json({ error: "Groupe non trouvé" });
      return;
    }

    // Check membership
    const isMember = group.members.some((m) => m.userId === req.userId);
    if (!isMember) {
      res.status(403).json({ error: "Vous n'êtes pas membre de ce groupe" });
      return;
    }

    // Build leaderboard: for each member, get stats
    const leaderboard = await Promise.all(
      group.members.map(async (member) => {
        const rounds = await prisma.round.findMany({
          where: { userId: member.userId },
          orderBy: { date: "desc" },
          take: 20,
          include: { course: { select: { name: true } } },
        });

        const totalRounds = rounds.length;
        const avgScore = totalRounds > 0
          ? Math.round(rounds.reduce((s, r) => s + (r.totalScore - r.totalPar), 0) / totalRounds * 10) / 10
          : 0;
        const bestScore = totalRounds > 0
          ? Math.min(...rounds.map((r) => r.totalScore - r.totalPar))
          : 0;
        const lastRound = rounds[0] || null;

        return {
          userId: member.userId,
          name: member.user.name,
          handicap: member.user.handicap,
          role: member.role,
          joinedAt: member.joinedAt,
          totalRounds,
          avgScore,
          bestScore,
          lastRound: lastRound
            ? {
                date: lastRound.date,
                score: lastRound.totalScore,
                diff: lastRound.totalScore - lastRound.totalPar,
                courseName: lastRound.course.name,
              }
            : null,
        };
      })
    );

    // Sort by handicap (lower = better)
    leaderboard.sort((a, b) => a.handicap - b.handicap);

    res.json({ ...group, leaderboard });
  } catch (error) {
    console.error("Get group error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Leave group
groupsRouter.delete("/:id/leave", async (req: AuthRequest, res) => {
  try {
    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId: req.params.id, userId: req.userId! } },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Remove member (admin only)
groupsRouter.delete("/:id/members/:userId", async (req: AuthRequest, res) => {
  try {
    // Check if requester is admin
    const requester = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: req.params.id, userId: req.userId! } },
    });
    if (!requester || requester.role !== "admin") {
      res.status(403).json({ error: "Seul un admin peut exclure un membre" });
      return;
    }

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});
