import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { HttpError } from "../../lib/errors";

export const socialRouter = Router();

const userIdParamSchema = z.object({ followingId: z.string().min(1) });
const lessonIdParamSchema = z.object({ lessonId: z.string().min(1) });

socialRouter.post(
  "/follow/:followingId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { followingId } = userIdParamSchema.parse(req.params);
    if (followingId === req.user!.id) {
      throw new HttpError(400, "You cannot follow yourself");
    }

    const follow = await prisma.userFollow.upsert({
      where: {
        followerId_followingId: {
          followerId: req.user!.id,
          followingId,
        },
      },
      create: {
        followerId: req.user!.id,
        followingId,
      },
      update: {},
      select: { id: true, followerId: true, followingId: true, createdAt: true },
    });

    res.status(201).json({ follow });
  }),
);

socialRouter.delete(
  "/follow/:followingId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { followingId } = userIdParamSchema.parse(req.params);

    await prisma.userFollow.deleteMany({
      where: {
        followerId: req.user!.id,
        followingId,
      },
    });

    res.status(204).send();
  }),
);

socialRouter.get(
  "/following",
  requireAuth,
  asyncHandler(async (req, res) => {
    const following = await prisma.userFollow.findMany({
      where: { followerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        following: { select: { id: true, username: true, avatar: true, language: true } },
      },
    });

    res.status(200).json({
      following: following.map((f) => f.following),
    });
  }),
);

socialRouter.post(
  "/bookmarks/:lessonId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lessonId } = lessonIdParamSchema.parse(req.params);

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, slug: true, title: true },
    });
    if (!lesson) throw new HttpError(404, "Lesson not found");

    const bookmark = await prisma.bookmark.upsert({
      where: {
        userId_lessonId: {
          userId: req.user!.id,
          lessonId,
        },
      },
      create: { userId: req.user!.id, lessonId },
      update: {},
      select: { id: true, lessonId: true, createdAt: true },
    });

    res.status(201).json({ bookmark });
  }),
);

socialRouter.delete(
  "/bookmarks/:lessonId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lessonId } = lessonIdParamSchema.parse(req.params);

    await prisma.bookmark.deleteMany({
      where: { userId: req.user!.id, lessonId },
    });

    res.status(204).send();
  }),
);

socialRouter.get(
  "/bookmarks",
  requireAuth,
  asyncHandler(async (req, res) => {
    const language = typeof req.query.language === "string" ? req.query.language : undefined;
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        lesson: {
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            coverImage: true,
            xpReward: true,
            isPremium: true,
            category: { select: { id: true, slug: true, name: true } },
            translations: language
              ? {
                  where: { language },
                  take: 1,
                  select: { title: true, description: true, hook: true },
                }
              : false,
          },
        },
      },
    });

    res.status(200).json({
      bookmarks,
    });
  }),
);

