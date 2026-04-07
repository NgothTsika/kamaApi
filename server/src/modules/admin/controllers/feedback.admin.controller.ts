import { Router, Request, Response } from "express";
import { requireAuth } from "../../../middleware/auth.middleware";
import { asyncHandler } from "../../../lib/http";
import { feedbackAdminService } from "../services/feedback.admin.service";

export const feedbackAdminRouter = Router();

// Middleware: Only ADMIN and MODERATOR can access
const requireAdminOrModerator = asyncHandler(async (req, res, next) => {
  const user = (req as any).user;
  if (!user || !["ADMIN", "MODERATOR"].includes(user.role)) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only admins and moderators can access feedback endpoints",
    });
  }
  next();
});

/**
 * GET /admin/feedback
 * Get all feedback with optional filtering
 */
feedbackAdminRouter.get(
  "/",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const lessonId = req.query.lessonId as string | undefined;
    const minRating = req.query.minRating
      ? parseInt(req.query.minRating as string)
      : undefined;
    const maxRating = req.query.maxRating
      ? parseInt(req.query.maxRating as string)
      : undefined;

    // Validate rating ranges if provided
    if (minRating && (minRating < 1 || minRating > 5)) {
      return res
        .status(400)
        .json({ error: "minRating must be between 1 and 5" });
    }
    if (maxRating && (maxRating < 1 || maxRating > 5)) {
      return res
        .status(400)
        .json({ error: "maxRating must be between 1 and 5" });
    }

    const result = await feedbackAdminService.getAllFeedback(
      limit,
      offset,
      lessonId,
      minRating,
      maxRating,
    );

    res.status(200).json(result);
  }),
);

/**
 * GET /admin/feedback/stats
 * Get feedback statistics for all lessons
 */
feedbackAdminRouter.get(
  "/stats",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await feedbackAdminService.getAllFeedbackStats();

    res.status(200).json(stats);
  }),
);

/**
 * GET /admin/feedback/lessons/:lessonId/stats
 * Get feedback statistics for a specific lesson
 */
feedbackAdminRouter.get(
  "/lessons/:lessonId/stats",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { lessonId } = req.params as { lessonId: string };

    const stats = await feedbackAdminService.getLessonFeedbackStats(lessonId);

    res.status(200).json(stats);
  }),
);

/**
 * GET /admin/feedback/users/:userId
 * Get all feedback from a specific user
 */
feedbackAdminRouter.get(
  "/users/:userId",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await feedbackAdminService.getUserFeedback(
      userId,
      limit,
      offset,
    );

    res.status(200).json(result);
  }),
);

/**
 * DELETE /admin/feedback/:feedbackId
 * Delete a specific feedback entry
 */
feedbackAdminRouter.delete(
  "/:feedbackId",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { feedbackId } = req.params as { feedbackId: string };

    const result = await feedbackAdminService.deleteFeedback(feedbackId);

    res.status(200).json(result);
  }),
);

/**
 * DELETE /admin/feedback/users/:userId
 * Delete all feedback from a specific user
 */
feedbackAdminRouter.delete(
  "/users/:userId",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };

    const result = await feedbackAdminService.deleteUserFeedback(userId);

    res.status(200).json(result);
  }),
);
