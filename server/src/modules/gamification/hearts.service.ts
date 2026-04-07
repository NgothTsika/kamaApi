import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/errors";
import { calculateHeartRecovery } from "./gamification.utils";

/**
 * Heart Recovery Service
 * Manages user hearts, recovery timing, and heart loss logic
 * Inspired by Duolingo's heart system
 */

export interface UserHeartsState {
  hearts: number;
  maxHearts: number;
  lastHeartLossAt: Date | null;
  lastRecoveredAt: Date | null;
  recoveryTimeMs: number;
  nextRecoveryAt: Date | null;
  willRecover: boolean;
}

/**
 * Get current heart state for a user
 */
export async function getUserHearts(userId: string): Promise<UserHeartsState> {
  const userHearts = await prisma.userHearts.findUnique({
    where: { userId },
  });

  if (!userHearts) {
    throw new HttpError(404, "User hearts not found");
  }

  // Calculate if hearts should recover
  const now = new Date();
  const heartRecoveryTime = calculateHeartRecovery(
    userHearts.lastHeartLossAt,
    userHearts.recoveryTimeMs,
  );

  return {
    hearts: userHearts.hearts,
    maxHearts: userHearts.maxHearts,
    lastHeartLossAt: userHearts.lastHeartLossAt,
    lastRecoveredAt: userHearts.lastRecoveredAt,
    recoveryTimeMs: userHearts.recoveryTimeMs,
    nextRecoveryAt: heartRecoveryTime.nextRecoveryAt,
    willRecover: heartRecoveryTime.willRecover,
  };
}

/**
 * Initialize hearts for a new user
 * Uses the configured max hearts from gamification settings
 */
export async function initializeUserHearts(userId: string) {
  // Fetch gamification config for configured max hearts
  let config = await prisma.gameConfig.findUnique({
    where: { id: "gamification" },
  });

  // Create default config if not exists
  if (!config) {
    config = await prisma.gameConfig.create({
      data: {
        id: "gamification",
        heartsMaxHearts: 3,
        heartsRecoveryTimeMs: 3600000,
        heartsPremiumRecoveryTimeMs: 1800000,
        streaksCheckInHours: 24,
        streaksXpMultiplierFormula: "1 + (currentStreak / 100)",
        streaksMilestones: [7, 14, 30, 60, 100, 365],
        charactersUnlockXpThreshold: 100,
        charactersPurchaseXpCost: 50,
        gamificationEnabled: true,
        gamificationEventMultiplier: 1.0,
      },
    });
  }

  const configuredMaxHearts = config.heartsMaxHearts;

  return await prisma.userHearts.create({
    data: {
      userId,
      hearts: configuredMaxHearts,
      maxHearts: configuredMaxHearts,
      recoveryTimeMs: config.heartsRecoveryTimeMs,
    },
  });
}

/**
 * Deduct a heart from the user (lesson failure or quiz failure)
 */
export async function loseHeart(
  userId: string,
  reason: string = "lesson_failure",
): Promise<UserHeartsState> {
  const userHearts = await prisma.userHearts.findUnique({
    where: { userId },
  });

  if (!userHearts) {
    throw new HttpError(404, "User hearts not found");
  }

  if (userHearts.hearts <= 0) {
    throw new HttpError(400, "User has no hearts left");
  }

  // Deduct heart and record loss
  const updated = await prisma.userHearts.update({
    where: { userId },
    data: {
      hearts: userHearts.hearts - 1,
      lastHeartLossAt: new Date(),
      totalHeartLosses: userHearts.totalHeartLosses + 1,
    },
  });

  // Log the event for analytics
  await prisma.heartRecoveryEvent.create({
    data: {
      userId,
      heartsRecovered: 0,
      fromHearts: userHearts.hearts,
      toHearts: updated.hearts,
      recoveryType: "loss",
    },
  });

  const heartRecoveryTime = calculateHeartRecovery(
    updated.lastHeartLossAt,
    updated.recoveryTimeMs,
  );

  return {
    hearts: updated.hearts,
    maxHearts: updated.maxHearts,
    lastHeartLossAt: updated.lastHeartLossAt,
    lastRecoveredAt: updated.lastRecoveredAt,
    recoveryTimeMs: updated.recoveryTimeMs,
    nextRecoveryAt: heartRecoveryTime.nextRecoveryAt,
    willRecover: heartRecoveryTime.willRecover,
  };
}

