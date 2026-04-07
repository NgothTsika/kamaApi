import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { HttpError } from "../../lib/errors";
import {
  onQuizFailure,
  onQuizSuccess,
} from "../gamification/gamification.integration";

export const quizRouter = Router();

const startQuizSessionBodySchema = z.object({
  quizId: z.string().min(1),
});

quizRouter.post(
  "/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { quizId } = startQuizSessionBodySchema.parse(req.body);

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        isActive: true,
        heartLimit: true,
      },
    });
    if (!quiz) throw new HttpError(404, "Quiz not found");
    if (!quiz.isActive) throw new HttpError(400, "Quiz is disabled");

    const session = await prisma.quizSession.create({
      data: {
        userId: req.user!.id,
        quizId: quiz.id,
        heartsRemaining: quiz.heartLimit ?? 4,
      },
    });

    res.status(201).json({ sessionId: session.id });
  }),
);

quizRouter.get(
  "/sessions/:sessionId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ sessionId: z.string().min(1) });
    const { sessionId } = paramsSchema.parse(req.params);

    const session = await prisma.quizSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        quizId: true,
        heartsRemaining: true,
        startedAt: true,
        completedAt: true,
        passed: true,
        quiz: {
          select: {
            id: true,
            question: true,
            options: true,
            explanation: true,
            heartLimit: true,
            difficulty: true,
            timeLimitSeconds: true,
            tags: true,
            // correctOption intentionally omitted from responses
          },
        },
        attempts: {
          select: {
            id: true,
            selectedOption: true,
            isCorrect: true,
            heartLost: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });

    if (!session) throw new HttpError(404, "Session not found");
    if (session.userId !== req.user!.id) throw new HttpError(403, "Forbidden");

    res.status(200).json({ session });
  }),
);

const answerQuizBodySchema = z.object({
  selectedOption: z.number().int().min(0),
});

quizRouter.post(
  "/sessions/:sessionId/answer",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ sessionId: z.string().min(1) });
    const { sessionId } = paramsSchema.parse(req.params);
    const { selectedOption } = answerQuizBodySchema.parse(req.body);

    const transactionResult = await prisma.$transaction(async (tx) => {
      const session = await tx.quizSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          userId: true,
          quizId: true,
          heartsRemaining: true,
          completedAt: true,
        },
      });

      if (!session) throw new HttpError(404, "Session not found");
      if (session.userId !== req.user!.id)
        throw new HttpError(403, "Forbidden");
      if (session.completedAt)
        throw new HttpError(409, "Session already completed");

      const quiz = await tx.quiz.findUnique({
        where: { id: session.quizId },
        select: {
          id: true,
          correctOption: true,
          lesson: { select: { id: true, xpReward: true } },
        },
      });
      if (!quiz) throw new HttpError(404, "Quiz not found");

      const isCorrect = selectedOption === quiz.correctOption;
      const heartLost = !isCorrect;
      const newHearts = heartLost
        ? Math.max(0, session.heartsRemaining - 1)
        : session.heartsRemaining;

      const attempt = await tx.quizAttempt.create({
        data: {
          sessionId: session.id,
          questionId: quiz.id,
          selectedOption,
          isCorrect,
          heartLost,
        },
      });

      const now = new Date();
      let completedAt: Date | null = null;
      let passed: boolean | null = null;

      if (isCorrect) {
        completedAt = now;
        passed = true;
      } else if (newHearts <= 0) {
        completedAt = now;
        passed = false;
      }

      await tx.quizSession.update({
        where: { id: session.id },
        data: {
          heartsRemaining: newHearts,
          completedAt,
          passed: passed ?? undefined,
        },
      });

      // Award XP to the user only on first correct completion
      if (isCorrect && passed) {
        const xpEarned = quiz.lesson?.xpReward ?? 10;
        await tx.user.update({
          where: { id: req.user!.id },
          data: { xp: { increment: xpEarned } },
        });
        await tx.leaderboard.upsert({
          where: { userId: req.user!.id },
          create: { userId: req.user!.id, totalXp: xpEarned },
          update: { totalXp: { increment: xpEarned } },
        });
      }

      return {
        attempt,
        heartsRemaining: newHearts,
        completedAt,
        passed,
        isCorrect,
      };
    });

    // Build response with gamification data
    const payload: any = {
      attempt: transactionResult.attempt,
      heartsRemaining: transactionResult.heartsRemaining,
      completedAt: transactionResult.completedAt,
      passed: transactionResult.passed,
    };

    // Trigger gamification integration after transaction completes
    try {
      if (transactionResult.isCorrect) {
        // On success: record activity and award XP bonus
        const gamificationResult = await onQuizSuccess(req.user!.id, 5);
        payload.gamification = gamificationResult;
      } else if (transactionResult.completedAt && !transactionResult.passed) {
        // On failure: lose heart and get motivational message
        const gamificationResult = await onQuizFailure(req.user!.id, "quiz");
        payload.gamification = gamificationResult;
      }
    } catch (error) {
      console.error("Gamification integration error:", error);
      // Don't fail the response, just log the error
    }

    res.status(200).json(payload);
  }),
);
