import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { HttpError } from "../../lib/errors";
import { onLessonCompleted } from "../gamification/gamification.integration";

export const progressRouter = Router();

const completeLessonBodySchema = z.object({
  // Client can pass an override; server defaults to lesson.xpReward.
  xpEarnedOverride: z.number().int().positive().optional(),
});

progressRouter.get(
  "/lessons/:lessonId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    const [lesson, completed, progress] = await Promise.all([
      prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { id: true, slug: true, title: true, xpReward: true },
      }),
      prisma.completedLesson.findUnique({
        where: {
          userId_lessonId: {
            userId: req.user!.id,
            lessonId,
          },
        },
        select: { xpEarned: true, completedAt: true },
      }),
      prisma.userProgress.findUnique({
        where: {
          userId_lessonId: {
            userId: req.user!.id,
            lessonId,
          },
        },
        select: { position: true },
      }),
    ]);

    if (!lesson) throw new HttpError(404, "Lesson not found");

    res.status(200).json({
      lesson,
      completed: completed ? { ...completed } : null,
      position: progress?.position ?? null,
    });
  }),
);

progressRouter.post(
  "/lessons/:lessonId/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const body = completeLessonBodySchema.parse(req.body);

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        xpReward: true,
        unlocksCharacter: { select: { id: true } },
      },
    });
    if (!lesson) throw new HttpError(404, "Lesson not found");

    const completed = await prisma.completedLesson.findUnique({
      where: {
        userId_lessonId: {
          userId: req.user!.id,
          lessonId,
        },
      },
    });

    const alreadyCompleted = Boolean(completed);
    const xpEarned = body.xpEarnedOverride ?? lesson.xpReward;

    await prisma.$transaction(async (tx) => {
      await tx.completedLesson.upsert({
        where: {
          userId_lessonId: {
            userId: req.user!.id,
            lessonId,
          },
        },
        create: {
          userId: req.user!.id,
          lessonId,
          xpEarned,
        },
        update: {
          xpEarned,
          // Keep original completedAt semantics via Prisma defaults.
        },
      });

      // Only grant xp the first time; updating completion won't double-award.
      if (!alreadyCompleted) {
        // Update streak: increment if completed today, reset if > 1 day ago
        const now = new Date();
        const lastActivityDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

        const user = await tx.user.findUnique({
          where: { id: req.user!.id },
          select: { lastActive: true, streak: true },
        });

        let newStreak = 1;
        if (user?.lastActive && user.lastActive > lastActivityDate) {
          // Completed within 24 hours, increment streak
          newStreak = (user.streak ?? 0) + 1;
        }
        // else: Reset to 1 if more than 24 hours

        const updatedUser = await tx.user.update({
          where: { id: req.user!.id },
          data: {
            xp: { increment: xpEarned },
            streak: newStreak,
            lastActive: now,
          },
        });

        // Ensure leaderboard row exists.
        await tx.leaderboard.upsert({
          where: { userId: req.user!.id },
          create: { userId: req.user!.id, totalXp: xpEarned },
          update: { totalXp: { increment: xpEarned } },
        });

        // Unlock eligible achievements based on XP/streak.
        const eligibleAchievements = await tx.achievement.findMany({
          where: {
            OR: [
              { xpRequired: { lte: updatedUser.xp } },
              { streakRequired: { lte: updatedUser.streak } },
            ],
          },
          select: { id: true, name: true, icon: true },
        });

        for (const a of eligibleAchievements) {
          const existing = await tx.userAchievement.findUnique({
            where: {
              userId_achievementId: {
                userId: req.user!.id,
                achievementId: a.id,
              },
            },
          });

          if (!existing) {
            // New achievement unlocked
            await tx.userAchievement.create({
              data: {
                userId: req.user!.id,
                achievementId: a.id,
              },
            });

            // Create notification for new achievement
            await tx.notification.create({
              data: {
                userId: req.user!.id,
                type: "ACHIEVEMENT_UNLOCKED",
                title: `Achievement Unlocked: ${a.name}`,
                message: `You've unlocked the "${a.name}" achievement!`,
              },
            });
          }
        }

        // Unlock character (if the lesson unlocks one) on first completion only.
        const unlockedCharacterId = lesson.unlocksCharacter?.id;
        if (unlockedCharacterId) {
          const existingCollection = await tx.collectedCharacter.findUnique({
            where: {
              userId_characterId: {
                userId: req.user!.id,
                characterId: unlockedCharacterId,
              },
            },
            select: { id: true },
          });

          if (!existingCollection) {
            // New character unlocked
            await tx.collectedCharacter.create({
              data: {
                userId: req.user!.id,
                characterId: unlockedCharacterId,
              },
            });

            // Get character info for notification
            const character = await tx.character.findUnique({
              where: { id: unlockedCharacterId },
              select: { name: true },
            });

            if (character) {
              await tx.notification.create({
                data: {
                  userId: req.user!.id,
                  type: "CHARACTER_UNLOCKED",
                  title: "New Character Unlocked!",
                  message: `You've unlocked a new character: ${character.name}`,
                },
              });
            }
          }
        }
      }
    });

    // Trigger gamification integration (streak, character XP, etc.)
    if (!alreadyCompleted) {
      try {
        // Get user's first collected character for XP allocation
        const collectedCharacter = await prisma.collectedCharacter.findFirst({
          where: { userId: req.user!.id },
          select: { characterId: true },
        });

        const gamificationResult = await onLessonCompleted(
          req.user!.id,
          lessonId,
          xpEarned,
          collectedCharacter?.characterId,
        );

        return res.status(200).json({
          ok: true,
          xpEarned,
          alreadyCompleted,
          gamification: gamificationResult,
        });
      } catch (error) {
        console.error("Gamification integration error:", error);
        // Don't fail the response, just log the error
        return res.status(200).json({ ok: true, xpEarned, alreadyCompleted });
      }
    }

    res.status(200).json({ ok: true, xpEarned, alreadyCompleted });
  }),
);

