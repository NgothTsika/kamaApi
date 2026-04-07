import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { HttpError } from "../../lib/errors";
import { loseHeart } from "../gamification/hearts.service";

export const gameRouter = Router();

const createMatchBodySchema = z.object({
  topicId: z.string().optional(),
  // Ordered list of quiz question IDs (Quiz.id) for the match rounds.
  quizPool: z.array(z.string().min(1)).min(1),
  maxRounds: z.number().int().min(1).max(50).optional(),
});

gameRouter.post(
  "/matches",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createMatchBodySchema.parse(req.body);
    const { quizPool, topicId } = body;

    // Fetch user's current hearts from gamification system
    const userHearts = await prisma.userHearts.findUnique({
      where: { userId: req.user!.id },
    });

    if (!userHearts) {
      throw new HttpError(400, "User hearts not initialized");
    }

    if (userHearts.hearts <= 0) {
      throw new HttpError(
        400,
        "You have no hearts left. Please recover hearts first.",
      );
    }

    const match = await prisma.gameMatch.create({
      data: {
        player1Id: req.user!.id,
        player2Id: undefined, // Waiting for another player to join
        winnerId: null,
        status: "WAITING",
        topicId: topicId ?? null,
        quizPool: quizPool.length <= 100 ? quizPool : quizPool.slice(0, 100),
        maxRounds: body.maxRounds ?? 5,
        playerCount: 2,
        heartsPlayer1: userHearts.hearts,
        heartsPlayer2: 0, // Player 2 will join and have their hearts set
      },
    });

    res.status(201).json({ matchId: match.id, status: "WAITING" });
  }),
);

const joinMatchBodySchema = z.object({
  matchId: z.string().min(1),
});

gameRouter.post(
  "/matches/:matchId/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ matchId: z.string().min(1) });
    const { matchId } = paramsSchema.parse(req.params);

    const match = await prisma.gameMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        player1Id: true,
        player2Id: true,
      },
    });

    if (!match) throw new HttpError(404, "Match not found");
    if (match.status !== "WAITING") {
      throw new HttpError(400, "Match is not joinable");
    }
    if (match.player1Id === req.user!.id) {
      throw new HttpError(400, "You cannot join your own match");
    }
    if (match.player2Id !== null) {
      throw new HttpError(400, "Match is already full");
    }

    // Fetch player 2's hearts from gamification system
    const player2Hearts = await prisma.userHearts.findUnique({
      where: { userId: req.user!.id },
    });

    if (!player2Hearts) {
      throw new HttpError(400, "Your hearts not initialized");
    }

    if (player2Hearts.hearts <= 0) {
      throw new HttpError(
        400,
        "You have no hearts left. Please recover hearts first.",
      );
    }

    // Assign player2 and set their hearts
    const updated = await prisma.gameMatch.update({
      where: { id: match.id },
      data: {
        player2Id: req.user!.id,
        heartsPlayer2: player2Hearts.hearts,
      },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
      },
    });

    res.status(200).json({ match: updated });
  }),
);

// Auto-matchmaking: Find waiting match or create one
gameRouter.post(
  "/matches/quickplay",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      topicId: z.string().optional(),
      quizPool: z.array(z.string().min(1)).min(1),
      maxRounds: z.number().int().min(1).max(50).optional(),
    });

    const body = bodySchema.parse(req.body);
    const { quizPool, topicId } = body;

    // Try to find a waiting match with the same topic
    const waitingMatch = await prisma.gameMatch.findFirst({
      where: {
        status: "WAITING",
        player2Id: undefined,
        player1Id: { not: req.user!.id },
        topicId: topicId ?? null,
      },
    });

    if (waitingMatch) {
      // Join existing match
      const joined = await prisma.gameMatch.update({
        where: { id: waitingMatch.id },
        data: { player2Id: req.user!.id },
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } },
        },
      });
      return res.status(200).json({ match: joined, isNew: false });
    }

    // No waiting match, create a new one
    const newMatch = await prisma.gameMatch.create({
      data: {
        player1Id: req.user!.id,
        player2Id: undefined,
        winnerId: null,
        status: "WAITING",
        topicId: topicId ?? null,
        quizPool: quizPool.length <= 100 ? quizPool : quizPool.slice(0, 100),
        maxRounds: body.maxRounds ?? 5,
        playerCount: 2,
        heartsPlayer1: 3,
        heartsPlayer2: 3,
      },
      include: {
        player1: { select: { id: true, username: true } },
      },
    });

    res.status(201).json({ match: newMatch, isNew: true });
  }),
);

gameRouter.post(
  "/matches/:matchId/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ matchId: z.string().min(1) });
    const { matchId } = paramsSchema.parse(req.params);
    const match = await prisma.gameMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        quizPool: true,
        maxRounds: true,
        player1Id: true,
        player2Id: true,
      },
    });

    if (!match) throw new HttpError(404, "Match not found");
    if (match.status !== "WAITING" && match.status !== "IN_PROGRESS") {
      throw new HttpError(400, "Match cannot be started");
    }

    // Both players must be present to start
    if (!match.player2Id) {
      throw new HttpError(400, "Waiting for second player to join");
    }

    const quizPool = (match.quizPool ?? []) as unknown[];
    const pool = quizPool.filter((x) => typeof x === "string") as string[];
    if (pool.length === 0) {
      throw new HttpError(400, "Match quizPool is empty");
    }

    const roundsToCreate = pool.slice(0, match.maxRounds ?? pool.length);

    const existingRoundsCount = await prisma.gameRound.count({
      where: { matchId },
    });
    if (existingRoundsCount > 0) {
      const updated = await prisma.gameMatch.update({
        where: { id: match.id },
        data: { status: "IN_PROGRESS" },
      });
      return res.status(200).json({ match: updated });
    }

    await prisma.gameRound.createMany({
      data: roundsToCreate.map((questionId, i) => ({
        matchId,
        questionId,
        order: i,
      })),
    });

    const rounds = await prisma.gameRound.findMany({
      where: { matchId },
      orderBy: { order: "asc" },
    });

    const updated = await prisma.gameMatch.update({
      where: { id: match.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });

    res.status(201).json({ match: updated, rounds });
  }),
);

