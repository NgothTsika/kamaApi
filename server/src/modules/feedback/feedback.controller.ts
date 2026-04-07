import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { HttpError } from "../../lib/errors";

export const feedbackRouter = Router();

const lessonIdParamSchema = z.object({ lessonId: z.string().min(1) });

const feedbackBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

feedbackRouter.post(
  "/lessons/:lessonId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lessonId } = lessonIdParamSchema.parse(req.params);
    const { rating, comment } = feedbackBodySchema.parse(req.body);

    const lessonExists = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lessonExists) throw new HttpError(404, "Lesson not found");

    const feedback = await prisma.lessonFeedback.upsert({
      where: {
        userId_lessonId: {
          userId: req.user!.id,
          lessonId,
        },
      },
      create: {
        userId: req.user!.id,
        lessonId,
        rating,
        comment,
      },
      update: {
        rating,
        comment,
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({ feedback });
  }),
);

