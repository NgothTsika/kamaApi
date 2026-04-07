import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

export const achievementsRouter = Router();

// ==================== /me Routes ====================

// User earned achievements (duplicate of /progress/achievements, but often used by UI)
achievementsRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const earned = await prisma.userAchievement.findMany({
      where: { userId: req.user!.id },
      orderBy: { earnedAt: "desc" },
      include: { achievement: true },
    });
    res.status(200).json({ earned });
  }),
);

// ==================== Admin Routes (MUST come before /catalog) ====================

// Admin: create achievements
achievementsRouter.post(
  "/catalog",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      name: z.string().min(1).max(200),
      description: z.string().min(1).max(2000),
      icon: z.string().optional(),
      xpRequired: z.number().int().positive().optional(),
      streakRequired: z.number().int().positive().optional(),
    });
    const body = bodySchema.parse(req.body);

    const created = await prisma.achievement.create({ data: body });
    res.status(201).json({ achievement: created });
  }),
);

// Admin: update achievement
achievementsRouter.patch(
  "/catalog/:achievementId",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    try {
      console.log("[PATCH /catalog/:achievementId] Request received:", {
        achievementId: req.params.achievementId,
        user: req.user?.id,
        role: req.user?.role,
      });

      const paramsSchema = z.object({ achievementId: z.string().min(1) });
      const bodySchema = z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().min(1).max(2000).optional(),
        icon: z.string().optional(),
        xpRequired: z.number().int().positive().nullable().optional(),
        streakRequired: z.number().int().positive().nullable().optional(),
      });

      const { achievementId } = paramsSchema.parse(req.params);
      const body = bodySchema.parse(req.body);

      const achievement = await prisma.achievement.findUnique({
        where: { id: achievementId },
      });

      if (!achievement) {
        console.log(
          "[PATCH /catalog/:achievementId] Achievement not found:",
          achievementId,
        );
        return res.status(404).json({ error: "Achievement not found" });
      }

      const updated = await prisma.achievement.update({
        where: { id: achievementId },
        data: {
          name: body.name ?? undefined,
          description: body.description ?? undefined,
          icon: body.icon ?? undefined,
          xpRequired: body.xpRequired ?? undefined,
          streakRequired: body.streakRequired ?? undefined,
        },
      });

      console.log("[PATCH /catalog/:achievementId] Updated successfully");
      return res.status(200).json({ achievement: updated });
    } catch (error) {
      console.error("[PATCH /catalog/:achievementId] Error:", error);
      throw error;
    }
  }),
);

// Admin: delete achievement
achievementsRouter.delete(
  "/catalog/:achievementId",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    try {
      console.log("[DELETE /catalog/:achievementId] Request received:", {
        achievementId: req.params.achievementId,
        user: req.user?.id,
        role: req.user?.role,
      });

      const paramsSchema = z.object({ achievementId: z.string().min(1) });
      const { achievementId } = paramsSchema.parse(req.params);

      const achievement = await prisma.achievement.findUnique({
        where: { id: achievementId },
      });

      if (!achievement) {
        console.log(
          "[DELETE /catalog/:achievementId] Achievement not found:",
          achievementId,
        );
        return res.status(404).json({ error: "Achievement not found" });
      }

      await prisma.achievement.delete({
        where: { id: achievementId },
      });

      console.log("[DELETE /catalog/:achievementId] Deleted successfully");
      return res.status(204).send();
    } catch (error) {
      console.error("[DELETE /catalog/:achievementId] Error:", error);
      throw error;
    }
  }),
);

// ==================== Public Routes (MUST come LAST) ====================

// Public catalog (for UI badges list)
achievementsRouter.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const achievements = await prisma.achievement.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ achievements });
  }),
);

// Fallback: GET /catalog for public access (no auth required)
achievementsRouter.get(
  "/catalog",
  asyncHandler(async (_req, res) => {
    const achievements = await prisma.achievement.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ achievements });
  }),
);
