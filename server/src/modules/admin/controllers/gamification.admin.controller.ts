import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.middleware";
import { asyncHandler } from "../../../lib/http";
import { gamificationAdminService } from "../services/gamification.admin.service";

export const gamificationAdminRouter = Router();

// Middleware: Only ADMIN can access
const requireAdmin = asyncHandler(async (req, res, next) => {
  const user = (req as any).user;
  if (user?.role !== "ADMIN") {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only admins can access gamification admin endpoints",
    });
  }
  next();
});

// ============================================================================
// HEARTS ENDPOINTS
// ============================================================================

/**
 * GET /admin/gamification/hearts
 */
gamificationAdminRouter.get(
  "/hearts",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        limit: z.coerce.number().max(500).default(50),
        offset: z.coerce.number().default(0),
        sortBy: z.enum(["hearts", "lastLoss", "recovery"]).default("hearts"),
        order: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(req.query);

    const result = await gamificationAdminService.getAllUserHearts(
      query.limit as number,
      query.offset as number,
      query.sortBy,
      query.order,
    );

    res.status(200).json(result);
  }),
);

/**
 * GET /admin/gamification/hearts/stats
 */
gamificationAdminRouter.get(
  "/hearts/stats",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const stats = await gamificationAdminService.getHeartStats();
    res.status(200).json(stats);
  }),
);

/**
 * GET /admin/gamification/hearts/recovery-history
 */
gamificationAdminRouter.get(
  "/hearts/recovery-history",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        limit: z.coerce.number().max(500).default(50),
        offset: z.coerce.number().default(0),
      })
      .parse(req.query);

    const result = await gamificationAdminService.getHeartRecoveryHistory(
      query.limit as number,
      query.offset as number,
    );

    res.status(200).json(result);
  }),
);

/**
 * POST /admin/gamification/hearts/:userId/restore
 */
gamificationAdminRouter.post(
  "/hearts/:userId/restore",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        hearts: z.number().int().min(1).max(10),
      })
      .parse(req.body);

    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    const result = await gamificationAdminService.restoreUserHearts(
      userId,
      body.hearts,
    );

    res.status(200).json(result);
  }),
);

/**
 * POST /admin/gamification/hearts/restore-all
 */
gamificationAdminRouter.post(
  "/hearts/restore-all",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        hearts: z.number().int().min(1).max(10).default(5),
      })
      .parse(req.body);

    const result = await gamificationAdminService.bulkRestoreHearts(
      body.hearts as number,
    );

    res.status(200).json(result);
  }),
);

/**
 * POST /admin/gamification/hearts/sync
 * Sync all users' hearts with current gamification settings
 */
gamificationAdminRouter.post(
  "/hearts/sync",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result =
      await gamificationAdminService.syncAllUsersHeartsWithConfig();
    res.status(200).json(result);
  }),
);

// ============================================================================
// STREAKS ENDPOINTS
// ============================================================================

/**
 * GET /admin/gamification/streaks
 */
gamificationAdminRouter.get(
  "/streaks",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        limit: z.coerce.number().max(500).default(50),
        offset: z.coerce.number().default(0),
        sortBy: z.enum(["current", "longest", "freezes"]).default("current"),
        order: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(req.query);

    const result = await gamificationAdminService.getAllUserStreaks(
      query.limit as number,
      query.offset as number,
      query.sortBy,
      query.order,
    );

    res.status(200).json(result);
  }),
);

/**
 * GET /admin/gamification/streaks/stats
 */
gamificationAdminRouter.get(
  "/streaks/stats",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const stats = await gamificationAdminService.getStreakStats();
    res.status(200).json(stats);
  }),
);

/**
 * POST /admin/gamification/streaks/:userId/reset
 */
gamificationAdminRouter.post(
  "/streaks/:userId/reset",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    const result = await gamificationAdminService.resetUserStreak(userId);
    res.status(200).json(result);
  }),
);

/**
 * POST /admin/gamification/streaks/:userId/award-xp
 */
