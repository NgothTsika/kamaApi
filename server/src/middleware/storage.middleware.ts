/**
 * Storage Middleware
 * Configures multer for handling file uploads
 * Parses both file and text fields from FormData
 */

import multer from "multer";
import { Request, Response, NextFunction } from "express";

// Configure multer for in-memory storage
// Files are stored in memory and passed to the upload handler
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max file size
    files: 1, // Only allow 1 file per request
  },
  fileFilter: (req, file, cb) => {
    // Accept any file type - validation happens in the storage service
    cb(null, true);
  },
});

// Middleware that handles both file and form fields
// This wraps multer's single() to ensure FormData fields are parsed
export const singleFileUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Use multer's any() to capture the file with field name "file"
  // This will automatically parse all text fields into req.body
  uploadMiddleware.single("file")(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      // Handle multer-specific errors
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File size exceeds 1GB limit",
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    } else if (err) {
      // Handle other errors
      return next(err);
    }

    // Ensure req.body exists (multer should have populated it)
    if (!req.body) {
      req.body = {};
    }

    next();
  });
};
