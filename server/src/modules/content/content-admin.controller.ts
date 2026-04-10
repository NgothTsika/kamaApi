import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { HttpError } from "../../lib/errors";

const adminRoles = requireRole("ADMIN", "MODERATOR");

function jsonChanges(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

async function uniqueLessonSlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = slugify(base) || "lesson";
  let n = 0;
  for (;;) {
    const existing = await prisma.lesson.findUnique({
      where: { slug: candidate },
    });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${slugify(base) || "lesson"}-${n}`;
  }
}

async function uniqueCategorySlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = slugify(base) || "category";
  let n = 0;
  for (;;) {
    const existing = await prisma.category.findUnique({
      where: { slug: candidate },
    });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${slugify(base) || "category"}-${n}`;
  }
}

async function uniqueTopicSlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = slugify(base) || "topic";
  let n = 0;
  for (;;) {
    const existing = await prisma.topic.findUnique({
      where: { slug: candidate },
    });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${slugify(base) || "topic"}-${n}`;
  }
}

async function uniqueCharacterSlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = slugify(base) || "character";
  let n = 0;
  for (;;) {
    const existing = await prisma.character.findUnique({
      where: { slug: candidate },
    });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${slugify(base) || "character"}-${n}`;
  }
}

export const contentAdminRouter = Router();

// ---------- Categories ----------
contentAdminRouter.get(
  "/admin/categories",
  requireAuth,
  adminRoles,
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });
    res.status(200).json({ categories });
  }),
);

contentAdminRouter.post(
  "/admin/categories",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional().nullable(),
      coverImage: z.string().url().optional().nullable().or(z.literal("")),
      icon: z.string().max(500).optional().nullable(),
      order: z.number().int().optional(),
    });
    const body = bodySchema.parse(req.body);
    const slug = body.slug?.trim() || (await uniqueCategorySlug(body.name));

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) throw new HttpError(409, "Slug already in use");

    const category = await prisma.category.create({
      data: {
        name: body.name.trim(),
        slug,
        description: body.description ?? undefined,
        coverImage: body.coverImage || undefined,
        icon: body.icon ?? undefined,
        order: body.order ?? 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_category",
        entityType: "category",
        entityId: category.id,
        changes: { name: category.name, slug: category.slug },
      },
    });

    res.status(201).json({ category });
  }),
);

contentAdminRouter.patch(
  "/admin/categories/:categoryId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ categoryId: z.string().min(1) });
    const { categoryId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      name: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional().nullable(),
      coverImage: z.string().url().optional().nullable().or(z.literal("")),
      icon: z.string().max(500).optional().nullable(),
      order: z.number().int().optional(),
    });
    const body = bodySchema.parse(req.body);

    const found = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!found) throw new HttpError(404, "Category not found");

    let slug = body.slug?.trim();
    if (slug && slug !== found.slug) {
      const clash = await prisma.category.findUnique({ where: { slug } });
      if (clash) throw new HttpError(409, "Slug already in use");
    }

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: body.name?.trim() ?? undefined,
        slug: slug ?? undefined,
        description:
          body.description === undefined ? undefined : body.description,
        coverImage:
          body.coverImage === undefined ? undefined : body.coverImage || null,
        icon: body.icon === undefined ? undefined : body.icon,
        order: body.order ?? undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_category",
        entityType: "category",
        entityId: categoryId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ category });
  }),
);

contentAdminRouter.delete(
  "/admin/categories/:categoryId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ categoryId: z.string().min(1) });
    const { categoryId } = paramsSchema.parse(req.params);

    const lessonCount = await prisma.lesson.count({ where: { categoryId } });
    if (lessonCount > 0) {
      throw new HttpError(
        400,
        "Category has lessons; reassign or delete lessons first",
      );
    }

    await prisma.category.delete({ where: { id: categoryId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_category",
        entityType: "category",
        entityId: categoryId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Topics ----------
contentAdminRouter.get(
  "/admin/topics",
  requireAuth,
  adminRoles,
  asyncHandler(async (_req, res) => {
    const topics = await prisma.topic.findMany({
      orderBy: [{ name: "asc" }],
    });
    res.status(200).json({ topics });
  }),
);

contentAdminRouter.post(
  "/admin/topics",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional().nullable(),
      coverImage: z.string().optional().nullable(),
      parentId: z.string().optional().nullable(),
    });
    const body = bodySchema.parse(req.body);
    const slug = body.slug?.trim() || (await uniqueTopicSlug(body.name));

    const existing = await prisma.topic.findUnique({ where: { slug } });
    if (existing) throw new HttpError(409, "Slug already in use");

    const topic = await prisma.topic.create({
      data: {
        name: body.name.trim(),
        slug,
        description: body.description ?? undefined,
        coverImage: body.coverImage ?? undefined,
        parentId: body.parentId ?? undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_topic",
        entityType: "topic",
        entityId: topic.id,
        changes: { name: topic.name, slug: topic.slug },
      },
    });

    res.status(201).json({ topic });
  }),
);

