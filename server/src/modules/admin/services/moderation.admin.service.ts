import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../../lib/errors";

export class ModerationAdminService {
  /**
   * Get all reports with advanced filtering and pagination
   */
  async getAllReports(
    limit: number = 50,
    offset: number = 0,
    status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED",
    type?: "submission" | "lesson",
  ) {
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (type === "submission") {
      where.submissionId = { not: null };
    } else if (type === "lesson") {
      where.lessonId = { not: null };
    }

    const [reports, total] = await Promise.all([
      prisma.contentReport.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, username: true, email: true, avatar: true },
          },
          resolver: {
            select: { id: true, username: true },
          },
          submission: {
            select: { id: true, title: true, status: true, userId: true },
          },
          lesson: {
            select: { id: true, title: true, slug: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.contentReport.count({ where }),
    ]);

    return {
      data: reports,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get a specific report with full details
   */
  async getReportDetails(reportId: string) {
    const report = await prisma.contentReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true,
          },
        },
        resolver: {
          select: { id: true, username: true },
        },
        submission: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            userId: true,
            user: {
              select: { id: true, username: true, email: true },
            },
          },
        },
        lesson: {
          select: { id: true, title: true, slug: true },
        },
      },
    });

    if (!report) {
      throw new HttpError(404, "Report not found");
    }

    return report;
  }

  /**
   * Update report status and add resolution note
   */
  async updateReportStatus(
    reportId: string,
    status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED",
    resolverId: string,
    notes?: string,
  ) {
    const report = await prisma.contentReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new HttpError(404, "Report not found");
    }

    const updated = await prisma.contentReport.update({
      where: { id: reportId },
      data: {
        status,
        resolverId,
        resolvedAt:
          status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
      },
      include: {
        reporter: {
          select: { id: true, username: true, email: true },
        },
        resolver: {
          select: { id: true, username: true },
        },
        submission: {
          select: { id: true, title: true },
        },
        lesson: {
          select: { id: true, title: true },
        },
      },
    });

    return updated;
  }

  /**
   * Get moderation statistics
   */
  async getModerationStats() {
    const [
      openReports,
      inReviewReports,
      resolvedReports,
      dismissedReports,
      totalReports,
    ] = await Promise.all([
      prisma.contentReport.count({ where: { status: "OPEN" } }),
      prisma.contentReport.count({ where: { status: "IN_REVIEW" } }),
      prisma.contentReport.count({ where: { status: "RESOLVED" } }),
      prisma.contentReport.count({ where: { status: "DISMISSED" } }),
      prisma.contentReport.count(),
    ]);

    const submissionReports = await prisma.contentReport.count({
      where: { submissionId: { not: null } },
    });
    const lessonReports = await prisma.contentReport.count({
      where: { lessonId: { not: null } },
    });

    const reportsLast7Days = await prisma.contentReport.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const pendingReports = openReports + inReviewReports;

    return {
      totalReports,
      openReports,
      inReviewReports,
      resolvedReports,
      dismissedReports,
      pendingReports,
      submissionReports,
      lessonReports,
      reportsLast7Days,
      resolutionRate:
        totalReports > 0
          ? (
              ((resolvedReports + dismissedReports) / totalReports) *
              100
            ).toFixed(2)
          : "0.00",
    };
  }

  /**
   * Get reports by reporter
   */
  async getReporterHistory(
    reporterId: string,
    limit: number = 50,
    offset: number = 0,
  ) {
    const reporter = await prisma.user.findUnique({
      where: { id: reporterId },
      select: { id: true, username: true, email: true },
    });

    if (!reporter) {
      throw new HttpError(404, "User not found");
    }

    const [reports, total] = await Promise.all([
      prisma.contentReport.findMany({
        where: { reporterId },
        include: {
          submission: {
            select: { id: true, title: true },
          },
          lesson: {
            select: { id: true, title: true },
          },
          resolver: {
            select: { id: true, username: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.contentReport.count({ where: { reporterId } }),
    ]);

    return {
      reporter,
      data: reports,
      total,
      limit,
      offset,
    };
  }

  /**
   * Bulk update reports status
   */
  async bulkUpdateReports(
    reportIds: string[],
    status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED",
    resolverId: string,
  ) {
    if (reportIds.length === 0) {
      throw new HttpError(400, "No reports provided");
    }

    if (reportIds.length > 100) {
      throw new HttpError(400, "Maximum 100 reports can be updated at once");
    }

    const result = await prisma.contentReport.updateMany({
      where: { id: { in: reportIds } },
      data: {
        status,
        resolverId,
        resolvedAt:
          status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
      },
    });

    return {
      message: "Reports updated successfully",
      updatedCount: result.count,
      requestedCount: reportIds.length,
    };
  }

  /**
   * Get content submissions for moderation review
   */
  async getSubmissionsForReview(
    limit: number = 50,
    offset: number = 0,
    status?: "PENDING" | "APPROVED" | "REJECTED",
  ) {
    const where: any = {};

    if (status) {
      where.status = status;
    }

    const [submissions, total] = await Promise.all([
      prisma.contentSubmission.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true, email: true, avatar: true },
          },
          category: {
            select: { id: true, name: true, slug: true },
          },
          _count: {
            select: { reports: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.contentSubmission.count({ where }),
    ]);

    return {
      data: submissions,
      total,
      limit,
      offset,
    };
  }

  /**
   * Update submission status
   */
  async updateSubmissionStatus(
    submissionId: string,
    status: "PENDING" | "APPROVED" | "REJECTED",
    rejectionReason?: string,
  ) {
    const submission = await prisma.contentSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new HttpError(404, "Submission not found");
    }

    const updated = await prisma.contentSubmission.update({
      where: { id: submissionId },
      data: {
        status,
        moderatorNotes: status === "REJECTED" ? rejectionReason : null,
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    return updated;
  }
}

export const moderationAdminService = new ModerationAdminService();
