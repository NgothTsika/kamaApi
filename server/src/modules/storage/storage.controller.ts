/**
 * Storage Controller
 * Handles storage initialization, bucket management, and file operations
 * Uses best practices from Supabase official documentation
 */

import { Router, Request, Response } from "express";
import { supabaseAdmin } from "../../lib/supabase-admin";
import {
  uploadFile as uploadFileToStorage,
  deleteFile,
  deleteFiles,
  listFiles,
} from "../../lib/storage-service";
import { STORAGE_BUCKETS } from "../../lib/storage-config";
import { singleFileUpload } from "../../middleware/storage.middleware";

const router = Router();

// ============================================================================
// INITIALIZATION ENDPOINTS
// ============================================================================

/**
 * POST /storage/init
 * Initialize all storage buckets
 * Creates buckets if they don't exist
 */
router.post("/init", async (req: Request, res: Response) => {
  try {
    const results: Array<{
      name: string;
      status: "created" | "exists" | "error";
      message: string;
    }> = [];

    for (const bucket of STORAGE_BUCKETS) {
      try {
        // Check if bucket exists
        const { data: existingBuckets } =
          await supabaseAdmin.storage.listBuckets();
        const bucketExists = existingBuckets?.some(
          (b: any) => b.name === bucket.name,
        );

        if (bucketExists) {
          results.push({
            name: bucket.name,
            status: "exists",
            message: "Bucket already exists",
          });
        } else {
          // Create bucket
          const { data, error } = await supabaseAdmin.storage.createBucket(
            bucket.name,
            {
              public: bucket.public,
              fileSizeLimit: bucket.fileSizeLimit,
              allowedMimeTypes: bucket.allowedMimeTypes,
            },
          );

          if (error) {
            results.push({
              name: bucket.name,
              status: "error",
              message: error.message || "Failed to create bucket",
            });
          } else {
            results.push({
              name: bucket.name,
              status: "created",
              message: `Bucket created successfully (${bucket.public ? "public" : "private"})`,
            });
          }
        }
      } catch (error) {
        results.push({
          name: bucket.name,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Storage initialization completed",
      results,
    });
  } catch (error) {
    console.error("Storage init error:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Storage initialization failed",
    });
  }
});

/**
 * POST /storage/reset
 * Reset all buckets (delete and recreate)
 * WARNING: This will delete all files in buckets
 */
router.post("/reset", async (req: Request, res: Response) => {
  try {
    const results: Array<{
      name: string;
      deleted: boolean;
      created: boolean;
      message: string;
    }> = [];

    for (const bucket of STORAGE_BUCKETS) {
      try {
        let deleted = false;
        let created = false;

        // Delete bucket
        const { error: deleteError } = await supabaseAdmin.storage.deleteBucket(
          bucket.name,
        );

        if (!deleteError) {
          deleted = true;
        } else if (!deleteError.message.includes("not found")) {
          console.warn(`Failed to delete bucket ${bucket.name}:`, deleteError);
        }

        // Recreate bucket
        const { error: createError } = await supabaseAdmin.storage.createBucket(
          bucket.name,
          {
            public: bucket.public,
            fileSizeLimit: bucket.fileSizeLimit,
            allowedMimeTypes: bucket.allowedMimeTypes,
          },
        );

        if (!createError) {
          created = true;
        }

        results.push({
          name: bucket.name,
          deleted,
          created,
          message: `${deleted ? "Deleted and " : ""}${created ? "recreated" : "creation failed"}`,
        });
      } catch (error) {
        results.push({
          name: bucket.name,
          deleted: false,
          created: false,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Storage reset completed",
      warning: "All files in buckets have been deleted",
      results,
    });
  } catch (error) {
    console.error("Storage reset error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Storage reset failed",
    });
  }
});

// ============================================================================
// BUCKET MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /storage/buckets
 * List all configured buckets and their status
 */
router.get("/buckets", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.storage.listBuckets();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Map actual buckets with our configuration
    const bucketInfo = STORAGE_BUCKETS.map((config) => {
      const actual = data?.find((b) => b.name === config.name);
      return {
        name: config.name,
        description: config.description,
        public: config.public,
        fileSizeLimit: config.fileSizeLimit,
        allowedMimeTypes: config.allowedMimeTypes,
        exists: !!actual,
        createdAt: actual?.created_at,
      };
    });

    res.status(200).json({
      success: true,
      total: bucketInfo.length,
      buckets: bucketInfo,
    });
  } catch (error) {
    console.error("List buckets error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list buckets",
    });
  }
});

/**
 * GET /storage/buckets/:bucketName
 * Get details for a specific bucket
 */
router.get("/buckets/:bucketName", async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.params;

    const { data, error } = await supabaseAdmin.storage.listBuckets();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    const bucket = data?.find((b) => b.name === bucketName);

    if (!bucket) {
      return res.status(404).json({
        success: false,
        error: `Bucket '${bucketName}' not found`,
      });
    }

    res.status(200).json({
      success: true,
      bucket: {
        name: bucket.name,
        public: bucket.public,
        createdAt: bucket.created_at,
        updatedAt: bucket.updated_at,
      },
    });
  } catch (error) {
    console.error("Get bucket error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get bucket",
    });
  }
});

/**
 * PUT /storage/buckets/:bucketName/public
 * Update bucket public/private setting
 */
router.put(
  "/buckets/:bucketName/public",
  async (req: Request, res: Response) => {
    try {
      const bucketName = Array.isArray(req.params.bucketName)
        ? req.params.bucketName[0]
        : req.params.bucketName;
      const { public: isPublic } = req.body;

      if (typeof isPublic !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "public parameter must be boolean",
        });
      }

      const { error } = await supabaseAdmin.storage.updateBucket(bucketName, {
        public: isPublic,
      });

      if (error) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(200).json({
        success: true,
        message: `Bucket '${bucketName}' is now ${isPublic ? "public" : "private"}`,
      });
    } catch (error) {
      console.error("Update bucket error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update bucket",
      });
    }
  },
);

