import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/errors";
import { calculateCharacterUnlockProgress } from "./gamification.utils";

/**
 * Character Progression Service
 * Manages character unlocks and progression
 * Model: Paladin (and others)
 */

export interface CharacterProgressState {
  characterId: string;
  isUnlocked: boolean;
  unlockedAt: Date | null;
  isFavorite: boolean;
  collectionLevel: number; // 0-3 hearts
}

/**
 * Get character unlock info
 */
export async function getCharacterUnlock(characterId: string) {
  return await prisma.characterUnlock.findFirst({
    where: { characterId },
    include: {
      character: true,
    },
  });
}

/**
 * Get all character unlocks for a user
 */
export async function getUserCharacterProgress(
  userId: string,
): Promise<CharacterProgressState[]> {
  const collectedCharacters = await prisma.collectedCharacter.findMany({
    where: { userId },
    include: {
      character: true,
    },
    orderBy: { collectedAt: "asc" },
  });

  return collectedCharacters.map((cc) => ({
    characterId: cc.characterId,
    isUnlocked: true,
    unlockedAt: cc.collectedAt,
    isFavorite: false, // TODO: implement favorites tracking in CollectedCharacter
    collectionLevel: 0, // TODO: implement collection levels if needed
  }));
}

/**
 * Check if character should be unlocked for user
 */
export async function checkCharacterUnlock(
  userId: string,
  characterId: string,
): Promise<{ shouldUnlock: boolean; reason?: string }> {
  const characterUnlock = await prisma.characterUnlock.findFirst({
    where: { characterId },
  });

  if (!characterUnlock) {
    return { shouldUnlock: true, reason: "no_unlock_requirement" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return { shouldUnlock: false, reason: "user_not_found" };
  }

  // Check unlock conditions
  switch (characterUnlock.unlockType) {
    case "lesson_completion": {
      if (!characterUnlock.lessonId) {
        return { shouldUnlock: false, reason: "invalid_unlock_config" };
      }

      const completedLesson = await prisma.completedLesson.findUnique({
        where: {
          userId_lessonId: {
            userId,
            lessonId: characterUnlock.lessonId,
          },
        },
      });

      return {
        shouldUnlock: !!completedLesson,
        reason: completedLesson ? "lesson_completed" : "lesson_not_completed",
      };
    }

    case "xp_threshold": {
      if (!characterUnlock.xpRequired) {
        return { shouldUnlock: false, reason: "invalid_unlock_config" };
      }

      return {
        shouldUnlock: user.xp >= characterUnlock.xpRequired,
        reason:
          user.xp >= characterUnlock.xpRequired
            ? "xp_threshold_reached"
            : "xp_threshold_not_reached",
      };
    }

    case "achievement": {
      // Check if user has the required achievement
      const achievement = await prisma.userAchievement.findFirst({
        where: {
          userId,
          achievement: {
            name: characterUnlock.description || "",
          },
        },
      });

      return {
        shouldUnlock: !!achievement,
        reason: achievement ? "achievement_earned" : "achievement_not_earned",
      };
    }

    case "purchase": {
      // Characters purchased with XP are always unlockable if user has enough
      if (!characterUnlock.xpCost) {
        return { shouldUnlock: false, reason: "invalid_unlock_config" };
      }

      return {
        shouldUnlock: user.xp >= characterUnlock.xpCost,
        reason:
          user.xp >= characterUnlock.xpCost
            ? "can_purchase"
            : "insufficient_xp",
      };
    }

    default:
      return { shouldUnlock: false, reason: "unknown_unlock_type" };
  }
}

/**
 * Unlock a character for the user (add to collection)
 */
export async function unlockCharacter(
  userId: string,
  characterId: string,
): Promise<CharacterProgressState> {
  // Check if character is already in collection
  const existing = await prisma.collectedCharacter.findUnique({
    where: {
      userId_characterId: {
        userId,
        characterId,
      },
    },
  });

  if (existing) {
    throw new HttpError(400, "Character is already in your collection");
  }

  // Check unlock conditions
  const unlockCheck = await checkCharacterUnlock(userId, characterId);
  if (!unlockCheck.shouldUnlock) {
    throw new HttpError(400, `Cannot unlock character: ${unlockCheck.reason}`);
  }

  const character = await prisma.collectedCharacter.create({
    data: {
      userId,
      characterId,
    },
    include: {
      character: true,
    },
  });

  return {
    characterId: character.characterId,
    isUnlocked: true,
    unlockedAt: character.collectedAt,
    isFavorite: false, // TODO: implement favorites tracking
    collectionLevel: 0,
  };
}

/**
 * Purchase a character with XP
 */
export async function purchaseCharacter(
  userId: string,
  characterId: string,
): Promise<CharacterProgressState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  const characterUnlock = await prisma.characterUnlock.findFirst({
    where: {
      characterId,
      unlockType: "purchase",
    },
  });

  if (!characterUnlock || !characterUnlock.xpCost) {
    throw new HttpError(400, "Character is not available for purchase");
  }

  if (user.xp < characterUnlock.xpCost) {
    throw new HttpError(
      400,
      `Insufficient XP. Need ${characterUnlock.xpCost}, have ${user.xp}`,
    );
  }

  // Deduct XP and unlock character
  await prisma.user.update({
    where: { id: userId },
    data: {
      xp: user.xp - characterUnlock.xpCost,
    },
  });

  return await unlockCharacter(userId, characterId);
}

/**
 * Add experience to a character (simplified - for future leveling system)
 */
export async function addCharacterExperience(
  userId: string,
  characterId: string,
  xpAmount: number,
): Promise<CharacterProgressState> {
  // Verify character is collected
  const characterProgress = await prisma.collectedCharacter.findUnique({
    where: {
      userId_characterId: {
        userId,
        characterId,
      },
    },
    include: {
      character: true,
    },
  });

  if (!characterProgress) {
    throw new HttpError(404, "Character not in collection");
  }

  // For now, just increase user XP
  // TODO: Implement character-specific leveling system
  await prisma.user.update({
    where: { id: userId },
    data: {
      xp: { increment: xpAmount },
    },
  });

  return {
    characterId: characterProgress.characterId,
    isUnlocked: true,
    unlockedAt: characterProgress.collectedAt,
    isFavorite: false, // TODO: implement favorites tracking
    collectionLevel: 0,
  };
}

/**
 * Set favorite character (feature character)
 */
export async function setFavoriteCharacter(
  userId: string,
  characterId: string,
): Promise<void> {
  const characterProgress = await prisma.collectedCharacter.findUnique({
    where: {
      userId_characterId: {
        userId,
        characterId,
      },
    },
  });

  if (!characterProgress) {
    throw new HttpError(404, "Character not in collection");
  }

  // TODO: Implement favorites tracking in CollectedCharacter model
  // For now, this is a placeholder
}

/**
 * Calculate XP needed for next level
 * Formula: exponential growth (100 * level^1.5)
 */
function calculateNextLevelXP(currentLevel: number): number {
  return Math.floor(100 * Math.pow(currentLevel, 1.5));
}

/**
 * Get character statistics for user
 */
export async function getCharacterStatistics(userId: string) {
  const characters = await prisma.collectedCharacter.findMany({
    where: { userId },
    include: {
      character: true,
    },
  });

  return {
    totalCharacters: characters.length,
    characters: characters.map((c) => ({
      id: c.characterId,
      name: c.character?.name,
      isFavorite: false, // TODO: implement favorites tracking
      collectedAt: c.collectedAt,
    })),
  };
}
