/**
 * Gamification Integration Hub
 *
 * This file orchestrates gamification system integration with other modules:
 * - Auth (user initialization)
 * - Progress (lesson completion)
 * - Quiz (quiz failure/success)
 * - Achievements (milestone tracking)
 *
 * All gamification logic flows through this layer for consistency.
 */

import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/errors";
import {
  initializeUserHearts,
  loseHeart,
  recoverHeart,
} from "./hearts.service";
import {
  initializeUserStreak,
  checkInDaily,
  freezeStreak as freezeStreakService,
} from "./streaks.service";
import {
  addCharacterExperience,
  checkCharacterUnlock,
  unlockCharacter,
} from "./characters.service";
import {
  calculateStreakXpMultiplier,
  getStreakAchievements,
} from "./gamification.utils";

/**
 * LIFECYCLE: New User Registration
 * Called when a user is created (Auth module)
 */
export const initializeGamificationForNewUser = async (userId: string) => {
  try {
    // Initialize hearts system
    await initializeUserHearts(userId);

    // Initialize streak system
    await initializeUserStreak(userId);

    console.log(`✓ Gamification initialized for user ${userId}`);
  } catch (error) {
    console.error(
      `Failed to initialize gamification for user ${userId}:`,
      error,
    );
    throw error;
  }
};

/**
 * LIFECYCLE: Lesson Completion
 * Called when a user completes a lesson (Progress module)
 *
 * Handles:
 * - Streak check-in and XP recording
 * - Character experience and unlock checking
 * - XP multiplier calculation
 * - Achievement tracking
 */
export const onLessonCompleted = async (
  userId: string,
  lessonId: string,
  xpEarned: number,
  favoriteCharacterId?: string,
) => {
  try {
    // 1. Record daily activity (streak check-in)
    const streak = await checkInDaily(userId, xpEarned, 1, 0);

    // 2. Calculate XP multiplier based on streak
    const xpMultiplier = calculateStreakXpMultiplier(streak.currentStreak);
    const finalXp = Math.floor(xpEarned * xpMultiplier);

    // 3. Add experience to favorite character (if exists)
    if (favoriteCharacterId) {
      await addCharacterExperience(userId, favoriteCharacterId, finalXp);
    }

    // 4. Check for character unlocks
    // This would be triggered by achievements or XP thresholds elsewhere
    // but we log it here for potential future expansion

    // 5. Get achievements for this streak level
    const achievements = getStreakAchievements(streak.currentStreak);

    return {
      xpEarned: finalXp,
      multiplier: xpMultiplier,
      streakDays: streak.currentStreak,
      longestStreak: streak.longestStreak,
      achievements,
    };
  } catch (error) {
    console.error(
      `Failed to process lesson completion for user ${userId}:`,
      error,
    );
    throw error;
  }
};

/**
 * LIFECYCLE: Quiz Failure
 * Called when a user fails a quiz (Quiz module)
 *
 * Handles:
 * - Heart loss
 * - Check if user is out of hearts (rest required)
 * - Motivation messages based on hearts remaining
 */
export const onQuizFailure = async (
  userId: string,
  quizType: string = "quiz",
) => {
  try {
    // 1. Lose a heart
    const result = await loseHeart(userId, `${quizType}_failure`);

    // 2. Check if user has hearts remaining
    const hasHeartsRemaining = result.hearts > 0;

    // 3. Calculate next recovery time
    const now = new Date();
    const recoveryTimeMs = 60 * 60 * 1000; // 1 hour
    const nextRecoveryTime = result.lastHeartLossAt
      ? new Date(result.lastHeartLossAt.getTime() + recoveryTimeMs)
      : null;

    // 4. Return status
    return {
      heartsRemaining: result.hearts,
      hasHeartsRemaining,
      message: hasHeartsRemaining
        ? `Keep going! You have ${result.hearts} hearts left. ❤️`
        : "You're out of hearts. Come back in 1 hour to recover! 😴",
      nextRecoveryAt: nextRecoveryTime,
    };
  } catch (error) {
    console.error(`Failed to process quiz failure for user ${userId}:`, error);
    throw error;
  }
};

/**
 * LIFECYCLE: Quiz Success
 * Called when a user successfully completes a quiz (Quiz module)
 *
 * Handles:
 * - Streak check-in for activity tracking
 * - Optional XP bonus for quiz success
 * - Character experience for favorite character
 */
export const onQuizSuccess = async (
  userId: string,
  xpBonus: number = 5,
  favoriteCharacterId?: string,
) => {
  try {
    // 1. Record activity in streak (0 XP from quiz, just track activity)
    const streak = await checkInDaily(userId, 0, 0, 1);

    // 2. Add XP bonus to favorite character if exists
    if (favoriteCharacterId && xpBonus > 0) {
      await addCharacterExperience(userId, favoriteCharacterId, xpBonus);
    }

    // 3. Get achievements for this streak level
    const achievements = getStreakAchievements(streak.currentStreak);

    return {
      xpBonus,
      streakDays: streak.currentStreak,
      achievements,
    };
  } catch (error) {
    console.error(`Failed to process quiz success for user ${userId}:`, error);
    throw error;
  }
};