contentAdminRouter.patch(
  "/admin/topics/:topicId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ topicId: z.string().min(1) });
    const { topicId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      name: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional().nullable(),
      coverImage: z.string().optional().nullable(),
      parentId: z.string().optional().nullable(),
    });
    const body = bodySchema.parse(req.body);

    const found = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!found) throw new HttpError(404, "Topic not found");

    let slug = body.slug?.trim();
    if (slug && slug !== found.slug) {
      const clash = await prisma.topic.findUnique({ where: { slug } });
      if (clash) throw new HttpError(409, "Slug already in use");
    }

    const topic = await prisma.topic.update({
      where: { id: topicId },
      data: {
        name: body.name?.trim() ?? undefined,
        slug: slug ?? undefined,
        description:
          body.description === undefined ? undefined : body.description,
        coverImage: body.coverImage === undefined ? undefined : body.coverImage,
        parentId: body.parentId === undefined ? undefined : body.parentId,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_topic",
        entityType: "topic",
        entityId: topicId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ topic });
  }),
);

contentAdminRouter.delete(
  "/admin/topics/:topicId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ topicId: z.string().min(1) });
    const { topicId } = paramsSchema.parse(req.params);

    const children = await prisma.topic.count({ where: { parentId: topicId } });
    if (children > 0) throw new HttpError(400, "Topic has child topics");

    const lessonCount = await prisma.lesson.count({ where: { topicId } });
    if (lessonCount > 0) throw new HttpError(400, "Topic has lessons assigned");

    const quizCount = await prisma.quiz.count({ where: { topicId } });
    if (quizCount > 0)
      throw new HttpError(400, "Topic is linked to quizzes; reassign first");

    const matchCount = await prisma.gameMatch.count({ where: { topicId } });
    if (matchCount > 0)
      throw new HttpError(400, "Topic is used in game matches");

    await prisma.topic.delete({ where: { id: topicId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_topic",
        entityType: "topic",
        entityId: topicId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Lessons (admin list + CRUD) ----------
contentAdminRouter.get(
  "/admin/lessons",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      published: z.enum(["all", "true", "false"]).optional(),
    });
    const { published = "all" } = querySchema.parse(req.query);

    const where =
      published === "all" ? {} : { published: published === "true" };

    const lessons = await prisma.lesson.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        topic: { select: { id: true, name: true, slug: true } },
        _count: { select: { chapters: true, quizzes: true } },
      },
    });

    res.status(200).json({ lessons });
  }),
);

contentAdminRouter.get(
  "/admin/lessons/:lessonId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        topic: { select: { id: true, name: true, slug: true } },
        chapters: { orderBy: { order: "asc" } },
        quizzes: {
          orderBy: { order: "asc" },
          include: {
            translations: {
              orderBy: [{ language: "asc" }, { createdAt: "desc" }],
            },
          },
        },
        translations: { orderBy: [{ language: "asc" }, { createdAt: "desc" }] },
      },
    });

    if (!lesson) throw new HttpError(404, "Lesson not found");
    res.status(200).json({ lesson });
  }),
);

contentAdminRouter.post(
  "/admin/lessons",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      title: z.string().min(1).max(300),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().max(10000).optional().nullable(),
      content: z.string().default(""),
      hook: z.string().max(2000).optional().nullable(),
      coverImage: z.string().url().optional().nullable().or(z.literal("")),
      xpReward: z.number().int().min(0).optional(),
      isPremium: z.boolean().optional(),
      published: z.boolean().optional(),
      order: z.number().int().optional(),
      categoryId: z.string().optional().nullable(),
      topicId: z.string().optional().nullable(),
      deepDiveContent: z.string().optional().nullable(),
      titleAudioUrl: z.string().url().optional().nullable(), // NEW
      hookAudioUrl: z.string().url().optional().nullable(), // NEW
      contentAudioUrl: z.string().url().optional().nullable(), // NEW
      deepDiveAudioUrl: z.string().url().optional().nullable(), // NEW
    });
    const body = bodySchema.parse(req.body);
    const slug = body.slug?.trim() || (await uniqueLessonSlug(body.title));

    const clash = await prisma.lesson.findUnique({ where: { slug } });
    if (clash) throw new HttpError(409, "Slug already in use");

    const lesson = await prisma.lesson.create({
      data: {
        title: body.title.trim(),
        slug,
        description: body.description ?? undefined,
        content: body.content,
        hook: body.hook ?? undefined,
        coverImage: body.coverImage || undefined,
        xpReward: body.xpReward ?? 10,
        isPremium: body.isPremium ?? false,
        published: body.published ?? false,
        order: body.order ?? 0,
        categoryId: body.categoryId ?? undefined,
        topicId: body.topicId ?? undefined,
        deepDiveContent: body.deepDiveContent ?? undefined,
        titleAudioUrl: body.titleAudioUrl ?? undefined, // NEW
        hookAudioUrl: body.hookAudioUrl ?? undefined, // NEW
        contentAudioUrl: body.contentAudioUrl ?? undefined, // NEW
        deepDiveAudioUrl: body.deepDiveAudioUrl ?? undefined, // NEW
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_lesson",
        entityType: "lesson",
        entityId: lesson.id,
        changes: { title: lesson.title, slug: lesson.slug },
      },
    });

    res.status(201).json({ lesson });
  }),
);

