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

// CORS Configuration - Enable cross-origin requests from multiple sources
// Supports: localhost, deployed URL, and any local machine IP (for mobile devices)
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Allowed origins
    const allowedOrigins = [
      // Localhost variants
      "http://localhost:3000",
      "http://localhost:4000",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:4000",
      "http://10.0.2.2:3000", // Android emulator
      "http://10.0.2.2:4000",
      // Deployed URL
      "https://kamapro-one.vercel.app",
      // Wildcard for other local IPs (192.168.x.x, 10.x.x.x ranges)
      // Mobile devices on the same network
    ];

    // If no origin (same-origin requests, or mobile app without origin header)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any local network IP (for mobile devices on home network)
    // Matches patterns: http://192.168.x.x:*, http://10.x.x.x:*, http://172.16.x.x:*
    if (/^http:\/\/(192\.168\.|10\.|172\.16\.)[\d.]+:\d+$/.test(origin)) {
      return callback(null, true);
    }

    // Deny if not in allowed list
    callback(new Error("CORS not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

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
      cors: "enabled",
      acceptedOrigins: [
        "localhost:3000/4000",
        "127.0.0.1:3000/4000",
        "10.0.2.2:3000/4000",
        "192.168.x.x (local network)",
        "kamapro-one.vercel.app",
      ],
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
app.use("/api/v1", apiRouter);

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
      `║ • API:     http://localhost:${PORT}/api/v1${" ".repeat(3 + (3000 - PORT).toString().length)}║`,
    );
    console.log("╠════════════════════════════════════════╣");
    console.log("║ Middleware:                            ║");
    console.log("║ ✓ Helmet (Security)                    ║");
    console.log("║ ✓ Compression                          ║");
    console.log("║ ✓ CORS                                 ║");
    console.log("║ ✓ Rate Limiting                        ║");
    console.log("║ ✓ Request Logging                      ║");
    console.log("║ ✓ Error Handling                       ║");
    console.log("║ ✓ Graceful Shutdown                    ║");
    console.log("║ ✓ Gamification System                  ║");
    console.log("║   - Hearts Recovery                    ║");
    console.log("║   - Streak Tracking                    ║");
    console.log("║   - Character Progression              ║");
    console.log("╚════════════════════════════════════════╝");
  });
}

/**
 * Start the server
 */
initializeServer().catch((error) => {
  console.error("Failed to initialize server:", error);
  process.exit(1);
});

export default app;