progressRouter.post(
  "/lessons/:lessonId/position",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);
    const bodySchema = z.object({
      chapterId: z.string().min(1),
      position: z.number().int().nonnegative().optional().nullable(),
    });
    const { chapterId, position } = bodySchema.parse(req.body);

    const upserted = await prisma.userProgress.upsert({
      where: {
        userId_lessonId: {
          userId: req.user!.id,
          lessonId,
        },
      },
      create: {
        userId: req.user!.id,
        lessonId,
        chapterId,
        position: position ?? undefined,
      },
      update: {
        chapterId,
        position: position ?? undefined,
      },
    });

    res.status(200).json({ ok: true, progress: upserted });
  }),
);

progressRouter.get(
  "/reading-goal",
  requireAuth,
  asyncHandler(async (req, res) => {
    const goal = await prisma.readingGoal.findUnique({
      where: { userId: req.user!.id },
    });

    res.status(200).json({ goal });
  }),
);

progressRouter.put(
  "/reading-goal",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      dailyMinutes: z.number().int().positive().max(240).default(5),
    });
    const { dailyMinutes } = bodySchema.parse(req.body);

    const goal = await prisma.readingGoal.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, dailyMinutes },
      update: { dailyMinutes },
    });

    res.status(200).json({ goal });
  }),
);

progressRouter.post(
  "/daily-activity",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      date: z.string().datetime().optional(),
      minutesRead: z.number().int().min(0).max(1000),
      goalMet: z.boolean().optional(),
    });
    const { date, minutesRead, goalMet } = bodySchema.parse(req.body);

    const day = date ? new Date(date) : new Date();
    const dayOnly = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
    );

    const activity = await prisma.dailyActivity.upsert({
      where: {
        userId_date: {
          userId: req.user!.id,
          date: dayOnly,
        },
      },
      create: {
        userId: req.user!.id,
        date: dayOnly,
        minutesRead,
        goalMet,
      },
      update: {
        minutesRead,
        goalMet,
      },
    });

    res.status(200).json({ activity });
  }),
);