gamificationAdminRouter.post(
  "/streaks/:userId/award-xp",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        xpAmount: z.number().int().min(1).max(10000),
        reason: z.string().min(1).max(200),
      })
      .parse(req.body);

    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    const result = await gamificationAdminService.awardBonusXp(
      userId,
      body.xpAmount,
      body.reason,
    );

    res.status(200).json(result);
  }),
);

/**
 * POST /admin/gamification/streaks/:userId/freeze
 */
gamificationAdminRouter.post(
  "/streaks/:userId/freeze",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    const result = await gamificationAdminService.freezeUserStreak(userId);
    res.status(200).json(result);
  }),
);

// ============================================================================
// CHARACTERS ENDPOINTS
// ============================================================================

/**
 * GET /admin/gamification/characters/stats
 */
gamificationAdminRouter.get(
  "/characters/stats",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const stats = await gamificationAdminService.getCharacterStats();
    res.status(200).json(stats);
  }),
);

/**
 * POST /admin/gamification/characters/:userId/:characterId/unlock
 */
gamificationAdminRouter.post(
  "/characters/:userId/:characterId/unlock",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;
    const characterId = Array.isArray(req.params.characterId)
      ? req.params.characterId[0]
      : req.params.characterId;

    const result = await gamificationAdminService.unlockCharacterForUser(
      userId,
      characterId,
    );

    res.status(200).json(result);
  }),
);

/**
 * GET /admin/gamification/users/:userId/profile
 */
gamificationAdminRouter.get(
  "/users/:userId/profile",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    const profile =
      await gamificationAdminService.getUserGamificationProfile(userId);

    res.status(200).json(profile);
  }),
);

// ============================================================================
// CONFIG ENDPOINTS
// ============================================================================

/**
 * GET /admin/gamification/config
 */
gamificationAdminRouter.get(
  "/config",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const config = await gamificationAdminService.getGamificationConfig();
    res.status(200).json(config);
  }),
);

/**
 * PUT /admin/gamification/config
 */
gamificationAdminRouter.put(
  "/config",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        hearts: z
          .object({
            maxHearts: z.number().int().min(1).max(10).optional(),
            recoveryTimeMs: z.number().int().min(300000).optional(),
            premiumRecoveryTimeMs: z.number().int().min(300000).optional(),
          })
          .optional(),
        streaks: z
          .object({
            checkInHours: z.number().int().min(1).optional(),
            xpMultiplierFormula: z.string().optional(),
            milestones: z.array(z.number().int()).optional(),
          })
          .optional(),
        characters: z
          .object({
            unlockXpThreshold: z.number().int().min(0).optional(),
            purchaseXpCost: z.number().int().min(0).optional(),
          })
          .optional(),
        gamification: z
          .object({
            enabled: z.boolean().optional(),
            eventMultiplier: z.number().min(0.5).max(10).optional(),
          })
          .optional(),
      })
      .parse(req.body);

    const updated =
      await gamificationAdminService.updateGamificationConfig(body);

    res.status(200).json(updated);
  }),
);

/**
 * GET /admin/gamification/events
 */
gamificationAdminRouter.get(
  "/events",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const events = await gamificationAdminService.getAllGameEvents();
    res.status(200).json(events);
  }),
);

/**
 * POST /admin/gamification/events
 */
gamificationAdminRouter.post(
  "/events",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        eventName: z.string().min(1).max(100),
        multiplier: z.number().min(0.5).max(10),
        durationHours: z.number().int().min(1).max(720),
        affectedSystem: z.enum(["hearts", "xp", "all"]),
      })
      .parse(req.body);

    const event = await gamificationAdminService.createGameEvent(
      body.eventName,
      body.multiplier,
      body.durationHours,
      body.affectedSystem,
    );

    res.status(201).json(event);
  }),
);

/**
 * DELETE /admin/gamification/events/:eventId
 */
gamificationAdminRouter.delete(
  "/events/:eventId",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const eventId = req.params.eventId as string | string[];
    const finalEventId = Array.isArray(eventId) ? eventId[0] : eventId;

    const event = await gamificationAdminService.deleteGameEvent(finalEventId);
    res.status(200).json({
      message: "Event deleted successfully",
      event,
    });
  }),
);
