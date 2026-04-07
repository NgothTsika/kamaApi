import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().min(1),
  // Optional until you add the OAuth client IDs.
  // Auth endpoints will return a 500 if they are missing.
  GOOGLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ")}`,
  );
}

export const env = parsed.data;
