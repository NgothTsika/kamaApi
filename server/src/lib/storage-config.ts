/**
 * Storage configuration for Supabase
 * Defines all storage buckets and their settings
 */

export interface StorageBucketConfig {
  name: string;
  public: boolean;
  fileSizeLimit: number; // in bytes
  allowedMimeTypes: string[];
  description: string;
}

export const STORAGE_BUCKETS: StorageBucketConfig[] = [
  // ========== Content Buckets ==========
  {
    name: "lesson-covers",
    public: true,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ],
    description: "Lesson and category cover images",
  },
  {
    name: "chapter-media",
    public: true,
    fileSizeLimit: 104857600, // 100MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/mpeg",
      "audio/wav",
    ],
    description: "Chapter media (images/videos)",
  },
  {
    name: "character-images",
    public: true,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    description: "Character main images and portraits",
  },
  {
    name: "character-inventions",
    public: true,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ],
    description: "Character invention images",
  },

  // ========== User Buckets ==========
  {
    name: "user-avatars",
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    description: "User profile avatars",
  },

  // ========== Community & Submissions ==========
  {
    name: "community-submissions",
    public: true,
    fileSizeLimit: 104857600, // 100MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
    ],
    description: "User-submitted content",
  },

  // ========== Achievement & Icon Buckets ==========
  {
    name: "achievement-icons",
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ],
    description: "Achievement badge icons",
  },

  // ========== Category & Topic Buckets ==========
  {
    name: "category-icons",
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ],
    description: "Category icon images",
  },

  // ========== Game & Quiz Media ==========
  {
    name: "quiz-media",
    public: true,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/wav",
    ],
    description: "Quiz related media",
  },

  // ========== Backups & Admin ==========
  {
    name: "admin-backups",
    public: false,
    fileSizeLimit: 1073741824, // 1GB
    allowedMimeTypes: [
      "application/json",
      "application/zip",
      "application/x-gzip",
      "text/csv",
      "application/pdf",
    ],
    description: "Admin backups and exports",
  },
];

/**
 * Get bucket configuration by name
 */
export function getBucketConfig(
  bucketName: string,
): StorageBucketConfig | undefined {
  return STORAGE_BUCKETS.find((b) => b.name === bucketName);
}

/**
 * Validate file for bucket
 */
export function validateFileForBucket(
  file: File,
  bucketName: string,
): { valid: boolean; error?: string } {
  const config = getBucketConfig(bucketName);

  if (!config) {
    return { valid: false, error: "Bucket not found" };
  }

  if (file.size > config.fileSizeLimit) {
    const limitMB = config.fileSizeLimit / (1024 * 1024);
    return {
      valid: false,
      error: `File size exceeds ${limitMB}MB limit`,
    };
  }

  if (!config.allowedMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed. Accepted types: ${config.allowedMimeTypes.join(", ")}`,
    };
  }

  return { valid: true };
}