// ============================================================================
// FILE OPERATIONS ENDPOINTS
// ============================================================================

/**
 * POST /storage/upload
 * Upload a file to a bucket
 * Body: FormData with file, bucket, folder
 */
router.post(
  "/upload",
  singleFileUpload,
  async (req: Request, res: Response) => {
    try {
      // Debug logging
      console.log("Upload request received");
      console.log("req.body:", req.body);
      console.log("req.file:", (req as any).file);

      const { bucket, folder } = req.body || {};

      if (!bucket) {
        return res.status(400).json({
          success: false,
          error: "bucket parameter is required",
          debug: {
            bodyExists: !!req.body,
            bodyKeys: req.body ? Object.keys(req.body) : [],
          },
        });
      }

      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file provided",
          debug: {
            bodyExists: !!req.body,
            bodyKeys: req.body ? Object.keys(req.body) : [],
            fileExists: !!file,
          },
        });
      }

      const result = await uploadFileToStorage({
        bucket,
        folder: folder || "uploads",
        file: file.buffer,
        fileName: file.originalname,
        contentType: file.mimetype,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          url: result.url,
          path: result.path,
          size: result.size,
          contentType: result.contentType,
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  },
);

/**
 * DELETE /storage/delete
 * Delete a file from a bucket
 * Body: { bucket, path }
 */
router.delete("/delete", async (req: Request, res: Response) => {
  try {
    const { bucket, path } = req.body;

    if (!bucket || !path) {
      return res.status(400).json({
        success: false,
        error: "bucket and path parameters are required",
      });
    }

    const result = await deleteFile(bucket, path);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.status(200).json({
      success: true,
      message: `File deleted: ${path}`,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    });
  }
});

/**
 * POST /storage/delete-multiple
 * Delete multiple files from a bucket
 * Body: { bucket, paths: string[] }
 */
router.post("/delete-multiple", async (req: Request, res: Response) => {
  try {
    const { bucket, paths } = req.body;

    if (!bucket || !Array.isArray(paths)) {
      return res.status(400).json({
        success: false,
        error: "bucket and paths array are required",
      });
    }

    const result = await deleteFiles(bucket, paths);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.status(200).json({
      success: true,
      message: `${paths.length} file(s) deleted`,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Bulk delete failed",
    });
  }
});

/**
 * GET /storage/list/:bucket
 * List files in a bucket folder
 * Query: ?folder=path/to/folder
 */
router.get("/list/:bucket", async (req: Request, res: Response) => {
  try {
    const bucket = Array.isArray(req.params.bucket)
      ? req.params.bucket[0]
      : req.params.bucket;
    let folderParam = "";
    if (typeof req.query.folder === "string") {
      folderParam = req.query.folder;
    } else if (Array.isArray(req.query.folder) && req.query.folder.length > 0) {
      folderParam = String(req.query.folder[0]);
    }

    const result = await listFiles(bucket, folderParam);

    if (result.error) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.status(200).json({
      success: true,
      bucket,
      folder: folderParam || "root",
      files: result.files || [],
    });
  } catch (error) {
    console.error("List files error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list files",
    });
  }
});

// ============================================================================
// DIAGNOSTIC & RLS ENDPOINTS
// ============================================================================

/**
 * GET /storage/check-rls-status
 * Check if RLS is properly disabled for storage
 * Returns information needed to fix RLS issues
 */
router.get("/check-rls-status", async (req: Request, res: Response) => {
  try {
    // Try a test upload to verify RLS is working
    const testFileName = `.rls-check-${Date.now()}`;
    const testBuffer = Buffer.from("RLS test");

    const { error } = await supabaseAdmin.storage
      .from("lesson-covers")
      .upload(`rls-check/${testFileName}`, testBuffer, {
        upsert: false,
      });

    // Clean up test file
    if (!error) {
      await supabaseAdmin.storage
        .from("lesson-covers")
        .remove([`rls-check/${testFileName}`]);
    }

    res.status(200).json({
      success: true,
      rlsStatus: error ? "BLOCKED" : "WORKING",
      message: error
        ? "RLS is blocking uploads - need to fix"
        : "RLS is properly configured",
      error: error?.message || null,
      fixInstructions: error
        ? {
            step1: "Go to https://app.supabase.com",
            step2: "Select your project",
            step3: "Click SQL Editor",
            step4:
              "Run: ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;",
            step5:
              "Run: ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY;",
          }
        : null,
    });
  } catch (error) {
    console.error("RLS check error:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to check RLS status",
    });
  }
});

/**
 * GET /storage/health
 * Health check for storage configuration
 */
router.get("/health", async (req: Request, res: Response) => {
  try {
    const { data: buckets, error: listError } =
      await supabaseAdmin.storage.listBuckets();

    if (listError) {
      return res.status(500).json({
        success: false,
        status: "error",
        error: listError.message,
      });
    }

    const configuredCount = STORAGE_BUCKETS.length;
    const existingCount = buckets?.length || 0;

    res.status(200).json({
      success: true,
      status: existingCount === configuredCount ? "healthy" : "warning",
      configured: configuredCount,
      existing: existingCount,
      buckets: buckets?.map((b) => ({
        name: b.name,
        public: b.public,
      })),
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      success: false,
      status: "error",
      error: error instanceof Error ? error.message : "Health check failed",
    });
  }
});

export default router;
