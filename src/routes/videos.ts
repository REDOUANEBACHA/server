import { Router } from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const videosRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
});

const s3 = new S3Client({
  region: process.env.OVH_S3_REGION || "gra",
  endpoint: process.env.OVH_S3_ENDPOINT || "https://s3.gra.io.cloud.ovh.net",
  credentials: {
    accessKeyId: process.env.OVH_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.OVH_S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.OVH_S3_BUCKET_NAME || "parisarts";
const PUBLIC_URL = process.env.NEXT_PUBLIC_OVH_S3_PUBLIC_URL || "https://parisarts.s3.gra.io.cloud.ovh.net";

// Upload a swing video
videosRouter.post("/", authMiddleware, upload.single("video"), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "Aucune vidéo envoyée" });
      return;
    }

    const { roundId, hole, club, duration, notes } = req.body;

    const ext = file.originalname.split(".").pop()?.toLowerCase() || "mp4";
    const key = `golf-swings/${userId}/${Date.now()}.${ext}`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    }));

    const videoUrl = `${PUBLIC_URL}/${key}`;

    const video = await prisma.swingVideo.create({
      data: {
        userId,
        roundId: roundId || null,
        hole: hole ? parseInt(hole, 10) : null,
        club: club || null,
        videoUrl,
        duration: duration ? parseFloat(duration) : null,
        notes: notes || null,
      },
    });

    res.status(201).json(video);
  } catch (error) {
    console.error("Video upload error:", error);
    res.status(500).json({ error: "Échec de l'upload vidéo" });
  }
});

// Get all videos for the authenticated user
videosRouter.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { roundId, club } = req.query;

    const where: any = { userId };
    if (roundId) where.roundId = roundId as string;
    if (club) where.club = club as string;

    const videos = await prisma.swingVideo.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    res.json(videos);
  } catch (error) {
    console.error("Get videos error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des vidéos" });
  }
});

// Get a single video by ID
videosRouter.get("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const video = await prisma.swingVideo.findUnique({
      where: { id: req.params.id },
    });

    if (!video) {
      res.status(404).json({ error: "Vidéo introuvable" });
      return;
    }

    res.json(video);
  } catch (error) {
    console.error("Get video error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Delete a video
videosRouter.delete("/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const video = await prisma.swingVideo.findUnique({
      where: { id: req.params.id },
    });

    if (!video) {
      res.status(404).json({ error: "Vidéo introuvable" });
      return;
    }

    if (video.userId !== userId) {
      res.status(403).json({ error: "Non autorisé" });
      return;
    }

    // Delete from S3
    const key = video.videoUrl.replace(`${PUBLIC_URL}/`, "");
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })).catch(() => {}); // ignore S3 errors on delete

    await prisma.swingVideo.delete({
      where: { id: req.params.id },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete video error:", error);
    res.status(500).json({ error: "Erreur lors de la suppression" });
  }
});

// Get videos for a specific user (public, for comparing swings)
videosRouter.get("/user/:userId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const videos = await prisma.swingVideo.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(videos);
  } catch (error) {
    console.error("Get user videos error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