const answerRoundBodySchema = z.object({
  answerIndex: z.number().int().min(0).max(10),
});

gameRouter.post(
  "/matches/:matchId/rounds/:roundId/answer",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      matchId: z.string().min(1),
      roundId: z.string().min(1),
    });
    const { matchId, roundId } = paramsSchema.parse(req.params);
    const { answerIndex } = answerRoundBodySchema.parse(req.body);

    const match = await prisma.gameMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        player1Id: true,
        player2Id: true,
        heartsPlayer1: true,
        heartsPlayer2: true,
      },
    });
    if (!match) throw new HttpError(404, "Match not found");

    if (match.status !== "IN_PROGRESS") {
      throw new HttpError(400, "Match not in progress");
    }
    if (match.player1Id !== req.user!.id && match.player2Id !== req.user!.id) {
      throw new HttpError(403, "You are not a player in this match");
    }

    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      select: {
        id: true,
        matchId: true,
        questionId: true,
        player1Answer: true,
        player2Answer: true,
      },
    });
    if (!round || round.matchId !== matchId) {
      throw new HttpError(404, "Round not found");
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: round.questionId },
      select: {
        correctOption: true,
        lesson: { select: { xpReward: true } },
      },
    });
    if (!quiz) throw new HttpError(404, "Quiz question not found");

    // Identify which player's slot this is.
    const isPlayer1 = match.player1Id === req.user!.id;

    const alreadyAnswered = isPlayer1
      ? round.player1Answer !== null
      : round.player2Answer !== null;
    if (alreadyAnswered) {
      throw new HttpError(409, "You already answered this round");
    }

    const correct = answerIndex === quiz.correctOption;
    const xpEarned = quiz.lesson?.xpReward ?? 10;

    // Apply all state changes in a single transaction.
    const payload = await prisma.$transaction(async (tx) => {
      // Update round answers + correctness + heart-loss marker.
      const updatedRound = await tx.gameRound.update({
        where: { id: roundId },
        data: {
          ...(isPlayer1
            ? {
                player1Answer: answerIndex,
                player1Correct: correct,
                player1HeartLost: !correct,
              }
            : {
                player2Answer: answerIndex,
                player2Correct: correct,
                player2HeartLost: !correct,
              }),
        },
      });

      // Update match hearts.
      const heartsPlayer1 = isPlayer1
        ? match.heartsPlayer1 - (correct ? 0 : 1)
        : match.heartsPlayer1;
      const heartsPlayer2 = !isPlayer1
        ? match.heartsPlayer2 - (correct ? 0 : 1)
        : match.heartsPlayer2;

      const updatedMatch = await tx.gameMatch.update({
        where: { id: matchId },
        data: {
          heartsPlayer1,
          heartsPlayer2,
        },
      });

      // Sync with gamification: lose a heart from the gamification system if incorrect
      if (!correct) {
        await loseHeart(req.user!.id, "quiz_failure_in_match");
      }

      // Award XP and leaderboard total for correct answers.
      if (correct) {
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

      // Check finish state.
      const rounds = await tx.gameRound.findMany({
        where: { matchId },
        orderBy: { order: "asc" },
      });
      const allAnswered = rounds.every(
        (r) => r.player1Answer !== null && r.player2Answer !== null,
      );

      const finished = heartsPlayer1 <= 0 || heartsPlayer2 <= 0 || allAnswered;
      if (!finished) {
        return { updatedRound, updatedMatch, finished: false };
      }

      let winnerId: string | null = null;

      if (heartsPlayer1 <= 0) winnerId = match.player2Id;
      else if (heartsPlayer2 <= 0) winnerId = match.player1Id;
      else {
        const p1Correct = rounds.filter((r) => r.player1Correct).length;
        const p2Correct = rounds.filter((r) => r.player2Correct).length;
        if (p1Correct > p2Correct) winnerId = match.player1Id;
        else if (p2Correct > p1Correct) winnerId = match.player2Id;
      }

      const updated = await tx.gameMatch.update({
        where: { id: matchId },
        data: {
          status: "FINISHED",
          endedAt: new Date(),
          winnerId,
        },
      });

      if (winnerId) {
        await tx.leaderboard.updateMany({
          where: { userId: winnerId },
          data: { gamesWon: { increment: 1 } },
        });
      }

      return { updatedRound, updatedMatch: updated, finished: true, winnerId };
    });

    res.status(200).json(payload);
  }),
);

gameRouter.get(
  "/matches/:matchId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ matchId: z.string().min(1) });
    const { matchId } = paramsSchema.parse(req.params);
    const match = await prisma.gameMatch.findUnique({
      where: { id: matchId },
      include: {
        rounds: { orderBy: { order: "asc" } },
        topic: true,
      },
    });
    if (!match) throw new HttpError(404, "Match not found");
    if (match.player1Id !== req.user!.id && match.player2Id !== req.user!.id) {
      throw new HttpError(403, "Forbidden");
    }
    res.status(200).json({ match });
  }),
);