contentAdminRouter.patch(
  "/admin/lessons/:lessonId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      title: z.string().min(1).max(300).optional(),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().max(10000).optional().nullable(),
      content: z.string().optional(),
      hook: z.string().max(2000).optional().nullable(),
      coverImage: z.string().url().optional().nullable().or(z.literal("")),
      xpReward: z.number().int().min(0).optional(),
      isPremium: z.boolean().optional(),
      published: z.boolean().optional(),
      order: z.number().int().optional(),
      categoryId: z.string().optional().nullable(),
      topicId: z.string().optional().nullable(),
      deepDiveContent: z.string().optional().nullable(),
      titleAudioUrl: z.string().url().optional().nullable(), // NEW
      hookAudioUrl: z.string().url().optional().nullable(), // NEW
      contentAudioUrl: z.string().url().optional().nullable(), // NEW
      deepDiveAudioUrl: z.string().url().optional().nullable(), // NEW
    });
    const body = bodySchema.parse(req.body);

    const found = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!found) throw new HttpError(404, "Lesson not found");

    let slug = body.slug?.trim();
    if (slug && slug !== found.slug) {
      const clash = await prisma.lesson.findUnique({ where: { slug } });
      if (clash) throw new HttpError(409, "Slug already in use");
    } else if (!slug && body.title && body.title !== found.title) {
      slug = await uniqueLessonSlug(body.title, lessonId);
    }

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: body.title?.trim() ?? undefined,
        slug: slug ?? undefined,
        description:
          body.description === undefined ? undefined : body.description,
        content: body.content ?? undefined,
        hook: body.hook === undefined ? undefined : body.hook,
        coverImage:
          body.coverImage === undefined ? undefined : body.coverImage || null,
        xpReward: body.xpReward ?? undefined,
        isPremium: body.isPremium ?? undefined,
        published: body.published ?? undefined,
        order: body.order ?? undefined,
        categoryId: body.categoryId === undefined ? undefined : body.categoryId,
        topicId: body.topicId === undefined ? undefined : body.topicId,
        deepDiveContent:
          body.deepDiveContent === undefined ? undefined : body.deepDiveContent,
        titleAudioUrl:
          body.titleAudioUrl === undefined ? undefined : body.titleAudioUrl, // NEW
        hookAudioUrl:
          body.hookAudioUrl === undefined ? undefined : body.hookAudioUrl, // NEW
        contentAudioUrl:
          body.contentAudioUrl === undefined ? undefined : body.contentAudioUrl, // NEW
        deepDiveAudioUrl:
          body.deepDiveAudioUrl === undefined
            ? undefined
            : body.deepDiveAudioUrl, // NEW
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_lesson",
        entityType: "lesson",
        entityId: lessonId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ lesson });
  }),
);

contentAdminRouter.delete(
  "/admin/lessons/:lessonId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    await prisma.lesson.delete({ where: { id: lessonId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_lesson",
        entityType: "lesson",
        entityId: lessonId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Chapters ----------
contentAdminRouter.post(
  "/admin/lessons/:lessonId/chapters",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      title: z.string().min(1).max(300),
      content: z.string().min(1),
      coverImage: z.string().url().optional().nullable().or(z.literal("")),
      mediaType: z.string().max(50).optional().nullable(),
      mediaUrl: z.string().url().optional().nullable().or(z.literal("")),
      feedbackQuestion: z.string().max(2000).optional().nullable(),
      order: z.number().int().optional(),
    });
    const body = bodySchema.parse(req.body);

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new HttpError(404, "Lesson not found");

    const chapter = await prisma.chapter.create({
      data: {
        lessonId,
        title: body.title.trim(),
        content: body.content,
        coverImage: body.coverImage || undefined,
        mediaType: body.mediaType ?? undefined,
        mediaUrl: body.mediaUrl || undefined,
        feedbackQuestion: body.feedbackQuestion ?? undefined,
        order: body.order ?? 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_chapter",
        entityType: "chapter",
        entityId: chapter.id,
        changes: { lessonId, title: chapter.title },
      },
    });

    res.status(201).json({ chapter });
  }),
);

