import type { VercelRequest, VercelResponse } from "@vercel/node";
import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { env } from "../src/config/env";
import { apiRouter } from "../src/routes";
import {
  notFoundHandler,
  errorHandler,
} from "../src/middleware/error.middleware";
import { prisma } from "../src/lib/prisma";

const app: Express = express();

// Trust proxy (important for Vercel)
app.set("trust proxy", 1);

// Security Middleware
app.use(helmet());
app.use(compression());

// Request Logging
if (env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const authHeader = req.headers.authorization;
    return !!authHeader;
  },
});
app.use(limiter);

// CORS Configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

// Body Parser Middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Health Check Endpoint
app.get("/health", async (_req, res) => {
  try {
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

// Ready Check Endpoint
app.get("/ready", (_req, res) => {
  res.status(200).json({ ready: true });
});

// API Routes
app.use("/", apiRouter);

// 404 Handler
app.use(notFoundHandler);

// Error Handler
app.use(errorHandler);

// Vercel handler
export default async (req: VercelRequest, res: VercelResponse) => {
  return app(req, res);
};
