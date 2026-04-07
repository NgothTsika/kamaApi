import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { HttpError } from "../../lib/errors";

// Hearts Service
import {
  getUserHearts,
  loseHeart,
  recoverHeart,
  restoreFullHearts,
  getHeartRecoveryHistory,
} from "./hearts.service";

// Streaks Service
import {
  getUserStreak,
  checkInDaily,
  freezeStreak,
  addStreakFreezes,
  getStreakCheckInHistory,
  getStreakStatistics,
} from "./streaks.service";

// Characters Service
import {
  getUserCharacterProgress,
  unlockCharacter,
  purchaseCharacter,
  addCharacterExperience,
  setFavoriteCharacter,
  getCharacterStatistics,
  checkCharacterUnlock,
} from "./characters.service";

export const gamificationRouter = Router();

/**
 * ============================================
 * HEARTS ENDPOINTS
 * ============================================
 */

/**
 * GET /gamification/hearts
 * Get user's current heart state
 */
gamificationRouter.get(
  "/hearts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const heartsState = await getUserHearts(req.user!.id);
    res.status(200).json({
      success: true,
      data: heartsState,
    });
  }),
);

/**
 * POST /gamification/hearts/lose
 * Deduct a heart from the user (typically on lesson/quiz failure)
 */
gamificationRouter.post(
  "/hearts/lose",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      reason: z.string().optional(),
    });

    const { reason } = bodySchema.parse(req.body);

    const updatedState = await loseHeart(req.user!.id, reason);

    res.status(200).json({
      success: true,
      message: "Heart lost",
      data: updatedState,
    });
  }),
);

/**
 * POST /gamification/hearts/recover
 * Attempt to recover one heart (if recovery time has passed)
 */
gamificationRouter.post(
  "/hearts/recover",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const updatedState = await recoverHeart(req.user!.id);

      res.status(200).json({
        success: true,
        message: "Heart recovered",
        data: updatedState,
      });
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 400) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }),
);

/**
 * POST /gamification/hearts/restore
 * Restore all hearts (achievement reward or premium)
 */
gamificationRouter.post(
  "/hearts/restore",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      reason: z.string().optional().default("achievement"),
    });

    const { reason } = bodySchema.parse(req.body);

    const updatedState = await restoreFullHearts(req.user!.id, reason);

    res.status(200).json({
      success: true,
      message: "Hearts restored",
      data: updatedState,
    });
  }),
);

/**
 * GET /gamification/hearts/history
 * Get heart recovery event history
 */
gamificationRouter.get(
  "/hearts/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().positive().optional().default(50),
    });

    const { limit } = querySchema.parse(req.query);

    const history = await getHeartRecoveryHistory(req.user!.id, limit);

    res.status(200).json({
      success: true,
      data: history,
    });
  }),
);

/**
 * ============================================
 * STREAKS ENDPOINTS
 * ============================================
 */

/**
 * GET /gamification/streaks
 * Get user's current streak state
 */
gamificationRouter.get(
  "/streaks",
  requireAuth,
  asyncHandler(async (req, res) => {
    const streakState = await getUserStreak(req.user!.id);

    res.status(200).json({
      success: true,
      data: streakState,
    });
  }),
);

/**
 * POST /gamification/streaks/check-in
 * Record daily activity check-in
 */
gamificationRouter.post(
  "/streaks/check-in",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      xpEarned: z.number().int().nonnegative().optional().default(0),
      lessonCount: z.number().int().nonnegative().optional().default(0),
      quizCount: z.number().int().nonnegative().optional().default(0),
    });

    const { xpEarned, lessonCount, quizCount } = bodySchema.parse(req.body);

    const updatedState = await checkInDaily(
      req.user!.id,
      xpEarned,
      lessonCount,
      quizCount,
    );

    res.status(200).json({
      success: true,
      message: "Daily check-in recorded",
      data: updatedState,
    });
  }),
);

/**
 * POST /gamification/streaks/freeze
 * Freeze streak for 24 hours (premium feature)
 */
gamificationRouter.post(
  "/streaks/freeze",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const updatedState = await freezeStreak(req.user!.id);

      res.status(200).json({
        success: true,
        message: "Streak frozen for 24 hours",
        data: updatedState,
      });
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 400) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }),
);