contentAdminRouter.patch(
  "/admin/chapters/:chapterId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ chapterId: z.string().min(1) });
    const { chapterId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      title: z.string().min(1).max(300).optional(),
      content: z.string().min(1).optional(),
      coverImage: z.string().url().optional().nullable().or(z.literal("")),
      mediaType: z.string().max(50).optional().nullable(),
      mediaUrl: z.string().url().optional().nullable().or(z.literal("")),
      feedbackQuestion: z.string().max(2000).optional().nullable(),
      order: z.number().int().optional(),
    });
    const body = bodySchema.parse(req.body);

    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        title: body.title?.trim() ?? undefined,
        content: body.content ?? undefined,
        coverImage:
          body.coverImage === undefined ? undefined : body.coverImage || null,
        mediaType: body.mediaType === undefined ? undefined : body.mediaType,
        mediaUrl:
          body.mediaUrl === undefined ? undefined : body.mediaUrl || null,
        feedbackQuestion:
          body.feedbackQuestion === undefined
            ? undefined
            : body.feedbackQuestion,
        order: body.order ?? undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_chapter",
        entityType: "chapter",
        entityId: chapterId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ chapter });
  }),
);

contentAdminRouter.delete(
  "/admin/chapters/:chapterId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ chapterId: z.string().min(1) });
    const { chapterId } = paramsSchema.parse(req.params);

    await prisma.chapter.delete({ where: { id: chapterId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_chapter",
        entityType: "chapter",
        entityId: chapterId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Quizzes ----------
contentAdminRouter.post(
  "/admin/lessons/:lessonId/quizzes",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      question: z.string().min(1),
      options: z.array(z.string()).min(2),
      correctOption: z.number().int().min(0).optional().nullable(),
      explanation: z.string().optional().nullable(),
      order: z.number().int().optional(),
      heartLimit: z.number().int().min(0).optional(),
      timeLimitSeconds: z.number().int().positive().optional().nullable(),
      difficulty: z.string().max(50).optional().nullable(),
      isActive: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      topicId: z.string().optional().nullable(),
      questionAudioUrl: z.string().url().optional().nullable(), // NEW
      isPoll: z.boolean().optional(), // NEW
      pollDescription: z.string().optional().nullable(), // NEW
    });
    const body = bodySchema.parse(req.body);

    // Validate poll questions should not have correctOption
    if (
      body.isPoll &&
      body.correctOption !== null &&
      body.correctOption !== undefined
    ) {
      throw new HttpError(
        400,
        "Poll questions should not have a correct answer",
      );
    }

    // Validate regular quizzes must have correctOption
    if (
      !body.isPoll &&
      (body.correctOption === null || body.correctOption === undefined)
    ) {
      throw new HttpError(
        400,
        "Regular quiz questions must have a correct answer",
      );
    }

    if (
      body.correctOption !== null &&
      body.correctOption !== undefined &&
      body.correctOption >= body.options.length
    ) {
      throw new HttpError(400, "correctOption index out of range");
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new HttpError(404, "Lesson not found");

    const quiz = await prisma.quiz.create({
      data: {
        lessonId,
        question: body.question.trim(),
        options: body.options,
        correctOption: body.isPoll ? null : body.correctOption,
        explanation: body.isPoll ? null : (body.explanation ?? undefined),
        order: body.order ?? 0,
        heartLimit: body.isPoll ? undefined : (body.heartLimit ?? 4),
        timeLimitSeconds: body.timeLimitSeconds ?? undefined,
        difficulty: body.isPoll ? null : (body.difficulty ?? undefined),
        isActive: body.isActive ?? true,
        tags: body.tags ?? [],
        topicId: body.topicId ?? undefined,
        questionAudioUrl: body.questionAudioUrl ?? undefined, // NEW
        isPoll: body.isPoll ?? false, // NEW
        pollDescription: body.pollDescription ?? undefined, // NEW
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_quiz",
        entityType: "quiz",
        entityId: quiz.id,
        changes: { lessonId, question: quiz.question, isPoll: body.isPoll },
      },
    });

    res.status(201).json({ quiz });
  }),
);

// GET /content/admin/lessons/:lessonId/quizzes
// Get all quizzes for a specific lesson (admin)
contentAdminRouter.get(
  "/admin/lessons/:lessonId/quizzes",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    // Verify lesson exists
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) throw new HttpError(404, "Lesson not found");

    const quizzes = await prisma.quiz.findMany({
      where: { lessonId },
      orderBy: { order: "asc" },
    });

    // Helper to safely parse JSON fields
    const safeJsonArray = (value: unknown): string[] => {
      if (Array.isArray(value)) return value as string[];
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const safeJsonObject = (value: unknown): Record<string, number> | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === "object" && !Array.isArray(value))
        return value as Record<string, number>;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return typeof parsed === "object" ? parsed : null;
        } catch {
          return null;
        }
      }
      return null;
    };

    // Transform quizzes to ensure proper JSON serialization
    const transformedQuizzes = quizzes.map((quiz) => ({
      id: quiz.id,
      lessonId: quiz.lessonId,
      question: quiz.question,
      type: quiz.type,
      options: safeJsonArray(quiz.options),
      optionImages: Array.isArray(quiz.optionImages)
        ? quiz.optionImages
        : safeJsonArray(quiz.optionImages),
      correctOption: quiz.correctOption,
      explanation: quiz.explanation,
      order: quiz.order,
      heartLimit: quiz.heartLimit,
      timeLimitSeconds: quiz.timeLimitSeconds,
      difficulty: quiz.difficulty,
      isActive: quiz.isActive,
      tags: quiz.tags,
      topicId: quiz.topicId,
      questionAudioUrl: quiz.questionAudioUrl,
      isPoll: quiz.isPoll,
      pollDescription: quiz.pollDescription,
      pollResults: safeJsonObject(quiz.pollResults),
      totalPollVotes: quiz.totalPollVotes,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
    }));

    res.status(200).json({ quizzes: transformedQuizzes });
  }),
);