/**
 * LIFECYCLE: Check Heart Recovery Status
 * Called when user needs to know if they can recover hearts (any module)
 *
 * Returns:
 * - Current heart count
 * - Whether recovery is possible
 * - Time until next recovery
 */
export const getHeartRecoveryStatus = async (userId: string) => {
  try {
    const hearts = await prisma.userHearts.findUnique({
      where: { userId },
      select: {
        hearts: true,
        maxHearts: true,
        lastHeartLossAt: true,
      },
    });

    if (!hearts) {
      throw new HttpError(404, "User hearts not initialized");
    }

    const now = new Date();
    const recoveryTimeMs = 60 * 60 * 1000; // 1 hour default
    const nextRecoveryTime = hearts.lastHeartLossAt
      ? new Date(hearts.lastHeartLossAt.getTime() + recoveryTimeMs)
      : null;

    const canRecover =
      hearts.hearts < hearts.maxHearts &&
      nextRecoveryTime &&
      now >= nextRecoveryTime;

    return {
      hearts: hearts.hearts,
      maxHearts: hearts.maxHearts,
      canRecover,
      nextRecoveryAt: nextRecoveryTime,
      timeUntilRecoveryMs: canRecover
        ? 0
        : nextRecoveryTime
          ? nextRecoveryTime.getTime() - now.getTime()
          : null,
    };
  } catch (error) {
    console.error(
      `Failed to get heart recovery status for user ${userId}:`,
      error,
    );
    throw error;
  }
};

/**
 * LIFECYCLE: Purchase Premium Features
 * Called when user upgrades tier or purchases premium features (Users/Billing module)
 *
 * Handles:
 * - Award streak freezes
 * - Adjust heart recovery time
 * - Award bonus hearts
 */
export const onPremiumPurchase = async (
  userId: string,
  featureType: "freeze" | "hearts" | "upgrade",
  amount: number = 1,
) => {
  try {
    switch (featureType) {
      case "freeze": {
        // Add streak freezes
        const streak = await prisma.userStreak.update({
          where: { userId },
          data: { freezesRemaining: { increment: amount } },
        });
        return {
          freezesAdded: amount,
          freezesRemaining: streak.freezesRemaining,
        };
      }

      case "hearts": {
        // Award bonus hearts
        const hearts = await prisma.userHearts.update({
          where: { userId },
          data: { hearts: { increment: amount } },
        });
        return { heartsAdded: amount, currentHearts: hearts.hearts };
      }

      case "upgrade": {
        // Tier upgrade - handled separately by users module
        return { message: "Tier upgraded" };
      }

      default:
        throw new HttpError(400, "Invalid feature type");
    }
  } catch (error) {
    console.error(
      `Failed to process premium purchase for user ${userId}:`,
      error,
    );
    throw error;
  }
};

/**
 * HELPER: Get Complete Gamification Status for User
 * Returns comprehensive gamification state (for dashboard/profile endpoints)
 */
export const getCompleteGamificationStatus = async (userId: string) => {
  try {
    // Fetch all gamification data in parallel
    const [hearts, streak, characters] = await Promise.all([
      prisma.userHearts.findUnique({
        where: { userId },
        select: {
          hearts: true,
          maxHearts: true,
          lastHeartLossAt: true,
        },
      }),
      prisma.userStreak.findUnique({
        where: { userId },
        select: {
          currentStreak: true,
          longestStreak: true,
          lastActivityAt: true,
          freezesRemaining: true,
        },
      }),
      prisma.collectedCharacter.findMany({
        where: { userId },
        select: {
          characterId: true,
          collectedAt: true,
        },
      }),
    ]);

    if (!hearts || !streak) {
      throw new HttpError(404, "Gamification data not initialized");
    }

    const now = new Date();
    const recoveryTimeMs = 60 * 60 * 1000; // 1 hour
    const nextRecoveryTime = hearts.lastHeartLossAt
      ? new Date(hearts.lastHeartLossAt.getTime() + recoveryTimeMs)
      : null;

    return {
      hearts: {
        current: hearts.hearts,
        max: hearts.maxHearts,
        nextRecoveryAt: nextRecoveryTime,
        canRecover:
          hearts.hearts < hearts.maxHearts &&
          nextRecoveryTime &&
          now >= nextRecoveryTime,
      },
      streak: {
        current: streak.currentStreak,
        longest: streak.longestStreak,
        freezesRemaining: streak.freezesRemaining,
      },
      characters: characters.map((c) => ({
        id: c.characterId,
        unlockedAt: c.collectedAt,
      })),
    };
  } catch (error) {
    console.error(
      `Failed to get gamification status for user ${userId}:`,
      error,
    );
    throw error;
  }
};
