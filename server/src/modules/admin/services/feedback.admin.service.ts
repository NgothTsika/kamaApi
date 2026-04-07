import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../../lib/errors";

export class FeedbackAdminService {
  /**
   * Get all lesson feedback with pagination and filtering
   */
  async getAllFeedback(
    limit: number = 50,
    offset: number = 0,
    lessonId?: string,
    minRating?: number,
    maxRating?: number,
  ) {
    const where: any = {};

    if (lessonId) {
      where.lessonId = lessonId;
    }

    if (minRating !== undefined || maxRating !== undefined) {
      where.rating = {};
      if (minRating !== undefined) where.rating.gte = minRating;
      if (maxRating !== undefined) where.rating.lte = maxRating;
    }

    const [feedback, total] = await Promise.all([
      prisma.lessonFeedback.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              avatar: true,
            },
          },
          lesson: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.lessonFeedback.count({ where }),
    ]);

    return {
      data: feedback,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get feedback statistics for a lesson
   */
  async getLessonFeedbackStats(lessonId: string) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, title: true },
    });

    if (!lesson) {
      throw new HttpError(404, "Lesson not found");
    }

    const feedback = await prisma.lessonFeedback.findMany({
      where: { lessonId },
    });

    const totalFeedback = feedback.length;
    const avgRating =
      totalFeedback > 0
        ? feedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback
        : 0;

    const ratingDistribution = {
      1: feedback.filter((f) => f.rating === 1).length,
      2: feedback.filter((f) => f.rating === 2).length,
      3: feedback.filter((f) => f.rating === 3).length,
      4: feedback.filter((f) => f.rating === 4).length,
      5: feedback.filter((f) => f.rating === 5).length,
    };

    const feedbackWithComments = feedback.filter((f) => f.comment).length;

    return {
      lesson,
      totalFeedback,
      avgRating: Math.round(avgRating * 100) / 100,
      ratingDistribution,
      feedbackWithComments,
    };
  }

  /**
   * Get feedback statistics for all lessons
   */
  async getAllFeedbackStats() {
    const lessons = await prisma.lesson.findMany({
      select: { id: true, title: true },
    });

    const stats = await Promise.all(
      lessons.map(async (lesson) => {
        const feedback = await prisma.lessonFeedback.findMany({
          where: { lessonId: lesson.id },
        });

        const totalFeedback = feedback.length;
        const avgRating =
          totalFeedback > 0
            ? feedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback
            : 0;

        return {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          totalFeedback,
          avgRating: Math.round(avgRating * 100) / 100,
        };
      }),
    );

    return {
      data: stats.sort((a, b) => b.totalFeedback - a.totalFeedback),
      totalLessons: lessons.length,
      totalFeedbackCount: stats.reduce((sum, s) => sum + s.totalFeedback, 0),
    };
  }

  /**
   * Delete feedback by ID (admin only)
   */
  async deleteFeedback(feedbackId: string) {
    const feedback = await prisma.lessonFeedback.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw new HttpError(404, "Feedback not found");
    }

    await prisma.lessonFeedback.delete({
      where: { id: feedbackId },
    });

    return {
      message: "Feedback deleted successfully",
      deletedFeedbackId: feedbackId,
    };
  }

  /**
   * Delete feedback for a user (admin only)
   */
  async deleteUserFeedback(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const result = await prisma.lessonFeedback.deleteMany({
      where: { userId },
    });

    return {
      message: "User feedback deleted successfully",
      deletedCount: result.count,
    };
  }

  /**
   * Get feedback by a specific user
   */
  async getUserFeedback(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const [feedback, total] = await Promise.all([
      prisma.lessonFeedback.findMany({
        where: { userId },
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.lessonFeedback.count({ where: { userId } }),
    ]);

    return {
      user,
      data: feedback,
      total,
      limit,
      offset,
    };
  }
}

export const feedbackAdminService = new FeedbackAdminService();