contentAdminRouter.patch(
  "/admin/quizzes/:quizId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      question: z.string().min(1).optional(),
      options: z.array(z.string()).min(2).optional(),
      correctOption: z.number().int().min(0).optional().nullable(),
      explanation: z.string().optional().nullable(),
      order: z.number().int().optional(),
      heartLimit: z.number().int().min(0).optional(),
      timeLimitSeconds: z.number().int().positive().optional().nullable(),
      difficulty: z.string().max(50).optional().nullable(),
      isActive: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      topicId: z.string().optional().nullable(),
      questionAudioUrl: z.string().url().optional().nullable(), // NEW
      isPoll: z.boolean().optional(), // NEW
      pollDescription: z.string().optional().nullable(), // NEW
    });
    const body = bodySchema.parse(req.body);

    const existing = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!existing) throw new HttpError(404, "Quiz not found");

    const options = body.options ?? (existing.options as unknown as string[]);
    const correctOption = body.correctOption ?? existing.correctOption;
    const isPoll = body.isPoll ?? existing.isPoll;

    // Validate poll questions should not have correctOption
    if (isPoll && correctOption !== null && correctOption !== undefined) {
      throw new HttpError(
        400,
        "Poll questions should not have a correct answer",
      );
    }

    // Validate regular quizzes must have correctOption
    if (!isPoll && (correctOption === null || correctOption === undefined)) {
      throw new HttpError(
        400,
        "Regular quiz questions must have a correct answer",
      );
    }

    if (
      correctOption !== null &&
      correctOption !== undefined &&
      correctOption >= options.length
    ) {
      throw new HttpError(400, "correctOption index out of range");
    }

    const quiz = await prisma.quiz.update({
      where: { id: quizId },
      data: {
        question: body.question?.trim() ?? undefined,
        options: body.options ?? undefined,
        correctOption: isPoll ? null : (body.correctOption ?? undefined),
        explanation: isPoll
          ? null
          : body.explanation === undefined
            ? undefined
            : body.explanation,
        order: body.order ?? undefined,
        heartLimit: isPoll ? undefined : (body.heartLimit ?? undefined),
        timeLimitSeconds:
          body.timeLimitSeconds === undefined
            ? undefined
            : body.timeLimitSeconds,
        difficulty: isPoll
          ? null
          : body.difficulty === undefined
            ? undefined
            : body.difficulty,
        isActive: body.isActive ?? undefined,
        tags: body.tags ?? undefined,
        topicId: body.topicId === undefined ? undefined : body.topicId,
        questionAudioUrl:
          body.questionAudioUrl === undefined
            ? undefined
            : body.questionAudioUrl, // NEW
        isPoll: body.isPoll ?? undefined, // NEW
        pollDescription:
          body.pollDescription === undefined ? undefined : body.pollDescription, // NEW
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_quiz",
        entityType: "quiz",
        entityId: quizId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ quiz });
  }),
);

contentAdminRouter.delete(
  "/admin/quizzes/:quizId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);

    await prisma.quiz.delete({ where: { id: quizId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_quiz",
        entityType: "quiz",
        entityId: quizId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Quiz translations ----------
contentAdminRouter.get(
  "/admin/quizzes/:quizId/translations",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);

    const translations = await prisma.quizTranslation.findMany({
      where: { quizId },
      orderBy: [{ language: "asc" }, { createdAt: "desc" }],
    });

    res.status(200).json({ translations });
  }),
);

contentAdminRouter.post(
  "/admin/quizzes/:quizId/translations",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      language: z.string().min(2).max(10),
      question: z.string().min(1),
      options: z.array(z.string()).min(2),
      explanation: z.string().optional().nullable(),
      pollDescription: z.string().optional().nullable(), // NEW
    });
    const body = bodySchema.parse(req.body);

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, options: true, correctOption: true, isPoll: true },
    });
    if (!quiz) throw new HttpError(404, "Quiz not found");

    const baseOptions = quiz.options as unknown as string[];
    if (body.options.length !== baseOptions.length) {
      throw new HttpError(
        400,
        `Translated options must have the same length as the base quiz (${baseOptions.length})`,
      );
    }
    if (
      !quiz.isPoll &&
      quiz.correctOption !== null &&
      quiz.correctOption >= body.options.length
    ) {
      throw new HttpError(400, "Base quiz correctOption index is invalid");
    }

    const existing = await prisma.quizTranslation.findFirst({
      where: { quizId, language: body.language },
      select: { id: true },
    });
    if (existing)
      throw new HttpError(409, "Translation for this language already exists");

    const translation = await prisma.quizTranslation.create({
      data: {
        quizId,
        language: body.language,
        question: body.question.trim(),
        options: body.options,
        explanation: quiz.isPoll ? null : (body.explanation ?? undefined),
        pollDescription: body.pollDescription ?? undefined, // NEW
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_quiz_translation",
        entityType: "quiz_translation",
        entityId: translation.id,
        changes: jsonChanges({ quizId, language: translation.language }),
      },
    });

    res.status(201).json({ translation });
  }),
);

