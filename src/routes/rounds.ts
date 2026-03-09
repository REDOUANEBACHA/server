import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { notifyHandicapUpdate, notifyRoundSummary, notifyRankingChanges } from "../services/notifications.js";

export const roundsRouter = Router();

// Create a round with hole scores
roundsRouter.post("/", async (req, res) => {
  try {
    const { userId, courseId, totalScore, totalPar, weather, notes, scores } = req.body;

    // Get old handicap before creating round
    const userBefore = await prisma.user.findUnique({ where: { id: userId } });
    const oldHandicap = userBefore?.handicap ?? 54;

    const round = await prisma.round.create({
      data: {
        userId,
        courseId,
        totalScore,
        totalPar,
        weather,
        notes,
        scores: scores ? { create: scores } : undefined,
      },
      include: {
        scores: { orderBy: { hole: "asc" } },
        course: true,
      },
    });

    // Recalculate handicap after new round
    await recalculateHandicap(userId);

    // Send notifications (non-blocking)
    const userAfter = await prisma.user.findUnique({ where: { id: userId } });
    if (userAfter && userAfter.handicap !== oldHandicap) {
      notifyHandicapUpdate(userId, oldHandicap, userAfter.handicap).catch(() => {});
      notifyRankingChanges(userId, oldHandicap, userAfter.handicap).catch(() => {});
    }
    notifyRoundSummary(userId, round.course.name, totalScore, totalPar).catch(() => {});

    res.status(201).json(round);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create round" });
  }
});

// Get rounds for a user
roundsRouter.get("/", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const rounds = await prisma.round.findMany({
      where: { userId: userId as string },
      include: { course: true },
      orderBy: { date: "desc" },
    });
    res.json(rounds);
  } catch {
    res.status(500).json({ error: "Failed to fetch rounds" });
  }
});

// Get single round with scores
roundsRouter.get("/:id", async (req, res) => {
  try {
    const round = await prisma.round.findUnique({
      where: { id: req.params.id },
      include: {
        course: { include: { courseHoles: { orderBy: { number: "asc" } } } },
        scores: { orderBy: { hole: "asc" } },
      },
    });
    if (!round) {
      res.status(404).json({ error: "Round not found" });
      return;
    }
    res.json(round);
  } catch {
    res.status(500).json({ error: "Failed to fetch round" });
  }
});

// Recalculate handicap: best 8 differentials of last 20 rounds
async function recalculateHandicap(userId: string) {
  const rounds = await prisma.round.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 20,
    include: { course: true },
  });

  if (rounds.length < 3) return;

  const differentials = rounds.map((r) => {
    return ((r.totalScore - r.course.par) * 113) / 120; // slope rating ~120
  });

  differentials.sort((a, b) => a - b);
  const count = Math.min(8, Math.ceil(differentials.length * 0.4));
  const bestDiffs = differentials.slice(0, count);
  const handicap = Math.round((bestDiffs.reduce((s, d) => s + d, 0) / count) * 10) / 10;

  await prisma.user.update({
    where: { id: userId },
    data: { handicap: Math.max(0, handicap) },
  });
}
