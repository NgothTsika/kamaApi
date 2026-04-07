import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";

export const communityRouter = Router();

const createCommentSchema = z.object({
  lessonId: z.string().min(1),
  content: z.string().min(1).max(2000),
});

communityRouter.post(
  "/comments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lessonId, content } = createCommentSchema.parse(req.body);

    const comment = await prisma.comment.create({
      data: {
        userId: req.user!.id,
        lessonId,
        content,
      },
      select: {
        id: true,
        content: true,
        likes: true,
        createdAt: true,
        user: { select: { id: true, username: true, avatar: true, language: true } },
      },
    });

    res.status(201).json({ comment });
  }),
);

communityRouter.get(
  "/lessons/:lessonId/comments",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    const comments = await prisma.comment.findMany({
      where: { lessonId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, username: true, avatar: true, language: true } },
      },
    });

    res.status(200).json({ comments });
  }),
);

communityRouter.post(
  "/comments/:commentId/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ commentId: z.string().min(1) });
    const { commentId } = paramsSchema.parse(req.params);
    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { likes: { increment: 1 } },
    });

    res.status(200).json({ likes: updated.likes });
  }),
);

