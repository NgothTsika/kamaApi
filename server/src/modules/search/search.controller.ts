import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";

export const searchRouter = Router();

searchRouter.post(
  "/search-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      query: z.string().min(1).max(500),
      results: z.number().int().min(0).default(0),
    });
    const { query, results } = bodySchema.parse(req.body);

    const entry = await prisma.searchHistory.create({
      data: { userId: req.user!.id, query, results },
    });

    res.status(201).json({ entry });
  }),
);

searchRouter.get(
  "/search-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
    const take = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;

    const entries = await prisma.searchHistory.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take,
    });

    res.status(200).json({ entries });
  }),
);

