import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { HttpError } from "../../lib/errors";

export const pollRouter = Router();

// ---------- User Poll Voting ----------

// POST /content/quizzes/:quizId/poll-vote
// Submit or update a user's vote on a poll question
pollRouter.post(
  "/quizzes/:quizId/poll-vote",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);

    const bodySchema = z.object({
      selectedOption: z.number().int().min(0),
    });
    const { selectedOption } = bodySchema.parse(req.body);

    const userId = req.user!.id;

    // Verify quiz exists and is a poll
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        options: true,
        isPoll: true,
        isActive: true,
      },
    });

    if (!quiz) {
      throw new HttpError(404, "Quiz not found");
    }

    if (!quiz.isPoll) {
      throw new HttpError(400, "This is not a poll question");
    }

    if (!quiz.isActive) {
      throw new HttpError(400, "This poll is disabled");
    }

    const options = quiz.options as unknown as string[];
    if (selectedOption >= options.length) {
      throw new HttpError(400, "Invalid option index");
    }

    // Create or update vote (upsert)
    const vote = await prisma.pollVote.upsert({
      where: { userId_quizId: { userId, quizId } },
      update: { selectedOption },
      create: { userId, quizId, selectedOption },
    });

    // Calculate updated poll results
    const pollVotes = await prisma.pollVote.findMany({
      where: { quizId },
      select: { selectedOption: true },
    });

    const results: Record<string, number> = {};
    const totalVotes = pollVotes.length;

    // Initialize all options with 0
    options.forEach((_, index) => {
      results[index] = 0;
    });

    // Count votes per option
    pollVotes.forEach((pv) => {
      results[pv.selectedOption]++;
    });

    // Calculate percentages
    Object.keys(results).forEach((key) => {
      results[key] = totalVotes > 0 ? (results[key] / totalVotes) * 100 : 0;
    });

    // Update quiz with results
    await prisma.quiz.update({
      where: { id: quizId },
      data: {
        pollResults: results,
        totalPollVotes: totalVotes,
      },
    });

    res.status(200).json({
      message: "Vote recorded successfully",
      vote,
      pollResults: results,
      totalVotes,
    });
  }),
);

// GET /content/quizzes/:quizId/poll-results
// Get poll results including user's vote if authenticated
pollRouter.get(
  "/quizzes/:quizId/poll-results",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);

    const userId = req.user?.id;

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        question: true,
        options: true,
        isPoll: true,
        pollResults: true,
        totalPollVotes: true,
        pollVotes: userId
          ? {
              where: { userId },
              select: { selectedOption: true },
            }
          : false,
      },
    });

    if (!quiz) {
      throw new HttpError(404, "Quiz not found");
    }

    if (!quiz.isPoll) {
      throw new HttpError(400, "This is not a poll question");
    }

    res.status(200).json({
      id: quiz.id,
      question: quiz.question,
      options: quiz.options,
      pollResults: quiz.pollResults || {},
      totalVotes: quiz.totalPollVotes,
      userVote: userId && quiz.pollVotes && quiz.pollVotes[0]?.selectedOption,
    });
  }),
);

// ---------- Admin Poll Management ----------

// GET /content/admin/quizzes/:quizId/analytics
// Get detailed poll analytics for admin
const adminRoles = requireRole("ADMIN", "MODERATOR");

pollRouter.get(
  "/admin/quizzes/:quizId/analytics",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        question: true,
        options: true,
        isPoll: true,
        pollResults: true,
        totalPollVotes: true,
        pollVotes: {
          select: {
            userId: true,
            selectedOption: true,
            votedAt: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new HttpError(404, "Quiz not found");
    }

    if (!quiz.isPoll) {
      throw new HttpError(400, "This is not a poll question");
    }

    res.status(200).json({
      id: quiz.id,
      question: quiz.question,
      options: quiz.options,
      pollResults: quiz.pollResults || {},
      totalVotes: quiz.totalPollVotes,
      pollVotes: quiz.pollVotes,
    });
  }),
);

// DELETE /content/admin/quizzes/:quizId/poll-votes
// Reset/clear all poll votes for a quiz (admin only)
pollRouter.delete(
  "/admin/quizzes/:quizId/poll-votes",
  requireAuth,
  adminRoles,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ quizId: z.string().min(1) });
    const { quizId } = paramsSchema.parse(req.params);

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, isPoll: true },
    });

    if (!quiz) {
      throw new HttpError(404, "Quiz not found");
    }

    if (!quiz.isPoll) {
      throw new HttpError(400, "This is not a poll question");
    }

    // Clear all votes
    await prisma.pollVote.deleteMany({
      where: { quizId },
    });

    // Reset poll results
    await prisma.quiz.update({
      where: { id: quizId },
      data: {
        pollResults: {},
        totalPollVotes: 0,
      },
    });

    res.status(200).json({
      message: "Poll votes reset successfully",
    });
  }),
);
