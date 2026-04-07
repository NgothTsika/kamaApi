import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { HttpError } from "../../lib/errors";

export const moderationRouter = Router();

moderationRouter.post(
  "/submissions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      categoryId: z.string().min(1),
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(2000),
      content: z.string().optional(),
      imageUrl: z.string().url().optional(),
      sources: z.string().optional(),
    });
    const { categoryId, title, description, content, imageUrl, sources } =
      bodySchema.parse(req.body);

    const submission = await prisma.contentSubmission.create({
      data: {
        userId: req.user!.id,
        categoryId,
        title,
        description,
        content,
        imageUrl,
        sources,
      },
      select: {
        id: true,
        status: true,
        title: true,
        createdAt: true,
        category: { select: { id: true, slug: true, name: true } },
      },
    });

    res.status(201).json({ submission });
  }),
);

moderationRouter.post(
  "/submissions/:submissionId/report",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      submissionId: z.string().min(1),
    });
    const bodySchema = z.object({
      reason: z.string().min(1).max(500),
      description: z.string().max(2000).optional(),
    });

    const { submissionId } = paramsSchema.parse(req.params);
    const { reason, description } = bodySchema.parse(req.body);

    const exists = await prisma.contentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, "Submission not found");

    const report = await prisma.contentReport.create({
      data: {
        reporterId: req.user!.id,
        submissionId,
        reason,
        description,
      },
      select: { id: true, status: true, reason: true, createdAt: true },
    });

    res.status(201).json({ report });
  }),
);

moderationRouter.post(
  "/lessons/:lessonId/report",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const bodySchema = z.object({
      reason: z.string().min(1).max(500),
      description: z.string().max(2000).optional(),
    });
    const { lessonId } = paramsSchema.parse(req.params);
    const { reason, description } = bodySchema.parse(req.body);

    const exists = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!exists) throw new HttpError(404, "Lesson not found");

    const report = await prisma.contentReport.create({
      data: {
        reporterId: req.user!.id,
        lessonId,
        reason,
        description,
      },
      select: { id: true, status: true, reason: true, createdAt: true },
    });

    res.status(201).json({ report });
  }),
);

// ========== ADMIN ENDPOINTS ==========

// Admin: Get all open reports for review
moderationRouter.get(
  "/admin/reports",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]).optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
    });

    const { status, limit = 20, offset = 0 } = querySchema.parse(req.query);

    const reports = await prisma.contentReport.findMany({
      where: status ? { status } : {},
      include: {
        reporter: { select: { id: true, username: true, email: true } },
        resolver: { select: { id: true, username: true } },
        submission: { select: { id: true, title: true, status: true } },
        lesson: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.contentReport.count({
      where: status ? { status } : {},
    });

    res.status(200).json({ reports, total, limit, offset });
  }),
);

// Admin: Get report by ID
moderationRouter.get(
  "/admin/reports/:reportId",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ reportId: z.string().min(1) });
    const { reportId } = paramsSchema.parse(req.params);

    const report = await prisma.contentReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, username: true, email: true } },
        resolver: { select: { id: true, username: true } },
        submission: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            content: true,
            user: { select: { id: true, username: true, email: true } },
          },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            slug: true,
            published: true,
          },
        },
      },
    });

    if (!report) throw new HttpError(404, "Report not found");
    res.status(200).json({ report });
  }),
);

// Admin: Review a report
moderationRouter.patch(
  "/admin/reports/:reportId/review",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ reportId: z.string().min(1) });
    const bodySchema = z.object({
      status: z.enum(["IN_REVIEW", "RESOLVED", "DISMISSED"]),
    });

    const { reportId } = paramsSchema.parse(req.params);
    const { status } = bodySchema.parse(req.body);

    const report = await prisma.contentReport.findUnique({
      where: { id: reportId },
      select: { id: true, status: true },
    });

    if (!report) throw new HttpError(404, "Report not found");

    const updated = await prisma.contentReport.update({
      where: { id: reportId },
      data: {
        status,
        resolverId: status !== "IN_REVIEW" ? req.user!.id : undefined,
        resolvedAt: status !== "IN_REVIEW" ? new Date() : undefined,
      },
      include: {
        reporter: { select: { id: true, username: true } },
        submission: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true } },
      },
    });

    // Log audit action
    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: `${status.toLowerCase()}_report`,
        entityType: "report",
        entityId: reportId,
        changes: JSON.parse(
          JSON.stringify({ previousStatus: report.status, newStatus: status }),
        ),
      },
    });

    res.status(200).json({ report: updated });
  }),
);

