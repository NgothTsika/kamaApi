/**
 * Gamification Utilities
 * Helper functions for hearts, streaks, and character progression calculations
 */

/**
 * Calculate if heart should recover and when
 */
export function calculateHeartRecovery(
  lastHeartLossAt: Date | null,
  recoveryTimeMs: number,
) {
  if (!lastHeartLossAt) {
    return {
      willRecover: false,
      nextRecoveryAt: null,
      minutesUntilRecovery: 0,
    };
  }

  const now = new Date();
  const recoveryTime = new Date(lastHeartLossAt.getTime() + recoveryTimeMs);

  if (now >= recoveryTime) {
    return {
      willRecover: true,
      nextRecoveryAt: recoveryTime,
      minutesUntilRecovery: 0,
    };
  }

  const minutesUntilRecovery = Math.ceil(
    (recoveryTime.getTime() - now.getTime()) / 60000,
  );

  return {
    willRecover: false,
    nextRecoveryAt: recoveryTime,
    minutesUntilRecovery,
  };
}

/**
 * Format recovery time display
 */
export function formatRecoveryTime(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Determine if activity happened today (for streak purposes)
 */
export function isCurrentDayStreak(lastActivityAt: Date | null): boolean {
  if (!lastActivityAt) return false;

  const now = new Date();
  const lastActivityDate = normalizeToStartOfDay(lastActivityAt);
  const todayDate = normalizeToStartOfDay(now);

  return lastActivityDate.getTime() === todayDate.getTime();
}

/**
 * Calculate days until streak is lost
 * Streaks are lost if no activity for more than 1 day
 */
export function calculateStreakDaysRemaining(
  lastActivityAt: Date | null,
): number {
  if (!lastActivityAt) return 0;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  if (lastActivityAt > yesterday) {
    // Activity was recent enough to maintain streak
    return 1; // They have until tomorrow
  }

  return 0; // Streak would be broken
}

/**
 * Normalize date to start of day (UTC)
 */
export function normalizeToStartOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Get max hearts based on user tier or premium status
 */
export function getMaxHearts(
  isPremium: boolean = false,
  userTier: string = "free",
): number {
  const maxHeartsByTier: Record<string, number> = {
    free: 5,
    basic: 8,
    premium: 10,
    vip: 15,
  };

  return maxHeartsByTier[userTier] || 5;
}

/**
 * Get recovery time in ms based on tier
 */
export function getRecoveryTime(userTier: string = "free"): number {
  const recoveryTimeByTier: Record<string, number> = {
    free: 3600000, // 1 hour
    basic: 1800000, // 30 minutes
    premium: 900000, // 15 minutes
    vip: 300000, // 5 minutes
  };

  return recoveryTimeByTier[userTier] || 3600000;
}

/**
 * Calculate XP multiplier based on streak
 */
export function calculateStreakXpMultiplier(currentStreak: number): number {
  if (currentStreak < 7) return 1.0;
  if (currentStreak < 14) return 1.1;
  if (currentStreak < 30) return 1.2;
  if (currentStreak < 60) return 1.3;
  if (currentStreak < 100) return 1.5;
  return 2.0; // 100+ day streaks get 2x XP
}

/**
 * Determine achievement unlocks based on streak
 */
export function getStreakAchievements(currentStreak: number): string[] {
  const achievements: string[] = [];

  if (currentStreak >= 7) achievements.push("week_warrior");
  if (currentStreak >= 14) achievements.push("fortnight_fighter");
  if (currentStreak >= 30) achievements.push("monthly_master");
  if (currentStreak >= 60) achievements.push("bimonthly_beast");
  if (currentStreak >= 100) achievements.push("century_champion");
  if (currentStreak >= 365) achievements.push("yearlong_legend");

  return achievements;
}

/**
 * Calculate character unlock progression
 */
export function calculateCharacterUnlockProgress(
  currentXP: number,
  requiredXP: number,
): number {
  if (requiredXP === 0) return 100;
  return Math.min(100, Math.floor((currentXP / requiredXP) * 100));
}

/**
 * Validate heart transaction
 */
export function validateHeartTransaction(
  currentHearts: number,
  maxHearts: number,
  operation: "loss" | "gain",
  amount: number = 1,
): { valid: boolean; message?: string } {
  if (operation === "loss") {
    if (currentHearts - amount < 0) {
      return {
        valid: false,
        message: "Cannot lose more hearts than available",
      };
    }
  } else if (operation === "gain") {
    if (currentHearts + amount > maxHearts) {
      return {
        valid: false,
        message: "Cannot gain more hearts than max",
      };
    }
  }

  return { valid: true };
}

/**
 * Calculate streak freeze availability
 * Free tier gets 1 freeze per month
 */
export function calculateFreezesAllowed(
  userTier: string = "free",
  accountAgeInDays: number = 0,
): number {
  const baseFreezesPerTier: Record<string, number> = {
    free: 1,
    basic: 2,
    premium: 5,
    vip: 10,
  };

  const baseFreezes = baseFreezesPerTier[userTier] || 1;

  // Bonus freeze for every 100 days of account age
  const ageBonus = Math.floor(accountAgeInDays / 100);

  return baseFreezes + ageBonus;
}

/**
 * Format streak for display
 */
export function formatStreak(
  currentStreak: number,
  longestStreak: number,
): string {
  if (currentStreak === 0) {
    return "Start your streak today!";
  }

  const streakEmoji = "🔥";
  return `${streakEmoji} ${currentStreak} day${currentStreak !== 1 ? "s" : ""} (Best: ${longestStreak})`;
}

/**
 * Get heart emoji based on count
 */
export function getHeartEmoji(hearts: number, maxHearts: number): string {
  const filledHeart = "❤️";
  const emptyHeart = "🤍";

  return filledHeart.repeat(hearts) + emptyHeart.repeat(maxHearts - hearts);
}

/**
 * Determine if user needs rest (no hearts)
 */
export function shouldRestUser(hearts: number): boolean {
  return hearts <= 0;
}
