import { prisma } from "../../../lib/prisma";
import { HttpError } from "../../../lib/errors";

export class GamificationAdminService {
  /**
   * Get all users with their heart status
   */
  async getAllUserHearts(
    limit: number = 50,
    offset: number = 0,
    sortBy: "hearts" | "lastLoss" | "recovery" = "hearts",
    order: "asc" | "desc" = "desc",
  ) {
    // Fetch current gamification config
    const config = await this.getGamificationConfig();
    const configuredMaxHearts = config.hearts.maxHearts;

    const validSortFields = {
      hearts: "hearts",
      lastLoss: "lastHeartLossAt",
      recovery: "nextRecoveryTime",
    };

    const orderBy = { [validSortFields[sortBy]]: order };

    const [hearts, total] = await Promise.all([
      prisma.userHearts.findMany({
        take: limit,
        skip: offset,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
              email: true,
            },
          },
        },
      }),
      prisma.userHearts.count(),
    ]);

    return {
      data: hearts.map((h) => ({
        ...h,
        configuredMaxHearts,
        nextRecoveryAt: this.calculateNextRecoveryTime(h),
      })),
      total,
      limit,
      offset,
      configuredMaxHearts,
    };
  }

  /**
   * Get heart system statistics
   */
  async getHeartStats() {
    // Fetch current gamification config
    const config = await this.getGamificationConfig();
    const configuredMaxHearts = config.hearts.maxHearts;

    const hearts = await prisma.userHearts.findMany();
    const events = await prisma.heartRecoveryEvent.findMany();

    const totalUsers = hearts.length;
    const heartsWithMax = hearts.reduce((sum, h) => sum + h.hearts, 0);
    const avgHearts = totalUsers > 0 ? heartsWithMax / totalUsers : 0;

    const recoveryTimes = hearts
      .filter((h) => h.lastHeartLossAt && h.lastHeartLossAt < new Date())
      .map((h) => {
        const recovered = this.calculateNextRecoveryTime(h);
        return recovered.getTime() - new Date().getTime();
      })
      .filter((t) => t > 0);

    const avgRecoveryTime =
      recoveryTimes.length > 0
        ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
        : 0;

    return {
      totalUsers,
      avgHearts: Math.round(avgHearts * 100) / 100,
      totalHeartLosses: events.length,
      heartsRecovered: events.reduce((sum, e) => sum + e.heartsRecovered, 0),
      avgRecoveryTimeMs: Math.round(avgRecoveryTime),
      configuredMaxHearts,
      usersWithFullHearts: hearts.filter(
        (h) => h.hearts === configuredMaxHearts,
      ).length,
      usersWithNoHearts: hearts.filter((h) => h.hearts === 0).length,
    };
  }

  /**
   * Get heart recovery event history
   */
  async getHeartRecoveryHistory(limit: number = 50, offset: number = 0) {
    const [events, total] = await Promise.all([
      prisma.heartRecoveryEvent.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.heartRecoveryEvent.count(),
    ]);

    return {
      data: events,
      total,
      limit,
      offset,
    };
  }

  /**
   * Manually restore hearts for a user
   */
  async restoreUserHearts(userId: string, heartsToRestore: number) {
    const userHearts = await prisma.userHearts.findUnique({
      where: { userId },
    });

    if (!userHearts) {
      throw new HttpError(404, "User hearts record not found");
    }

    // Fetch current gamification config for configured max hearts
    const config = await this.getGamificationConfig();
    const configuredMaxHearts = config.hearts.maxHearts;

    const newHearts = Math.min(
      userHearts.hearts + heartsToRestore,
      configuredMaxHearts,
    );

    const actualRestored = newHearts - userHearts.hearts;

    const updated = await prisma.userHearts.update({
      where: { userId },
      data: {
        hearts: newHearts,
        lastHeartLossAt: null,
      },
    });

    // Log this action
    await prisma.heartRecoveryEvent.create({
      data: {
        userId,
        heartsRecovered: actualRestored,
        fromHearts: userHearts.hearts,
        toHearts: newHearts,
        recoveryType: "ADMIN_RESTORE",
      },
    });

    return {
      ...updated,
      actualRestored,
      message: `Restored ${actualRestored} hearts for user ${userId}`,
    };
  }

  /**
   * Get all users with their streak status
   */
  async getAllUserStreaks(
    limit: number = 50,
    offset: number = 0,
    sortBy: "current" | "longest" | "freezes" = "current",
    order: "asc" | "desc" = "desc",
  ) {
    const validSortFields = {
      current: "currentStreak",
      longest: "longestStreak",
      freezes: "freezesRemaining",
    };

    const orderBy = { [validSortFields[sortBy]]: order };

    const [streaks, total] = await Promise.all([
      prisma.userStreak.findMany({
        take: limit,
        skip: offset,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
              email: true,
            },
          },
        },
      }),
      prisma.userStreak.count(),
    ]);

    return {
      data: streaks,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get streak system statistics
   */
  async getStreakStats() {
    const streaks = await prisma.userStreak.findMany();
    const checkIns = await prisma.streakCheckIn.findMany();

    const totalUsers = streaks.length;
    const currentStreaks = streaks.map((s) => s.currentStreak);
    const longestStreaks = streaks.map((s) => s.longestStreak);

    const avgCurrentStreak =
      totalUsers > 0
        ? currentStreaks.reduce((a, b) => a + b, 0) / totalUsers
        : 0;
    const avgLongestStreak =
      totalUsers > 0
        ? longestStreaks.reduce((a, b) => a + b, 0) / totalUsers
        : 0;

    const totalFreezesUsed = streaks.reduce(
      (sum, s) => sum + (3 - s.freezesRemaining),
      0,
    );

    return {
      totalUsers,
      avgCurrentStreak: Math.round(avgCurrentStreak * 100) / 100,
      avgLongestStreak: Math.round(avgLongestStreak * 100) / 100,
      maxCurrentStreak: Math.max(...currentStreaks, 0),
      maxLongestStreak: Math.max(...longestStreaks, 0),
      totalFreezesUsed,
      totalCheckIns: checkIns.length,
      totalXpFromStreaks: checkIns.reduce((sum, c) => sum + c.xpEarned, 0),
    };
  }

  /**
   * Reset a user's streak
   */
  async resetUserStreak(userId: string) {
    const userStreak = await prisma.userStreak.findUnique({
      where: { userId },
    });

    if (!userStreak) {
      throw new HttpError(404, "User streak record not found");
    }

    const oldStreak = userStreak.currentStreak;

    const updated = await prisma.userStreak.update({
      where: { userId },
      data: {
        currentStreak: 0,
        lastActivityAt: new Date(),
      },
    });

    return {
      ...updated,
      oldStreak,
      message: `Reset streak from ${oldStreak} days to 0 for user ${userId}`,
    };
  }

  /**
   * Award bonus XP to a user
   */
  async awardBonusXp(userId: string, xpAmount: number, reason: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        xp: user.xp + xpAmount,
      },
    });

    // Create a streak check-in to record this bonus
    const userStreak = await prisma.userStreak.findUnique({
      where: { userId },
    });
    if (userStreak) {
      await prisma.streakCheckIn.create({
        data: {
          userId,
          date: new Date(),
          xpEarned: xpAmount,
          lessonCount: 0,
          quizCount: 0,
        },
      });
    }

    return {
      user: updated,
      xpAwarded: xpAmount,
      reason,
      message: `Awarded ${xpAmount} XP to user ${userId}: ${reason}`,
    };
  }

  /**
   * Freeze a user's streak (admin action)
   */
  async freezeUserStreak(userId: string) {
    const userStreak = await prisma.userStreak.findUnique({
      where: { userId },
    });

    if (!userStreak) {
      throw new HttpError(404, "User streak record not found");
    }

    if (userStreak.freezesRemaining <= 0) {
      throw new HttpError(400, "User has no freezes remaining");
    }

    const updated = await prisma.userStreak.update({
      where: { userId },
      data: {
        freezesRemaining: userStreak.freezesRemaining - 1,
        streakFrozenUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    return {
      ...updated,
      message: `Froze streak for user ${userId}. Freezes remaining: ${updated.freezesRemaining}`,
    };
  }

  /**
   * Get character unlock statistics
   */
  async getCharacterStats() {
    const characters = await prisma.character.findMany();
    const unlocks = await prisma.collectedCharacter.findMany();

    const totalUsers = await prisma.user.count();

    const stats = characters.map((char) => {
      const collected = unlocks.filter((u) => u.characterId === char.id).length;
      const unlockPercentage =
        totalUsers > 0 ? Math.round((collected / totalUsers) * 10000) / 100 : 0;

      return {
        characterId: char.id,
        characterName: char.name,
        rarityLevel: char.rarityLevel,
        totalUnlocks: collected,
        unlockPercentage,
        imageUrl: char.imageUrl,
      };
    });

    return {
      data: stats.sort((a, b) => b.totalUnlocks - a.totalUnlocks),
      totalCharacters: characters.length,
      totalUnlocks: unlocks.length,
      avgUnlocksPerCharacter:
        characters.length > 0
          ? Math.round((unlocks.length / characters.length) * 100) / 100
          : 0,
    };
  }

  /**
   * Manually unlock a character for a user
   */
  async unlockCharacterForUser(userId: string, characterId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      throw new HttpError(404, "Character not found");
    }

    // Check if already unlocked
    const existing = await prisma.collectedCharacter.findUnique({
      where: {
        userId_characterId: {
          userId,
          characterId,
        },
      },
    });

    if (existing) {
      return {
        character,
        message: `Character ${character.name} already unlocked for user ${userId}`,
        alreadyUnlocked: true,
      };
    }

    const unlocked = await prisma.collectedCharacter.create({
      data: {
        userId,
        characterId,
        collectedAt: new Date(),
      },
      include: {
        character: true,
      },
    });

    return {
      ...unlocked,
      message: `Unlocked character ${character.name} for user ${userId}`,
      alreadyUnlocked: false,
    };
  }

  /**
   * Get gamification configuration
   */
  async getGamificationConfig() {
    let config = await prisma.gameConfig.findUnique({
      where: { id: "gamification" },
    });

    // Create default config if not exists
    if (!config) {
      config = await prisma.gameConfig.create({
        data: {
          id: "gamification",
          heartsMaxHearts: 4,
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

    return {
      hearts: {
        maxHearts: config.heartsMaxHearts,
        recoveryTimeMs: config.heartsRecoveryTimeMs,
        premiumRecoveryTimeMs: config.heartsPremiumRecoveryTimeMs,
      },
      streaks: {
        checkInHours: config.streaksCheckInHours,
        xpMultiplierFormula: config.streaksXpMultiplierFormula,
        milestones: config.streaksMilestones as number[],
      },
      characters: {
        unlockXpThreshold: config.charactersUnlockXpThreshold,
        purchaseXpCost: config.charactersPurchaseXpCost,
      },
      gamification: {
        enabled: config.gamificationEnabled,
        eventMultiplier: config.gamificationEventMultiplier,
      },
    };
  }

  /**
   * Update gamification configuration
   */
  async updateGamificationConfig(newConfig: any) {
    // Validate config
    if (newConfig.hearts?.maxHearts) {
      if (newConfig.hearts.maxHearts < 1 || newConfig.hearts.maxHearts > 10) {
        throw new HttpError(400, "Max hearts must be between 1 and 10");
      }
    }

    if (newConfig.hearts?.recoveryTimeMs) {
      if (newConfig.hearts.recoveryTimeMs < 300000) {
        throw new HttpError(
          400,
          "Recovery time must be at least 5 minutes (300000ms)",
        );
      }
    }

    // Get current config first
    let config = await prisma.gameConfig.findUnique({
      where: { id: "gamification" },
    });

    if (!config) {
      config = await prisma.gameConfig.create({
        data: {
          id: "gamification",
          heartsMaxHearts: 5,
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

    // Build update data dynamically
    const updateData: any = {};

    if (newConfig.hearts) {
      if (newConfig.hearts.maxHearts !== undefined) {
        updateData.heartsMaxHearts = newConfig.hearts.maxHearts;
      }
      if (newConfig.hearts.recoveryTimeMs !== undefined) {
        updateData.heartsRecoveryTimeMs = newConfig.hearts.recoveryTimeMs;
      }
      if (newConfig.hearts.premiumRecoveryTimeMs !== undefined) {
        updateData.heartsPremiumRecoveryTimeMs =
          newConfig.hearts.premiumRecoveryTimeMs;
      }
    }

    if (newConfig.streaks) {
      if (newConfig.streaks.checkInHours !== undefined) {
        updateData.streaksCheckInHours = newConfig.streaks.checkInHours;
      }
      if (newConfig.streaks.xpMultiplierFormula !== undefined) {
        updateData.streaksXpMultiplierFormula =
          newConfig.streaks.xpMultiplierFormula;
      }
      if (newConfig.streaks.milestones !== undefined) {
        updateData.streaksMilestones = newConfig.streaks.milestones;
      }
    }

    if (newConfig.characters) {
      if (newConfig.characters.unlockXpThreshold !== undefined) {
        updateData.charactersUnlockXpThreshold =
          newConfig.characters.unlockXpThreshold;
      }
      if (newConfig.characters.purchaseXpCost !== undefined) {
        updateData.charactersPurchaseXpCost =
          newConfig.characters.purchaseXpCost;
      }
    }

    if (newConfig.gamification) {
      if (newConfig.gamification.enabled !== undefined) {
        updateData.gamificationEnabled = newConfig.gamification.enabled;
      }
      if (newConfig.gamification.eventMultiplier !== undefined) {
        updateData.gamificationEventMultiplier =
          newConfig.gamification.eventMultiplier;
      }
    }

    // Update only if there are changes
    if (Object.keys(updateData).length === 0) {
      return {
        message: "No configuration changes provided",
      };
    }

    const updated = await prisma.gameConfig.update({
      where: { id: "gamification" },
      data: updateData,
    });

    return {
      hearts: {
        maxHearts: updated.heartsMaxHearts,
        recoveryTimeMs: updated.heartsRecoveryTimeMs,
        premiumRecoveryTimeMs: updated.heartsPremiumRecoveryTimeMs,
      },
      streaks: {
        checkInHours: updated.streaksCheckInHours,
        xpMultiplierFormula: updated.streaksXpMultiplierFormula,
        milestones: updated.streaksMilestones as number[],
      },
      characters: {
        unlockXpThreshold: updated.charactersUnlockXpThreshold,
        purchaseXpCost: updated.charactersPurchaseXpCost,
      },
      gamification: {
        enabled: updated.gamificationEnabled,
        eventMultiplier: updated.gamificationEventMultiplier,
      },
      message: "Configuration updated successfully",
    };
  }

  /**
   * Create a special event with multiplier
   */
  async createGameEvent(
    eventName: string,
    multiplier: number,
    durationHours: number,
    affectedSystem: "hearts" | "xp" | "all",
    description?: string,
  ) {
    if (multiplier < 0.5 || multiplier > 10) {
      throw new HttpError(400, "Multiplier must be between 0.5 and 10");
    }

    if (durationHours < 1 || durationHours > 720) {
      throw new HttpError(400, "Duration must be between 1 hour and 30 days");
    }

    // Check if event name already exists
    const existingEvent = await prisma.gameEvent.findUnique({
      where: { eventName },
    });

    if (existingEvent) {
      throw new HttpError(409, `Event "${eventName}" already exists`);
    }

    const startsAt = new Date();
    const endsAt = new Date(
      startsAt.getTime() + durationHours * 60 * 60 * 1000,
    );

    return await prisma.gameEvent.create({
      data: {
        eventName,
        description:
          description || `${multiplier}x multiplier for ${affectedSystem}`,
        multiplier,
        durationHours,
        affectedSystem,
        startsAt,
        endsAt,
        isActive: true,
      },
    });
  }

  /**
   * Get user's full gamification profile
   */
  async getUserGamificationProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatar: true,
        xp: true,
      },
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const [hearts, streak, characters] = await Promise.all([
      prisma.userHearts.findUnique({
        where: { userId },
      }),
      prisma.userStreak.findUnique({
        where: { userId },
      }),
      prisma.collectedCharacter.findMany({
        where: { userId },
        include: {
          character: true,
        },
      }),
    ]);

    return {
      user,
      hearts: {
        ...hearts,
        nextRecoveryAt: hearts ? this.calculateNextRecoveryTime(hearts) : null,
      },
      streak,
      collectedCharacters: characters,
      totalCharactersCollected: characters.length,
    };
  }

  /**
   * Bulk restore hearts for all users
   */
  async bulkRestoreHearts(heartsPerUser: number = 5) {
    // Fetch current gamification config
    const config = await this.getGamificationConfig();
    const configuredMaxHearts = config.hearts.maxHearts;

    // Use configured max hearts as the ceiling
    const maxHeartsToRestore = Math.min(heartsPerUser, configuredMaxHearts);

    // Get all users and restore their hearts to the configured max
    const allUsers = await prisma.userHearts.findMany();

    const updates = await Promise.all(
      allUsers.map((user) =>
        prisma.userHearts.update({
          where: { userId: user.userId },
          data: {
            hearts: maxHeartsToRestore,
            lastHeartLossAt: null,
          },
        }),
      ),
    );

    return {
      usersUpdated: updates.length,
      heartsRestored: maxHeartsToRestore,
      configuredMaxHearts,
      message: `Restored all users to ${maxHeartsToRestore} hearts`,
    };
  }

  /**
   * Get all active game events (non-expired)
   */
  async getAllGameEvents() {
    const now = new Date();
    return await prisma.gameEvent.findMany({
      where: {
        isActive: true,
        endsAt: {
          gt: now, // Only show events that haven't expired yet
        },
      },
      orderBy: {
        startsAt: "desc",
      },
    });
  }

  /**
   * Delete/deactivate a game event
   */
  async deleteGameEvent(eventId: string) {
    const event = await prisma.gameEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new HttpError(404, "Game event not found");
    }

    return await prisma.gameEvent.update({
      where: { id: eventId },
      data: { isActive: false },
    });
  }

  /**
   * Sync all users' hearts with current gamification settings
   * Updates maxHearts and recoveryTimeMs for all users to match configured values
   */
  async syncAllUsersHeartsWithConfig() {
    const config = await this.getGamificationConfig();
    const configuredMaxHearts = config.hearts.maxHearts;
    const configuredRecoveryTimeMs = config.hearts.recoveryTimeMs;

    // Update all users' heart settings
    const result = await prisma.userHearts.updateMany({
      data: {
        maxHearts: configuredMaxHearts,
        recoveryTimeMs: configuredRecoveryTimeMs,
      },
    });

    // For users with hearts > configured max, reduce their hearts to max
    const usersWithExcessHearts = await prisma.userHearts.findMany({
      where: {
        hearts: {
          gt: configuredMaxHearts,
        },
      },
    });

    for (const user of usersWithExcessHearts) {
      await prisma.userHearts.update({
        where: { userId: user.userId },
        data: { hearts: configuredMaxHearts },
      });
    }

    return {
      message:
        "Successfully synced all users' hearts with gamification settings",
      configuredMaxHearts,
      configuredRecoveryTimeMs,
      totalUsersUpdated: result.count,
      usersWithExcessHeartsReduced: usersWithExcessHearts.length,
    };
  }

  /**
   * Private helper to calculate next recovery time
   */
  private calculateNextRecoveryTime(userHearts: any) {
    if (userHearts.hearts >= userHearts.maxHearts) {
      return new Date(); // Already full
    }

    if (!userHearts.lastHeartLossAt) {
      return new Date();
    }

    // Use the user's configured recovery time from the database
    const recoveryTimeMs = userHearts.recoveryTimeMs || 3600000; // Default to 1 hour if not set
    return new Date(userHearts.lastHeartLossAt.getTime() + recoveryTimeMs);
  }
}

export const gamificationAdminService = new GamificationAdminService();
