import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const statsRouter = Router();

// Get user statistics
statsRouter.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const rounds = await prisma.round.findMany({
      where: { userId },
      include: {
        scores: true,
        course: true,
      },
      orderBy: { date: "desc" },
    });

    if (rounds.length === 0) {
      res.json({
        totalRounds: 0,
        averageScore: 0,
        bestScore: 0,
        handicap: user.handicap,
        fairwayPercentage: 0,
        girPercentage: 0,
        averagePutts: 0,
        recentScores: [],
        handicapHistory: [],
      });
      return;
    }

    const totalRounds = rounds.length;
    const scores = rounds.map((r) => r.totalScore);
    const averageScore = Math.round((scores.reduce((s, v) => s + v, 0) / totalRounds) * 10) / 10;
    const bestScore = Math.min(...scores);

    // Hole-level stats
    const allHoleScores = rounds.flatMap((r) => r.scores);
    const fairwayShots = allHoleScores.filter((s) => s.fairway !== null);
    const fairwayPercentage = fairwayShots.length > 0
      ? Math.round((fairwayShots.filter((s) => s.fairway).length / fairwayShots.length) * 100)
      : 0;

    const girShots = allHoleScores.filter((s) => s.gir !== null);
    const girPercentage = girShots.length > 0
      ? Math.round((girShots.filter((s) => s.gir).length / girShots.length) * 100)
      : 0;

    const puttsScores = allHoleScores.filter((s) => s.putts !== null);
    const averagePutts = puttsScores.length > 0
      ? Math.round((puttsScores.reduce((s, v) => s + (v.putts || 0), 0) / puttsScores.length) * 10) / 10
      : 0;

    // Recent scores (last 10)
    const recentScores = rounds.slice(0, 10).map((r) => r.totalScore).reverse();

    // Handicap history (simulated from rounds)
    const handicapHistory = rounds
      .slice(0, 20)
      .map((r) => ({
        date: r.date.toISOString().split("T")[0],
        handicap: Math.round(((r.totalScore - r.course.par) * 113) / 120 * 10) / 10,
      }))
      .reverse();

    res.json({
      totalRounds,
      averageScore,
      bestScore,
      handicap: user.handicap,
      fairwayPercentage,
      girPercentage,
      averagePutts,
      recentScores,
      handicapHistory,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
