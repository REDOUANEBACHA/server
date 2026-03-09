import { Router } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const uploadRouter = Router();

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

// Get a presigned URL for avatar upload
uploadRouter.post("/avatar-url", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const ext = req.body.ext || "jpg";
    const contentType = req.body.contentType || "image/jpeg";
    const key = `golf-avatars/${userId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "public-read",
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const publicUrl = `${PUBLIC_URL}/${key}`;

    // Save avatar URL to user
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: publicUrl },
    });

    res.json({ uploadUrl: signedUrl, publicUrl });
  } catch (error) {
    console.error("Upload URL error:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});