contentAdminRouter.patch(
  "/admin/quiz-translations/:translationId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ translationId: z.string().min(1) });
    const { translationId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      language: z.string().min(2).max(10).optional(),
      question: z.string().min(1).optional(),
      options: z.array(z.string()).min(2).optional(),
      explanation: z.string().optional().nullable(),
      pollDescription: z.string().optional().nullable(), // NEW
    });
    const body = bodySchema.parse(req.body);

    const existing = await prisma.quizTranslation.findUnique({
      where: { id: translationId },
      include: {
        quiz: {
          select: {
            id: true,
            options: true,
            correctOption: true,
            isPoll: true,
          },
        },
      },
    });
    if (!existing) throw new HttpError(404, "Quiz translation not found");

    const baseOptions = existing.quiz.options as unknown as string[];
    const nextOptions =
      body.options ?? (existing.options as unknown as string[]);
    if (nextOptions.length !== baseOptions.length) {
      throw new HttpError(
        400,
        `Translated options must have the same length as the base quiz (${baseOptions.length})`,
      );
    }

    const language = body.language?.trim();
    if (language && language !== existing.language) {
      const clash = await prisma.quizTranslation.findFirst({
        where: { quizId: existing.quizId, language },
        select: { id: true },
      });
      if (clash)
        throw new HttpError(
          409,
          "Translation for this language already exists",
        );
    }

    const translation = await prisma.quizTranslation.update({
      where: { id: translationId },
      data: {
        language: language ?? undefined,
        question: body.question?.trim() ?? undefined,
        options: body.options ?? undefined,
        explanation: existing.quiz.isPoll
          ? null
          : body.explanation === undefined
            ? undefined
            : body.explanation,
        pollDescription:
          body.pollDescription === undefined ? undefined : body.pollDescription, // NEW
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_quiz_translation",
        entityType: "quiz_translation",
        entityId: translationId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ translation });
  }),
);

contentAdminRouter.delete(
  "/admin/quiz-translations/:translationId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ translationId: z.string().min(1) });
    const { translationId } = paramsSchema.parse(req.params);

    await prisma.quizTranslation.delete({ where: { id: translationId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_quiz_translation",
        entityType: "quiz_translation",
        entityId: translationId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Lesson translations ----------
contentAdminRouter.get(
  "/admin/lessons/:lessonId/translations",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    const translations = await prisma.lessonTranslation.findMany({
      where: { lessonId },
      orderBy: [{ language: "asc" }, { createdAt: "desc" }],
    });

    res.status(200).json({ translations });
  }),
);

contentAdminRouter.post(
  "/admin/lessons/:lessonId/translations",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      language: z.string().min(2).max(10),
      title: z.string().min(1).max(300),
      description: z.string().max(10000).optional().nullable(),
      content: z.string().min(1),
      hook: z.string().max(2000).optional().nullable(),
      deepDiveContent: z.string().optional().nullable(),
    });
    const body = bodySchema.parse(req.body);

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) throw new HttpError(404, "Lesson not found");

    const existing = await prisma.lessonTranslation.findFirst({
      where: {
        lessonId,
        language: body.language,
      },
      select: { id: true },
    });
    if (existing) {
      throw new HttpError(409, "Translation for this language already exists");
    }

    const translation = await prisma.lessonTranslation.create({
      data: {
        lessonId,
        language: body.language,
        title: body.title,
        description: body.description ?? undefined,
        content: body.content,
        hook: body.hook ?? undefined,
        deepDiveContent: body.deepDiveContent ?? undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_lesson_translation",
        entityType: "lesson_translation",
        entityId: translation.id,
        changes: jsonChanges({
          lessonId,
          language: translation.language,
        }),
      },
    });

    res.status(201).json({ translation });
  }),
);

