import { Router } from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const uploadRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// Upload avatar directly
uploadRouter.post("/avatar", authMiddleware, upload.single("avatar"), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "Aucun fichier envoyé" });
      return;
    }

    const ext = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
    const key = `golf-avatars/${userId}_${Date.now()}.${ext}`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    }));

    const publicUrl = `${PUBLIC_URL}/${key}`;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: publicUrl },
      select: { id: true, name: true, email: true, handicap: true, pushToken: true, avatarUrl: true, createdAt: true },
    });

    res.json(user);
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ error: "Échec de l'upload" });
  }
});
