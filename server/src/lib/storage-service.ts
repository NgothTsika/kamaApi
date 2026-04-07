/**
 * Supabase Storage Service
 * Handles all file upload, download, and deletion operations
 * Uses best practices recommended by Supabase developers
 */

import { supabaseAdmin } from "./supabase-admin";
import { getBucketConfig, validateFileForBucket } from "./storage-config";

export interface UploadFileOptions {
  bucket: string;
  folder: string;
  file: File | Buffer;
  fileName?: string;
  contentType?: string;
}

export interface UploadResult {
  success: boolean;
  url: string;
  path: string;
  size: number;
  contentType: string;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Generate a unique file path to prevent overwrites
 * Format: bucket/folder/timestamp-random-originalname
 */
function generateUniquePath(folder: string, fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const cleaned = fileName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "");
  const uniqueName = `${timestamp}-${random}-${cleaned}`;
  return `${folder}/${uniqueName}`;
}

/**
 * Upload a file to Supabase Storage
 * Best practice: Use FormData with multipart/form-data content-type
 * Bypass RLS by using service role on server
 */
export async function uploadFile(
  options: UploadFileOptions,
): Promise<UploadResult> {
  const { bucket, folder, file, fileName, contentType } = options;

  try {
    // Validate bucket exists
    const bucketConfig = getBucketConfig(bucket);
    if (!bucketConfig) {
      throw new Error(`Bucket '${bucket}' not configured`);
    }

    // Get file data
    let fileData: Buffer | File;
    let fileSize: number;
    let mimeType: string;

    if (file instanceof File) {
      fileData = file;
      fileSize = file.size;
      mimeType = contentType || file.type;
    } else {
      fileData = file;
      fileSize = file.length;
      mimeType = contentType || "application/octet-stream";
    }

    // Validate file for bucket
    // Convert Buffer to Uint8Array for File constructor compatibility
    const fileBuffer = Buffer.isBuffer(fileData)
      ? new Uint8Array(fileData)
      : fileData;

    const validation = validateFileForBucket(
      new File([fileBuffer], fileName || "file", { type: mimeType }),
      bucket,
    );

    if (!validation.valid) {
      throw new Error(validation.error || "File validation failed");
    }

    // Generate unique path
    const filePath = generateUniquePath(folder, fileName || "file");

    // Upload with proper options
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(filePath, fileData, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false, // Prevent accidental overwrites
      });

    if (error) {
      console.error(`Upload error for ${bucket}/${filePath}:`, error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);

    return {
      success: true,
      url: publicUrl,
      path: filePath,
      size: fileSize,
      contentType: mimeType,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Upload error: ${errorMessage}`);
    return {
      success: false,
      url: "",
      path: "",
      size: 0,
      contentType: "",
      error: errorMessage,
    };
  }
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(
  bucket: string,
  filePath: string,
): Promise<DeleteResult> {
  try {
    // Validate bucket exists
    const bucketConfig = getBucketConfig(bucket);
    if (!bucketConfig) {
      throw new Error(`Bucket '${bucket}' not configured`);
    }

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Delete error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete multiple files from Supabase Storage
 */
export async function deleteFiles(
  bucket: string,
  filePaths: string[],
): Promise<DeleteResult> {
  try {
    if (filePaths.length === 0) {
      return { success: true };
    }

    // Validate bucket exists
    const bucketConfig = getBucketConfig(bucket);
    if (!bucketConfig) {
      throw new Error(`Bucket '${bucket}' not configured`);
    }

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove(filePaths);

    if (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Bulk delete error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get file metadata (size, content-type, etc.)
 */
export async function getFileMetadata(
  bucket: string,
  filePath: string,
): Promise<{
  size?: number;
  contentType?: string;
  error?: string;
}> {
  try {
    // Validate bucket exists
    const bucketConfig = getBucketConfig(bucket);
    if (!bucketConfig) {
      throw new Error(`Bucket '${bucket}' not configured`);
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .info(filePath);

    if (error) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }

    return {
      size: data?.size,
      contentType: data?.contentType,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { error: errorMessage };
  }
}

/**
 * List files in a bucket folder
 */
export async function listFiles(
  bucket: string,
  folder: string = "",
): Promise<{
  files?: Array<{ name: string; id: string | null; updated_at: string | null }>;
  error?: string;
}> {
  try {
    // Validate bucket exists
    const bucketConfig = getBucketConfig(bucket);
    if (!bucketConfig) {
      throw new Error(`Bucket '${bucket}' not configured`);
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(folder);

    if (error) {
      throw new Error(`List failed: ${error.message}`);
    }

    return { files: data || [] };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { error: errorMessage };
  }
}