progressRouter.get(
  "/collected-characters",
  requireAuth,
  asyncHandler(async (req, res) => {
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;

    if (language) {
      const collected = await prisma.collectedCharacter.findMany({
        where: { userId: req.user!.id },
        orderBy: { collectedAt: "desc" },
        include: {
          character: {
            select: {
              id: true,
              slug: true,
              rarityLevel: true,
              imageUrl: true,
              name: true,
              description: true,
              story: true,
              translations: {
                where: { language },
                take: 1,
                select: { name: true, description: true, story: true },
              },
            },
          },
          characterCard: true,
        },
      });

      res.status(200).json({
        collectedCharacters: collected.map((cc) => {
          const t = Array.isArray(cc.character.translations)
            ? cc.character.translations[0]
            : null;
          return {
            ...cc,
            character: t
              ? {
                  ...cc.character,
                  name: t.name,
                  description: t.description,
                  story: t.story,
                }
              : cc.character,
          };
        }),
      });
      return;
    }

    const collected = await prisma.collectedCharacter.findMany({
      where: { userId: req.user!.id },
      orderBy: { collectedAt: "desc" },
      include: {
        character: {
          select: {
            id: true,
            slug: true,
            rarityLevel: true,
            imageUrl: true,
            name: true,
            description: true,
            story: true,
          },
        },
        characterCard: true,
      },
    });

    res.status(200).json({ collectedCharacters: collected });
  }),
);

progressRouter.get(
  "/character-cards",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cards = await prisma.collectedCharacter.findMany({
      where: { userId: req.user!.id },
      orderBy: { collectedAt: "desc" },
      include: {
        characterCard: true,
        character: {
          select: { id: true, slug: true, name: true, imageUrl: true },
        },
      },
    });

    res.status(200).json({
      cards: cards.filter((c) => Boolean(c.characterCard)),
    });
  }),
);

progressRouter.get(
  "/achievements",
  requireAuth,
  asyncHandler(async (req, res) => {
    const achievements = await prisma.userAchievement.findMany({
      where: { userId: req.user!.id },
      orderBy: { earnedAt: "desc" },
      include: {
        achievement: {
          select: {
            id: true,
            name: true,
            description: true,
            icon: true,
            xpRequired: true,
            streakRequired: true,
          },
        },
      },
    });

    res.status(200).json({ achievements });
  }),
);

progressRouter.put(
  "/offline-enabled",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      offlineEnabled: z.boolean(),
    });
    const { offlineEnabled } = bodySchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { offlineEnabled },
      select: { id: true, offlineEnabled: true },
    });

    res.status(200).json({ user });
  }),
);

progressRouter.post(
  "/offline-content/lessons/:lessonId/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ lessonId: z.string().min(1) });
    const { lessonId } = paramsSchema.parse(req.params);

    const bodySchema = z.object({
      syncedAt: z.string().datetime().optional(),
    });
    const { syncedAt } = bodySchema.parse(req.body);
    const effectiveSyncedAt = syncedAt ? new Date(syncedAt) : new Date();

    const record = await prisma.offlineContent.upsert({
      where: {
        userId_lessonId: {
          userId: req.user!.id,
          lessonId,
        },
      },
      create: {
        userId: req.user!.id,
        lessonId,
        syncedAt: effectiveSyncedAt,
      },
      update: {
        syncedAt: effectiveSyncedAt,
      },
    });

    res.status(200).json({ record });
  }),
);

progressRouter.get(
  "/offline-content/lessons",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lessons = await prisma.offlineContent.findMany({
      where: { userId: req.user!.id },
      orderBy: { syncedAt: "desc" },
      include: {
        lesson: {
          select: {
            id: true,
            slug: true,
            title: true,
            content: true,
            coverImage: true,
          },
        },
      },
    });

    res.status(200).json({ lessons });
  }),
);