contentAdminRouter.patch(
  "/admin/translations/:translationId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ translationId: z.string().min(1) });
    const { translationId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      language: z.string().min(2).max(10).optional(),
      title: z.string().min(1).max(300).optional(),
      description: z.string().max(10000).optional().nullable(),
      content: z.string().min(1).optional(),
      hook: z.string().max(2000).optional().nullable(),
      deepDiveContent: z.string().optional().nullable(),
    });
    const body = bodySchema.parse(req.body);

    const existing = await prisma.lessonTranslation.findUnique({
      where: { id: translationId },
      select: { id: true, lessonId: true, language: true },
    });
    if (!existing) throw new HttpError(404, "Translation not found");

    const language = body.language?.trim();
    if (language && language !== existing.language) {
      const languageClash = await prisma.lessonTranslation.findFirst({
        where: { lessonId: existing.lessonId, language },
        select: { id: true },
      });
      if (languageClash) {
        throw new HttpError(
          409,
          "Translation for this language already exists",
        );
      }
    }

    const translation = await prisma.lessonTranslation.update({
      where: { id: translationId },
      data: {
        language: language ?? undefined,
        title: body.title ?? undefined,
        description:
          body.description === undefined ? undefined : body.description,
        content: body.content ?? undefined,
        hook: body.hook === undefined ? undefined : body.hook,
        deepDiveContent:
          body.deepDiveContent === undefined ? undefined : body.deepDiveContent,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_lesson_translation",
        entityType: "lesson_translation",
        entityId: translationId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ translation });
  }),
);

contentAdminRouter.delete(
  "/admin/translations/:translationId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ translationId: z.string().min(1) });
    const { translationId } = paramsSchema.parse(req.params);

    await prisma.lessonTranslation.delete({ where: { id: translationId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_lesson_translation",
        entityType: "lesson_translation",
        entityId: translationId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Characters ----------
contentAdminRouter.get(
  "/admin/characters",
  requireAuth,
  adminRoles,
  asyncHandler(async (_req, res) => {
    const characters = await prisma.character.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        unlockLesson: { select: { id: true, title: true, slug: true } },
      },
    });
    res.status(200).json({ characters });
  }),
);

contentAdminRouter.get(
  "/admin/characters/:characterId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ characterId: z.string().min(1) });
    const { characterId } = paramsSchema.parse(req.params);

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        unlockLesson: { select: { id: true, title: true, slug: true } },
        translations: { orderBy: [{ language: "asc" }, { createdAt: "desc" }] },
      },
    });

    if (!character) throw new HttpError(404, "Character not found");
    res.status(200).json({ character });
  }),
);

contentAdminRouter.post(
  "/admin/characters",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().min(1).max(10000),
      story: z.string().max(50000).optional().nullable(),
      imageUrl: z.string().url().optional().nullable().or(z.literal("")),
      inventionImage: z.string().url().optional().nullable().or(z.literal("")),
      xpThreshold: z.number().int().optional().nullable(),
      rarityLevel: z.string().max(50).optional().nullable(),
      categoryIds: z.array(z.string()).optional().default([]),
      unlockLessonId: z.string().optional().nullable(),
    });
    const body = bodySchema.parse(req.body);
    const slug = body.slug?.trim() || (await uniqueCharacterSlug(body.name));

    const clash = await prisma.character.findUnique({ where: { slug } });
    if (clash) throw new HttpError(409, "Slug already in use");

    const character = await prisma.character.create({
      data: {
        name: body.name.trim(),
        slug,
        description: body.description,
        story: body.story ?? undefined,
        imageUrl: body.imageUrl || undefined,
        inventionImage: body.inventionImage || undefined,
        xpThreshold: body.xpThreshold ?? undefined,
        rarityLevel: body.rarityLevel ?? undefined,
        unlockLessonId: body.unlockLessonId ?? undefined,
        // Create character-category relationships
        categories: {
          create: body.categoryIds.map((categoryId) => ({
            categoryId,
          })),
        },
      },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        unlockLesson: { select: { id: true, title: true, slug: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_character",
        entityType: "character",
        entityId: character.id,
        changes: { name: character.name, slug: character.slug },
      },
    });

    res.status(201).json({ character });
  }),
);

