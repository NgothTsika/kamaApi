import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";

export const leaderboardRouter = Router();

leaderboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.leaderboard.findMany({
      orderBy: { totalXp: "desc" },
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            language: true,
          },
        },
      },
    });

    const ranked = rows.map((row, idx) => ({
      ...row,
      rank: idx + 1,
    }));

    res.status(200).json({ leaderboard: ranked });
  }),
);

