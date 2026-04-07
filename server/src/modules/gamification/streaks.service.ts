import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/errors";
import {
  isCurrentDayStreak,
  calculateStreakDaysRemaining,
  normalizeToStartOfDay,
} from "./gamification.utils";

/**
 * Streak Service
 * Manages user daily activity streaks and check-ins
 * Inspired by Duolingo's streak system
 */

export interface UserStreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: Date | null;
  streakStartedAt: Date | null;
  isActive: boolean;
  daysUntilLoss: number;
  canFreezeStreak: boolean;
  freezesRemaining: number;
  streakFrozenUntil: Date | null;
}

/**
 * Get current streak state for a user
 */
export async function getUserStreak(userId: string): Promise<UserStreakState> {
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });

  if (!userStreak) {
    throw new HttpError(404, "User streak not found");
  }

  const isActive = isCurrentDayStreak(userStreak.lastActivityAt);
  const daysUntilLoss = calculateStreakDaysRemaining(userStreak.lastActivityAt);

  return {
    currentStreak: userStreak.currentStreak,
    longestStreak: userStreak.longestStreak,
    lastActivityAt: userStreak.lastActivityAt,
    streakStartedAt: userStreak.streakStartedAt,
    isActive,
    daysUntilLoss,
    canFreezeStreak: userStreak.freezesRemaining > 0,
    freezesRemaining: userStreak.freezesRemaining,
    streakFrozenUntil: userStreak.streakFrozenUntil,
  };
}

/**
 * Initialize streak for a new user
 */
export async function initializeUserStreak(userId: string) {
  return await prisma.userStreak.create({
    data: {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      freezesRemaining: 0,
    },
  });
}

/**
 * Record a daily check-in for user
 * This should be called after completing a lesson or quiz
 */
export async function checkInDaily(
  userId: string,
  xpEarned: number = 0,
  lessonCount: number = 0,
  quizCount: number = 0,
): Promise<UserStreakState> {
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });

  if (!userStreak) {
    throw new HttpError(404, "User streak not found");
  }

  const now = new Date();
  const today = normalizeToStartOfDay(now);

  // Check if user already checked in today
  const existingCheckIn = await prisma.streakCheckIn.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (existingCheckIn) {
    // Update existing check-in
    await prisma.streakCheckIn.update({
      where: { id: existingCheckIn.id },
      data: {
        xpEarned: (existingCheckIn.xpEarned || 0) + xpEarned,
        lessonCount: (existingCheckIn.lessonCount || 0) + lessonCount,
        quizCount: (existingCheckIn.quizCount || 0) + quizCount,
      },
    });

    // Return current streak state
    return getUserStreak(userId);
  }

  // Determine if this is a continuation of the streak
  const lastActivityDate = userStreak.lastActivityAt
    ? normalizeToStartOfDay(userStreak.lastActivityAt)
    : null;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newCurrentStreak = userStreak.currentStreak;

  // If last activity was yesterday, continue the streak
  if (lastActivityDate?.getTime() === yesterday.getTime()) {
    newCurrentStreak = userStreak.currentStreak + 1;
  }
  // If last activity was today or there was no activity, don't change streak
  else if (lastActivityDate?.getTime() === today.getTime()) {
    newCurrentStreak = userStreak.currentStreak;
  }
  // If gap > 1 day, check if streak is frozen
  else if (lastActivityDate && lastActivityDate < yesterday) {
    if (userStreak.streakFrozenUntil && userStreak.streakFrozenUntil > now) {
      // Streak is frozen, maintain it
      newCurrentStreak = userStreak.currentStreak;
    } else {
      // Streak is broken
      newCurrentStreak = 1;
    }
  }
  // First activity ever
  else {
    newCurrentStreak = 1;
  }

  // Update longest streak if current exceeds it
  const newLongestStreak = Math.max(newCurrentStreak, userStreak.longestStreak);

  // Record the check-in
  await prisma.streakCheckIn.create({
    data: {
      userId,
      date: today,
      xpEarned,
      lessonCount,
      quizCount,
    },
  });

  // Update user streak
  const updated = await prisma.userStreak.update({
    where: { userId },
    data: {
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      lastActivityAt: now,
      streakStartedAt:
        newCurrentStreak === 1 ? now : userStreak.streakStartedAt,
    },
  });

  return {
    currentStreak: updated.currentStreak,
    longestStreak: updated.longestStreak,
    lastActivityAt: updated.lastActivityAt,
    streakStartedAt: updated.streakStartedAt,
    isActive: true,
    daysUntilLoss: 1, // Fresh check-in, they have 1 day
    canFreezeStreak: updated.freezesRemaining > 0,
    freezesRemaining: updated.freezesRemaining,
    streakFrozenUntil: updated.streakFrozenUntil,
  };
}

