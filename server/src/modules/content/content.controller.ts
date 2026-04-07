import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { contentAdminRouter } from "./content-admin.controller";
import { pollRouter } from "../quiz/poll.controller"; // NEW: Import poll router

/** Merge localized quiz copy when `translations` was loaded for a single language; strip `translations` from the payload. */
function applyQuizLanguage<
  T extends {
    question: string;
    options: unknown;
    explanation: string | null;
    translations?:
      | { question: string; options: unknown; explanation: string | null }[]
      | false
      | null;
  },
>(quiz: T): Omit<T, "translations"> {
  const list = quiz.translations;
  const tr = Array.isArray(list) && list.length > 0 ? list[0] : null;
  const { translations: _t, ...rest } = quiz;
  if (!tr) return rest;
  return {
    ...rest,
    question: tr.question,
    options: tr.options,
    explanation: tr.explanation,
  } as Omit<T, "translations">;
}

export const contentRouter = Router();
contentRouter.use(contentAdminRouter);
contentRouter.use(pollRouter); // NEW: Mount poll router

contentRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        coverImage: true,
        icon: true,
      },
    });

    res.status(200).json({ categories });
  }),
);

contentRouter.get(
  "/lessons",
  asyncHandler(async (req, res) => {
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;
    const lessons = await prisma.lesson.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        hook: true,
        coverImage: true,
        xpReward: true,
        isPremium: true,
        category: { select: { id: true, name: true, slug: true } },
        translations: language
          ? {
              where: { language },
              take: 1,
              select: {
                title: true,
                description: true,
                hook: true,
              },
            }
          : false,
      },
    });

    res.status(200).json({ lessons });
  }),
);

contentRouter.get(
  "/characters",
  asyncHandler(async (req, res) => {
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;
    const characters = await prisma.character.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        translations: language
          ? {
              where: { language },
              take: 1,
              select: {
                name: true,
                description: true,
                story: true,
              },
            }
          : undefined,
      },
    });

    res.status(200).json({ characters });
  }),
);

contentRouter.get(
  "/topics",
  asyncHandler(async (_req, res) => {
    const topics = await prisma.topic.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        coverImage: true,
        parentId: true,
      },
    });
    res.status(200).json({ topics });
  }),
);

contentRouter.get(
  "/lessons/slug/:slug",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ slug: z.string().min(1) });
    const { slug } = paramsSchema.parse(req.params);
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;

    const lesson = await prisma.lesson.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        hook: true,
        content: true,
        coverImage: true,
        xpReward: true,
        isPremium: true,
        titleAudioUrl: true, // NEW: Audio for lesson title
        hookAudioUrl: true, // NEW: Audio for intro/hook
        contentAudioUrl: true, // NEW: Audio narration for main content
        deepDiveAudioUrl: true, // NEW: Audio for deep dive content
        category: { select: { id: true, slug: true, name: true } },
        topic: { select: { id: true, slug: true, name: true } },
        chapters: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            order: true,
            content: true,
            mediaType: true,
            mediaUrl: true,
          },
        },
        quizzes: {
          where: { isActive: true },
          orderBy: { order: "asc" },
          select: {
            id: true,
            question: true,
            options: true,
            explanation: true,
            heartLimit: true,
            timeLimitSeconds: true,
            difficulty: true,
            tags: true,
            topicId: true,
            questionAudioUrl: true, // NEW: Audio narration for question
            isPoll: true, // NEW: Mark as poll question
            pollDescription: true, // NEW: Context for poll question
            pollResults: true, // NEW: Vote percentages per option
            totalPollVotes: true, // NEW: Total votes cast
            translations: language
              ? {
                  where: { language },
                  take: 1,
                  select: {
                    question: true,
                    options: true,
                    explanation: true,
                    pollDescription: true,
                  },
                }
              : false,
          },
        },
        translations: language
          ? {
              where: { language },
              take: 1,
              select: {
                title: true,
                description: true,
                hook: true,
                content: true,
              },
            }
          : false,
      },
    });

    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const translation =
      language && Array.isArray(lesson.translations)
        ? lesson.translations[0]
        : null;

    const normalized = translation
      ? {
          ...lesson,
          title: translation.title,
          description: translation.description,
          hook: translation.hook,
          content: translation.content,
        }
      : lesson;

    const withQuizzes =
      language && Array.isArray(normalized.quizzes)
        ? {
            ...normalized,
            quizzes: normalized.quizzes.map((q) => applyQuizLanguage(q)),
          }
        : normalized;

    res.status(200).json({ lesson: withQuizzes });
  }),
);