// Admin: Get all pending submissions for review
moderationRouter.get(
  "/admin/submissions",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
    });

    const { status, limit = 20, offset = 0 } = querySchema.parse(req.query);

    const submissions = await prisma.contentSubmission.findMany({
      where: status ? { status } : {},
      include: {
        user: { select: { id: true, username: true, email: true } },
        category: { select: { id: true, name: true } },
        reports: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.contentSubmission.count({
      where: status ? { status } : {},
    });

    res.status(200).json({ submissions, total, limit, offset });
  }),
);

// Admin: Get submission details
moderationRouter.get(
  "/admin/submissions/:submissionId",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ submissionId: z.string().min(1) });
    const { submissionId } = paramsSchema.parse(req.params);

    const submission = await prisma.contentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        user: { select: { id: true, username: true, email: true } },
        category: { select: { id: true, name: true } },
        reports: {
          include: {
            reporter: { select: { id: true, username: true } },
          },
        },
      },
    });

    if (!submission) throw new HttpError(404, "Submission not found");
    res.status(200).json({ submission });
  }),
);

// Admin: Approve submission
moderationRouter.patch(
  "/admin/submissions/:submissionId/approve",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ submissionId: z.string().min(1) });
    const { submissionId } = paramsSchema.parse(req.params);

    const submission = await prisma.contentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true },
    });

    if (!submission) throw new HttpError(404, "Submission not found");
    if (submission.status !== "PENDING") {
      throw new HttpError(400, "Submission is not pending");
    }

    const updated = await prisma.contentSubmission.update({
      where: { id: submissionId },
      data: { status: "APPROVED" },
      include: {
        user: { select: { id: true, username: true } },
        category: { select: { id: true, name: true } },
      },
    });

    // Log audit action
    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "approve_submission",
        entityType: "submission",
        entityId: submissionId,
        changes: JSON.parse(JSON.stringify({ status: "APPROVED" })),
      },
    });

    // Optional: Award XP to submitter for accepted content
    await prisma.user.update({
      where: { id: updated.user.id },
      data: { xp: { increment: 50 } }, // Bonus XP for approved submission
    });

    res.status(200).json({ submission: updated });
  }),
);

// Admin: Reject submission with reason
moderationRouter.patch(
  "/admin/submissions/:submissionId/reject",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ submissionId: z.string().min(1) });
    const bodySchema = z.object({
      reason: z.string().min(1).max(500),
    });

    const { submissionId } = paramsSchema.parse(req.params);
    const { reason } = bodySchema.parse(req.body);

    const submission = await prisma.contentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true },
    });

    if (!submission) throw new HttpError(404, "Submission not found");
    if (submission.status !== "PENDING") {
      throw new HttpError(400, "Submission is not pending");
    }

    const updated = await prisma.contentSubmission.update({
      where: { id: submissionId },
      data: { status: "REJECTED" },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    // Log audit action
    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "reject_submission",
        entityType: "submission",
        entityId: submissionId,
        changes: JSON.parse(JSON.stringify({ status: "REJECTED", reason })),
      },
    });

    res.status(200).json({ submission: updated });
  }),
);

// Admin: Get audit logs
moderationRouter.get(
  "/admin/audit-logs",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      action: z.string().optional(),
      adminId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
    });

    const {
      action,
      adminId,
      limit = 50,
      offset = 0,
    } = querySchema.parse(req.query);

    const where: any = {};
    if (action) where.action = action;
    if (adminId) where.adminId = adminId;

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        admin: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.auditLog.count({ where });

    res.status(200).json({ logs, total, limit, offset });
  }),
);
