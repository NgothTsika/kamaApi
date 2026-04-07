import { Router, Request, Response } from "express";
import { requireAuth } from "../../../middleware/auth.middleware";
import { asyncHandler } from "../../../lib/http";
import { moderationAdminService } from "../services/moderation.admin.service";

export const moderationAdminRouter = Router();

// Middleware: Only ADMIN and MODERATOR can access
const requireAdminOrModerator = asyncHandler(async (req, res, next) => {
  const user = (req as any).user;
  if (!user || !["ADMIN", "MODERATOR"].includes(user.role)) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only admins and moderators can access moderation endpoints",
    });
  }
  next();
});

/**
 * GET /admin/moderation/reports
 * Get all reports with filtering and pagination
 */
moderationAdminRouter.get(
  "/reports",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as
      | "OPEN"
      | "IN_REVIEW"
      | "RESOLVED"
      | "DISMISSED"
      | undefined;
    const type = req.query.type as "submission" | "lesson" | undefined;

    // Validate status if provided
    if (
      status &&
      !["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status)
    ) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    // Validate type if provided
    if (type && !["submission", "lesson"].includes(type)) {
      return res.status(400).json({ error: "Invalid type value" });
    }

    const result = await moderationAdminService.getAllReports(
      limit,
      offset,
      status,
      type,
    );

    res.status(200).json(result);
  }),
);

/**
 * GET /admin/moderation/reports/:reportId
 * Get specific report details
 */
moderationAdminRouter.get(
  "/reports/:reportId",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { reportId } = req.params as { reportId: string };

    const report = await moderationAdminService.getReportDetails(reportId);

    res.status(200).json(report);
  }),
);

/**
 * PATCH /admin/moderation/reports/:reportId
 * Update report status and add resolution note
 */
moderationAdminRouter.patch(
  "/reports/:reportId",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { reportId } = req.params as { reportId: string };
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    if (!["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const updated = await moderationAdminService.updateReportStatus(
      reportId,
      status,
      (req as any).user.id,
      notes,
    );

    res.status(200).json(updated);
  }),
);

/**
 * POST /admin/moderation/reports/bulk-update
 * Update multiple reports status
 */
moderationAdminRouter.post(
  "/reports/bulk-update",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { reportIds, status } = req.body;

    if (!Array.isArray(reportIds)) {
      return res.status(400).json({ error: "reportIds must be an array" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    if (!["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const result = await moderationAdminService.bulkUpdateReports(
      reportIds,
      status,
      (req as any).user.id,
    );

    res.status(200).json(result);
  }),
);

/**
 * GET /admin/moderation/stats
 * Get moderation statistics
 */
moderationAdminRouter.get(
  "/stats",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await moderationAdminService.getModerationStats();

    res.status(200).json(stats);
  }),
);

/**
 * GET /admin/moderation/reporters/:reporterId
 * Get report history for a specific reporter
 */
moderationAdminRouter.get(
  "/reporters/:reporterId",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { reporterId } = req.params as { reporterId: string };
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await moderationAdminService.getReporterHistory(
      reporterId,
      limit,
      offset,
    );

    res.status(200).json(result);
  }),
);

/**
 * GET /admin/moderation/submissions
 * Get submissions for review
 */
moderationAdminRouter.get(
  "/submissions",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as
      | "PENDING"
      | "APPROVED"
      | "REJECTED"
      | undefined;

    // Validate status if provided
    if (status && !["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const result = await moderationAdminService.getSubmissionsForReview(
      limit,
      offset,
      status,
    );

    res.status(200).json(result);
  }),
);

/**
 * PATCH /admin/moderation/submissions/:submissionId
 * Update submission status
 */
moderationAdminRouter.patch(
  "/submissions/:submissionId",
  requireAuth,
  requireAdminOrModerator,
  asyncHandler(async (req: Request, res: Response) => {
    const { submissionId } = req.params as { submissionId: string };
    const { status, rejectionReason } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    if (status === "REJECTED" && !rejectionReason) {
      return res.status(400).json({
        error: "rejectionReason is required for rejected submissions",
      });
    }

    const updated = await moderationAdminService.updateSubmissionStatus(
      submissionId,
      status,
      rejectionReason,
    );

    res.status(200).json(updated);
  }),
);