contentRouter.get(
  "/lessons/:lessonId",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;

    if (language) {
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          hook: true,
          content: true,
          coverImage: true,
          xpReward: true,
          isPremium: true,
          category: { select: { id: true, slug: true, name: true } },
          topic: { select: { id: true, slug: true, name: true } },
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              order: true,
              mediaType: true,
              mediaUrl: true,
            },
          },
          translations: {
            where: { language },
            take: 1,
            select: {
              title: true,
              description: true,
              hook: true,
              content: true,
            },
          },
        },
      });

      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const translation = Array.isArray(lesson.translations)
        ? lesson.translations[0]
        : null;
      res.status(200).json({
        lesson: translation
          ? {
              ...lesson,
              title: translation.title,
              description: translation.description,
              hook: translation.hook,
              content: translation.content,
            }
          : lesson,
      });
      return;
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        hook: true,
        content: true,
        coverImage: true,
        xpReward: true,
        isPremium: true,
        category: { select: { id: true, slug: true, name: true } },
        topic: { select: { id: true, slug: true, name: true } },
        chapters: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            order: true,
            mediaType: true,
            mediaUrl: true,
          },
        },
      },
    });

    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    res.status(200).json({ lesson });
  }),
);

contentRouter.get(
  "/lessons/:lessonId/chapters",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    const chapters = await prisma.chapter.findMany({
      where: { lessonId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        order: true,
        content: true,
        mediaType: true,
        mediaUrl: true,
        feedbackQuestion: true,
      },
    });

    res.status(200).json({ chapters });
  }),
);

contentRouter.get(
  "/lessons/:lessonId/quizzes",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;

    const quizzes = await prisma.quiz.findMany({
      where: { lessonId, isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        question: true,
        options: true,
        explanation: true,
        heartLimit: true,
        timeLimitSeconds: true,
        difficulty: true,
        tags: true,
        topicId: true,
        questionAudioUrl: true, // NEW: Audio narration for question
        isPoll: true, // NEW: Mark as poll question
        pollDescription: true, // NEW: Context for poll question
        pollResults: true, // NEW: Vote percentages per option
        totalPollVotes: true, // NEW: Total votes cast
        translations: language
          ? {
              where: { language },
              take: 1,
              select: {
                question: true,
                options: true,
                explanation: true,
                pollDescription: true,
              },
            }
          : false,
        // Do NOT return correctOption to the client by default.
      },
    });

    const payload = language
      ? quizzes.map((q) => applyQuizLanguage(q))
      : quizzes;

    res.status(200).json({ quizzes: payload });
  }),
);

contentRouter.get(
  "/characters/slug/:slug",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ slug: z.string().min(1) });
    const { slug } = paramsSchema.parse(req.params);
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;

    const character = await prisma.character.findUnique({
      where: { slug },
      include: {
        categories: {
          include: {
            category: { select: { id: true, slug: true, name: true } },
          },
        },
        unlockLesson: { select: { id: true, slug: true } },
        translations: language
          ? {
              where: { language },
              take: 1,
              select: { name: true, description: true, story: true },
            }
          : undefined,
      },
    });

    if (!character)
      return res.status(404).json({ error: "Character not found" });

    const translation =
      language && Array.isArray(character.translations)
        ? character.translations[0]
        : null;

    res.status(200).json({
      character: translation
        ? {
            ...character,
            name: translation.name,
            description: translation.description,
            story: translation.story,
          }
        : character,
    });
  }),
);

contentRouter.get(
  "/characters/:characterId",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ characterId: z.string().min(1) });
    const { characterId } = paramsSchema.parse(req.params);
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        categories: {
          include: {
            category: { select: { id: true, slug: true, name: true } },
          },
        },
        unlockLesson: { select: { id: true, slug: true } },
        translations: language
          ? {
              where: { language },
              take: 1,
              select: { name: true, description: true, story: true },
            }
          : undefined,
      },
    });

    if (!character)
      return res.status(404).json({ error: "Character not found" });

    const translation =
      language && Array.isArray(character.translations)
        ? character.translations[0]
        : null;

    res.status(200).json({
      character: translation
        ? {
            ...character,
            name: translation.name,
            description: translation.description,
            story: translation.story,
          }
        : character,
    });
  }),
);