/**
 * GET /gamification/streaks/history
 * Get daily check-in history
 */
gamificationRouter.get(
  "/streaks/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      days: z.coerce.number().int().positive().optional().default(30),
    });

    const { days } = querySchema.parse(req.query);

    const history = await getStreakCheckInHistory(req.user!.id, days);

    res.status(200).json({
      success: true,
      data: history,
    });
  }),
);

/**
 * GET /gamification/streaks/stats
 * Get detailed streak statistics
 */
gamificationRouter.get(
  "/streaks/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const stats = await getStreakStatistics(req.user!.id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  }),
);

/**
 * ============================================
 * CHARACTER PROGRESSION ENDPOINTS
 * ============================================
 */

/**
 * GET /gamification/characters
 * Get all characters and their unlock/progress status
 */
gamificationRouter.get(
  "/characters",
  requireAuth,
  asyncHandler(async (req, res) => {
    const characters = await getUserCharacterProgress(req.user!.id);

    res.status(200).json({
      success: true,
      data: characters,
    });
  }),
);

/**
 * GET /gamification/characters/:characterId/unlock-check
 * Check if a character can be unlocked
 */
gamificationRouter.get(
  "/characters/:characterId/unlock-check",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      characterId: z.string().min(1),
    });

    const { characterId } = paramsSchema.parse(req.params);

    const unlockCheck = await checkCharacterUnlock(req.user!.id, characterId);

    res.status(200).json({
      success: true,
      data: unlockCheck,
    });
  }),
);

/**
 * POST /gamification/characters/:characterId/unlock
 * Unlock a character for the user
 */
gamificationRouter.post(
  "/characters/:characterId/unlock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      characterId: z.string().min(1),
    });

    const { characterId } = paramsSchema.parse(req.params);

    try {
      const characterProgress = await unlockCharacter(
        req.user!.id,
        characterId,
      );

      res.status(200).json({
        success: true,
        message: "Character unlocked",
        data: characterProgress,
      });
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 400) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }),
);

/**
 * POST /gamification/characters/:characterId/purchase
 * Purchase a character with XP
 */
gamificationRouter.post(
  "/characters/:characterId/purchase",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      characterId: z.string().min(1),
    });

    const { characterId } = paramsSchema.parse(req.params);

    try {
      const characterProgress = await purchaseCharacter(
        req.user!.id,
        characterId,
      );

      res.status(200).json({
        success: true,
        message: "Character purchased",
        data: characterProgress,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }),
);

/**
 * POST /gamification/characters/:characterId/experience
 * Add experience to a character
 */
gamificationRouter.post(
  "/characters/:characterId/experience",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      characterId: z.string().min(1),
    });

    const bodySchema = z.object({
      xpAmount: z.number().int().positive(),
    });

    const { characterId } = paramsSchema.parse(req.params);
    const { xpAmount } = bodySchema.parse(req.body);

    const characterProgress = await addCharacterExperience(
      req.user!.id,
      characterId,
      xpAmount,
    );

    res.status(200).json({
      success: true,
      message: "Experience added to character",
      data: characterProgress,
    });
  }),
);

/**
 * POST /gamification/characters/:characterId/favorite
 * Set character as favorite
 */
gamificationRouter.post(
  "/characters/:characterId/favorite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      characterId: z.string().min(1),
    });

    const { characterId } = paramsSchema.parse(req.params);

    try {
      await setFavoriteCharacter(req.user!.id, characterId);

      res.status(200).json({
        success: true,
        message: "Favorite character set",
      });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }),
);

/**
 * GET /gamification/characters/stats
 * Get character statistics for the user
 */
gamificationRouter.get(
  "/characters/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const stats = await getCharacterStatistics(req.user!.id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  }),
);

/**
 * ============================================
 * GAMIFICATION DASHBOARD
 * ============================================
 */

/**
 * GET /gamification/dashboard
 * Get complete gamification dashboard data
 */
gamificationRouter.get(
  "/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const hearts = await getUserHearts(req.user!.id);
    const streak = await getUserStreak(req.user!.id);
    const characters = await getUserCharacterProgress(req.user!.id);
    const stats = await getStreakStatistics(req.user!.id);

    res.status(200).json({
      success: true,
      data: {
        hearts,
        streak,
        characters,
        stats,
      },
    });
  }),
);

export default gamificationRouter;
