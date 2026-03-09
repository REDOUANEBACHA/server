import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { generateToken, authMiddleware, AuthRequest } from "../middleware/auth.js";

export const authRouter = Router();

// Register
authRouter.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "Nom, email et mot de passe requis" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Cet email est déjà utilisé" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    const token = generateToken(user.id);

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, handicap: user.handicap, createdAt: user.createdAt },
    });
  } catch (error: any) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Erreur lors de l'inscription" });
  }
});

// Login
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email et mot de passe requis" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Email ou mot de passe incorrect" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Email ou mot de passe incorrect" });
      return;
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, handicap: user.handicap, createdAt: user.createdAt },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Erreur lors de la connexion" });
  }
});

// Get current user (protected)
authRouter.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, handicap: true, pushToken: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "Utilisateur non trouvé" });
      return;
    }
    res.json(user);
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});
