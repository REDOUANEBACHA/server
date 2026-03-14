import { Router } from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const BLAZEPOSE_SCRIPT = join(__dirname, "..", "..", "blazepose", "analyze.py");

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

// Analyze a swing video with BlazePose (local Python script)
function runBlazePose(videoPath: string): Promise<any> {
  const python = process.env.PYTHON_PATH || "python3";
  return new Promise((resolve, reject) => {
    execFile(python, [BLAZEPOSE_SCRIPT, videoPath], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("BlazePose stderr:", stderr);
        return reject(new Error(stderr || err.message));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Réponse BlazePose invalide"));
      }
    });
  });
}

videosRouter.post("/:id/analyze", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const video = await prisma.swingVideo.findUnique({
      where: { id: req.params.id },
    });

    if (!video) {
      res.status(404).json({ error: "Vidéo introuvable" });
      return;
    }

    // Download video from S3 to a temp file
    const tmpPath = join(tmpdir(), `swing_${video.id}_${Date.now()}.mp4`);
    const response = await fetch(video.videoUrl);
    if (!response.ok) {
      res.status(400).json({ error: "Impossible de télécharger la vidéo" });
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(tmpPath, buffer);

    // Run BlazePose analysis
    let result: any;
    try {
      result = await runBlazePose(tmpPath);
    } finally {
      await unlink(tmpPath).catch(() => {});
    }

    if (result.error) {
      res.status(422).json({ error: result.error });
      return;
    }

    // Upsert analysis in DB
    const analysis = await prisma.swingAnalysis.upsert({
      where: { videoId: video.id },
      update: {
        swingScore: result.swing_score,
        tempoRatio: result.tempo_ratio,
        maxHipRotation: result.max_hip_rotation,
        maxShoulderRotation: result.max_shoulder_rotation,
        headStability: result.head_stability,
        phases: result.phases,
        keyAngles: result.key_angles,
        tips: result.tips,
        totalFrames: result.total_frames,
        fps: result.fps,
        durationS: result.duration_s,
      },
      create: {
        videoId: video.id,
        swingScore: result.swing_score,
        tempoRatio: result.tempo_ratio,
        maxHipRotation: result.max_hip_rotation,
        maxShoulderRotation: result.max_shoulder_rotation,
        headStability: result.head_stability,
        phases: result.phases,
        keyAngles: result.key_angles,
        tips: result.tips,
        totalFrames: result.total_frames,
        fps: result.fps,
        durationS: result.duration_s,
      },
    });

    res.json(analysis);
  } catch (error) {
    console.error("Analyze video error:", error);
    res.status(500).json({ error: "Erreur lors de l'analyse du swing" });
  }
});

// Get analysis for a video
videosRouter.get("/:id/analysis", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const analysis = await prisma.swingAnalysis.findUnique({
      where: { videoId: req.params.id },
    });

    if (!analysis) {
      res.status(404).json({ error: "Aucune analyse trouvée pour cette vidéo" });
      return;
    }

    res.json(analysis);
  } catch (error) {
    console.error("Get analysis error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Get best swing for a user (highest swing_score)
videosRouter.get("/best/:userId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const bestAnalysis = await prisma.swingAnalysis.findFirst({
      where: { video: { userId: req.params.userId } },
      orderBy: { swingScore: "desc" },
      include: {
        video: true,
      },
    });

    if (!bestAnalysis) {
      res.status(404).json({ error: "Aucune analyse trouvée" });
      return;
    }

    res.json(bestAnalysis);
  } catch (error) {
    console.error("Get best swing error:", error);
    res.status(500).json({ error: "Erreur serveur" });
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
