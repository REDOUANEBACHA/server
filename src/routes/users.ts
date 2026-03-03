import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const usersRouter = Router();

// Create user
usersRouter.post("/", async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await prisma.user.create({
      data: { name, email },
    });
    res.status(201).json(user);
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    console.error("Create user error:", error);
    res.status(500).json({ error: "Failed to create user", details: error.message });
  }
});

// Get user by ID
usersRouter.get("/:id", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
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
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to update user" });
  }
});
