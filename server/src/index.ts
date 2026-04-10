import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";
import { prisma } from "./lib/prisma";

const app: Express = express();
let server: any;

// Trust proxy (important for Vercel)
app.set("trust proxy", 1);

// Security Middleware - Protect against common vulnerabilities
app.use(helmet());

// Compression Middleware - Optimize response size
app.use(compression());

// Request Logging - Monitor API usage
if (env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// Rate Limiting - Prevent API abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting for authenticated requests (those with valid Authorization header)
  skip: (req) => {
    const authHeader = req.headers.authorization;
    return !!authHeader; // Skip rate limiting if Authorization header exists
  },
});
app.use(limiter);

// CORS Configuration - Enable cross-origin requests
app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // 24 hours
  }),
);

// Body Parser Middleware - Parse incoming request bodies
// Note: Multer handles multipart/form-data, so we only parse JSON and URL-encoded
// DO NOT add these middleware globally for routes that use multer
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Health Check Endpoint - Basic server health
app.get("/health", async (_req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      app: "KamaGame",
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      database: "connected",
      version: "1.0.0",
    });
  } catch (error) {
    res.status(503).json({
      app: "KamaGame",
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Ready Check Endpoint - For Vercel deployment
app.get("/ready", (_req, res) => {
  res.status(200).json({ ready: true });
});

// API Routes
app.use("/", apiRouter);

// 404 Handler
app.use(notFoundHandler);

// Error Handler
app.use(errorHandler);

/**
 * Graceful Shutdown Handler
 * Ensures clean server shutdown on SIGTERM/SIGINT signals
 */
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} signal received: closing HTTP server`);

  if (server) {
    server.close(async () => {
      console.log("HTTP server closed");

      try {
        await prisma.$disconnect();
        console.log("Database connection closed");
      } catch (error) {
        console.error("Error disconnecting database:", error);
      }

      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error("Forced shutdown due to timeout");
      process.exit(1);
    }, 10000);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

/**
 * Uncaught Exception Handler
 * Catches unexpected errors
 */
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

/**
 * Unhandled Rejection Handler
 * Catches unhandled promise rejections
 */
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

/**
 * Initialize and Start Server
 * Wrapped in async IIFE to handle async initialization
 */
async function initializeServer() {
  const PORT = env.PORT || 3000;

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    console.log("✓ Database connection established");
  } catch (error) {
    console.error("✗ Failed to connect to database:", error);
    process.exit(1);
  }

  // Start listening on port
  server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log("╔════════════════════════════════════════╗");
    console.log("║       🎮 KamaGame API Server 🎮        ║");
    console.log("╠════════════════════════════════════════╣");
    console.log(`║ Port:     ${PORT.toString().padEnd(32)}║`);
    console.log(`║ Status:   Running${" ".repeat(26)}     ║`);
    console.log(`║ Env:      ${env.NODE_ENV.padEnd(32)}   ║`);
    console.log(`║ CORS:     ${env.CORS_ORIGIN.padEnd(32)}║`);
    console.log("╠════════════════════════════════════════╣");
    console.log("║ Endpoints:                             ║");
    console.log(
      `║ • Health:  http://localhost:${PORT}/health${" ".repeat(5 + (3000 - PORT).toString().length)}║`,
    );
    console.log(
      `║ • Ready:   http://localhost:${PORT}/ready${" ".repeat(6 + (3000 - PORT).toString().length)}║`,
    );
    console.log(
      `║ • API:     http://localhost:${PORT}${" ".repeat(13 + (3000 - PORT).toString().length)}║`,
    );
  });
}

// Only start the server if this is running locally (not in Vercel)
if (process.env.VERCEL !== "1") {
  /**
   * Start the server for local development
   */
  initializeServer().catch((error) => {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  });
}

// Export the Express app for use in:
// 1. Vercel serverless functions (api/index.ts will wrap this)
// 2. Other environments where the app is used as middleware
export default app;