/**
 * Freeze streak for 24 hours (premium feature)
 * Uses one freeze token
 */
export async function freezeStreak(userId: string): Promise<UserStreakState> {
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });

  if (!userStreak) {
    throw new HttpError(404, "User streak not found");
  }

  if (userStreak.freezesRemaining <= 0) {
    throw new HttpError(400, "No streak freezes remaining");
  }

  const now = new Date();
  const frozenUntil = new Date(now);
  frozenUntil.setHours(frozenUntil.getHours() + 24);

  const updated = await prisma.userStreak.update({
    where: { userId },
    data: {
      streakFrozenUntil: frozenUntil,
      freezesRemaining: userStreak.freezesRemaining - 1,
    },
  });

  return {
    currentStreak: updated.currentStreak,
    longestStreak: updated.longestStreak,
    lastActivityAt: updated.lastActivityAt,
    streakStartedAt: updated.streakStartedAt,
    isActive: true,
    daysUntilLoss: calculateStreakDaysRemaining(updated.lastActivityAt),
    canFreezeStreak: updated.freezesRemaining > 0,
    freezesRemaining: updated.freezesRemaining,
    streakFrozenUntil: updated.streakFrozenUntil,
  };
}

/**
 * Add streak freeze tokens (via achievements or purchases)
 */
export async function addStreakFreezes(
  userId: string,
  count: number,
): Promise<void> {
  if (count <= 0) {
    throw new HttpError(400, "Freeze count must be positive");
  }

  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });

  if (!userStreak) {
    throw new HttpError(404, "User streak not found");
  }

  await prisma.userStreak.update({
    where: { userId },
    data: {
      freezesRemaining: userStreak.freezesRemaining + count,
    },
  });
}

/**
 * Get daily check-in history
 */
export async function getStreakCheckInHistory(
  userId: string,
  days: number = 30,
) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  return await prisma.streakCheckIn.findMany({
    where: {
      userId,
      date: {
        gte: normalizeToStartOfDay(fromDate),
      },
    },
    orderBy: { date: "asc" },
  });
}

/**
 * Get streak statistics
 */
export async function getStreakStatistics(userId: string) {
  const userStreak = await prisma.userStreak.findUnique({
    where: { userId },
  });

  if (!userStreak) {
    throw new HttpError(404, "User streak not found");
  }

  const checkIns = await getStreakCheckInHistory(userId, 90);
  const totalXpEarned = checkIns.reduce(
    (sum, ci) => sum + (ci.xpEarned || 0),
    0,
  );
  const totalLessonsCompleted = checkIns.reduce(
    (sum, ci) => sum + (ci.lessonCount || 0),
    0,
  );
  const totalQuizzesCompleted = checkIns.reduce(
    (sum, ci) => sum + (ci.quizCount || 0),
    0,
  );

  return {
    currentStreak: userStreak.currentStreak,
    longestStreak: userStreak.longestStreak,
    totalCheckIns: checkIns.length,
    totalXpEarned,
    totalLessonsCompleted,
    totalQuizzesCompleted,
    lastActivityAt: userStreak.lastActivityAt,
    streakStartedAt: userStreak.streakStartedAt,
  };
}