contentAdminRouter.patch(
  "/admin/characters/:characterId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ characterId: z.string().min(1) });
    const { characterId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      name: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().min(1).max(10000).optional(),
      story: z.string().max(50000).optional().nullable(),
      imageUrl: z.string().url().optional().nullable().or(z.literal("")),
      inventionImage: z.string().url().optional().nullable().or(z.literal("")),
      xpThreshold: z.number().int().optional().nullable(),
      rarityLevel: z.string().max(50).optional().nullable(),
      categoryIds: z.array(z.string()).optional(),
      unlockLessonId: z.string().optional().nullable(),
    });
    const body = bodySchema.parse(req.body);

    const found = await prisma.character.findUnique({
      where: { id: characterId },
    });
    if (!found) throw new HttpError(404, "Character not found");

    let slug = body.slug?.trim();
    if (slug && slug !== found.slug) {
      const clash = await prisma.character.findUnique({ where: { slug } });
      if (clash) throw new HttpError(409, "Slug already in use");
    }

    // If categoryIds is provided, update the categories
    if (body.categoryIds !== undefined) {
      // Delete existing category relationships
      await prisma.characterCategory.deleteMany({ where: { characterId } });
      // Create new ones
      if (body.categoryIds.length > 0) {
        await prisma.characterCategory.createMany({
          data: body.categoryIds.map((categoryId) => ({
            characterId,
            categoryId,
          })),
        });
      }
    }

    const character = await prisma.character.update({
      where: { id: characterId },
      data: {
        name: body.name?.trim() ?? undefined,
        slug: slug ?? undefined,
        description: body.description ?? undefined,
        story: body.story === undefined ? undefined : body.story,
        imageUrl:
          body.imageUrl === undefined ? undefined : body.imageUrl || null,
        inventionImage:
          body.inventionImage === undefined
            ? undefined
            : body.inventionImage || null,
        xpThreshold:
          body.xpThreshold === undefined ? undefined : body.xpThreshold,
        rarityLevel:
          body.rarityLevel === undefined ? undefined : body.rarityLevel,
        unlockLessonId:
          body.unlockLessonId === undefined ? undefined : body.unlockLessonId,
      },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        unlockLesson: { select: { id: true, title: true, slug: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_character",
        entityType: "character",
        entityId: characterId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ character });
  }),
);

contentAdminRouter.delete(
  "/admin/characters/:characterId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ characterId: z.string().min(1) });
    const { characterId } = paramsSchema.parse(req.params);

    await prisma.character.delete({ where: { id: characterId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_character",
        entityType: "character",
        entityId: characterId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);

// ---------- Character translations ----------
contentAdminRouter.get(
  "/admin/characters/:characterId/translations",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ characterId: z.string().min(1) });
    const { characterId } = paramsSchema.parse(req.params);

    const translations = await prisma.characterTranslation.findMany({
      where: { characterId },
      orderBy: [{ language: "asc" }, { createdAt: "desc" }],
    });

    res.status(200).json({ translations });
  }),
);

contentAdminRouter.post(
  "/admin/characters/:characterId/translations",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ characterId: z.string().min(1) });
    const { characterId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      language: z.string().min(2).max(10),
      name: z.string().min(1).max(200),
      description: z.string().min(1).max(10000),
      story: z.string().max(50000).optional().nullable(),
    });
    const body = bodySchema.parse(req.body);

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true },
    });
    if (!character) throw new HttpError(404, "Character not found");

    const existing = await prisma.characterTranslation.findFirst({
      where: { characterId, language: body.language },
      select: { id: true },
    });
    if (existing)
      throw new HttpError(409, "Translation for this language already exists");

    const translation = await prisma.characterTranslation.create({
      data: {
        characterId,
        language: body.language,
        name: body.name.trim(),
        description: body.description,
        story: body.story ?? undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "create_character_translation",
        entityType: "character_translation",
        entityId: translation.id,
        changes: jsonChanges({ characterId, language: translation.language }),
      },
    });

    res.status(201).json({ translation });
  }),
);

contentAdminRouter.patch(
  "/admin/character-translations/:translationId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ translationId: z.string().min(1) });
    const { translationId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      language: z.string().min(2).max(10).optional(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().min(1).max(10000).optional(),
      story: z.string().max(50000).optional().nullable(),
    });
    const body = bodySchema.parse(req.body);

    const existing = await prisma.characterTranslation.findUnique({
      where: { id: translationId },
      select: { id: true, characterId: true, language: true },
    });
    if (!existing) throw new HttpError(404, "Character translation not found");

    const language = body.language?.trim();
    if (language && language !== existing.language) {
      const clash = await prisma.characterTranslation.findFirst({
        where: { characterId: existing.characterId, language },
        select: { id: true },
      });
      if (clash)
        throw new HttpError(
          409,
          "Translation for this language already exists",
        );
    }

    const translation = await prisma.characterTranslation.update({
      where: { id: translationId },
      data: {
        language: language ?? undefined,
        name: body.name?.trim() ?? undefined,
        description: body.description ?? undefined,
        story: body.story === undefined ? undefined : body.story,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "update_character_translation",
        entityType: "character_translation",
        entityId: translationId,
        changes: jsonChanges(body),
      },
    });

    res.status(200).json({ translation });
  }),
);

contentAdminRouter.delete(
  "/admin/character-translations/:translationId",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ translationId: z.string().min(1) });
    const { translationId } = paramsSchema.parse(req.params);

    await prisma.characterTranslation.delete({ where: { id: translationId } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: "delete_character_translation",
        entityType: "character_translation",
        entityId: translationId,
        changes: {},
      },
    });

    res.status(204).send();
  }),
);