/**
 * Recover one heart (if recovery time has passed)
 */
export async function recoverHeart(userId: string): Promise<UserHeartsState> {
  const userHearts = await prisma.userHearts.findUnique({
    where: { userId },
  });

  if (!userHearts) {
    throw new HttpError(404, "User hearts not found");
  }

  if (userHearts.hearts >= userHearts.maxHearts) {
    throw new HttpError(400, "User already has maximum hearts");
  }

  const heartRecoveryTime = calculateHeartRecovery(
    userHearts.lastHeartLossAt,
    userHearts.recoveryTimeMs,
  );

  if (!heartRecoveryTime.willRecover) {
    throw new HttpError(
      400,
      `Hearts will recover in ${heartRecoveryTime.minutesUntilRecovery} minutes`,
    );
  }

  // Recover one heart
  const updated = await prisma.userHearts.update({
    where: { userId },
    data: {
      hearts: userHearts.hearts + 1,
      lastRecoveredAt: new Date(),
    },
  });

  // Log recovery event
  await prisma.heartRecoveryEvent.create({
    data: {
      userId,
      heartsRecovered: 1,
      fromHearts: userHearts.hearts,
      toHearts: updated.hearts,
      recoveryType: "automatic",
    },
  });

  const newHeartRecoveryTime = calculateHeartRecovery(
    updated.lastHeartLossAt,
    updated.recoveryTimeMs,
  );

  return {
    hearts: updated.hearts,
    maxHearts: updated.maxHearts,
    lastHeartLossAt: updated.lastHeartLossAt,
    lastRecoveredAt: updated.lastRecoveredAt,
    recoveryTimeMs: updated.recoveryTimeMs,
    nextRecoveryAt: newHeartRecoveryTime.nextRecoveryAt,
    willRecover: newHeartRecoveryTime.willRecover,
  };
}

/**
 * Recover all hearts (premium feature or achievement)
 */
export async function restoreFullHearts(
  userId: string,
  reason: string = "achievement",
): Promise<UserHeartsState> {
  const userHearts = await prisma.userHearts.findUnique({
    where: { userId },
  });

  if (!userHearts) {
    throw new HttpError(404, "User hearts not found");
  }

  const heartsRecovered = userHearts.maxHearts - userHearts.hearts;

  const updated = await prisma.userHearts.update({
    where: { userId },
    data: {
      hearts: userHearts.maxHearts,
      lastRecoveredAt: new Date(),
    },
  });

  // Log recovery event
  if (heartsRecovered > 0) {
    await prisma.heartRecoveryEvent.create({
      data: {
        userId,
        heartsRecovered,
        fromHearts: userHearts.hearts,
        toHearts: updated.hearts,
        recoveryType: reason,
      },
    });
  }

  return {
    hearts: updated.hearts,
    maxHearts: updated.maxHearts,
    lastHeartLossAt: updated.lastHeartLossAt,
    lastRecoveredAt: updated.lastRecoveredAt,
    recoveryTimeMs: updated.recoveryTimeMs,
    nextRecoveryAt: null,
    willRecover: false,
  };
}

/**
 * Set custom recovery time (for premium features or tier upgrades)
 */
export async function setRecoveryTime(
  userId: string,
  recoveryTimeMs: number,
): Promise<void> {
  if (recoveryTimeMs < 60000) {
    // Minimum 1 minute
    throw new HttpError(
      400,
      "Recovery time must be at least 1 minute (60000ms)",
    );
  }

  if (recoveryTimeMs > 86400000) {
    // Maximum 24 hours
    throw new HttpError(
      400,
      "Recovery time cannot exceed 24 hours (86400000ms)",
    );
  }

  await prisma.userHearts.update({
    where: { userId },
    data: { recoveryTimeMs },
  });
}

/**
 * Get heart recovery history/analytics
 */
export async function getHeartRecoveryHistory(
  userId: string,
  limit: number = 50,
) {
  return await prisma.heartRecoveryEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
