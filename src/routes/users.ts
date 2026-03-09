import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const usersRouter = Router();

const userSelect = { id: true, name: true, email: true, handicap: true, pushToken: true, avatarUrl: true, createdAt: true };

// Get user by ID
usersRouter.get("/:id", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: userSelect,
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error("Fetch user by id error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Get user by email
usersRouter.get("/email/:email", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.params.email },
      select: userSelect,
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error("Fetch user by email error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update user
usersRouter.patch("/:id", async (req, res) => {
  try {
    const { name, handicap, pushToken } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(handicap !== undefined && { handicap }),
        ...(pushToken && { pushToken }),
      },
      select: userSelect,
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to update user" });
  }
});
