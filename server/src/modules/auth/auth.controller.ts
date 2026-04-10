import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http";
import { HttpError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import {
  loginWithApple,
  loginWithGoogle,
  loginWithEmail,
  registerWithEmail,
} from "./auth.service";

const authPayloadSchema = z.object({
  idToken: z.string().min(1),
  accessToken: z.string().min(1).optional(),
  language: z.string().min(2).max(10).optional(),
});

const emailPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  language: z.string().min(2).max(10).optional(),
});

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be at most 100 characters"),
  language: z.string().min(2).max(10).optional(),
});

export const authRouter = Router();

authRouter.post(
  "/google",
  asyncHandler(async (req, res) => {
    const payload = authPayloadSchema.safeParse(req.body);
    if (!payload.success) {
      throw new HttpError(400, "Invalid payload");
    }

    const { user, session } = await loginWithGoogle(
      payload.data.idToken,
      payload.data.language,
    );
    res.status(200).json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        language: user.language,
        xp: user.xp,
        streak: user.streak,
        offlineEnabled: user.offlineEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    });
  }),
);

authRouter.post(
  "/email",
  asyncHandler(async (req, res) => {
    const payload = emailPasswordSchema.safeParse(req.body);
    if (!payload.success) {
      throw new HttpError(400, "Invalid email or password");
    }

    const { user, session } = await loginWithEmail(
      payload.data.email,
      payload.data.password,
      payload.data.language,
    );
    res.status(200).json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        language: user.language,
        xp: user.xp,
        streak: user.streak,
        offlineEnabled: user.offlineEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    });
  }),
);

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const payload = registerSchema.safeParse(req.body);
    if (!payload.success) {
      const errors = payload.error.errors.map((e) => e.message).join(", ");
      throw new HttpError(400, errors);
    }

    const { user, session } = await registerWithEmail(
      payload.data.username,
      payload.data.email,
      payload.data.password,
      payload.data.language,
    );
    res.status(200).json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        language: user.language,
        xp: user.xp,
        streak: user.streak,
        offlineEnabled: user.offlineEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    });
  }),
);

authRouter.post(
  "/apple",
  asyncHandler(async (req, res) => {
    const payload = authPayloadSchema.safeParse(req.body);
    if (!payload.success) {
      throw new HttpError(400, "Invalid payload");
    }

    const { user, session } = await loginWithApple(
      payload.data.idToken,
      payload.data.language,
    );
    res.status(200).json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        language: user.language,
        xp: user.xp,
        streak: user.streak,
        offlineEnabled: user.offlineEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        username: true,
        avatar: true,
        language: true,
        xp: true,
        streak: true,
      },
    });

    res.status(200).json({ user });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.session.deleteMany({
      where: {
        token: req.sessionToken,
      },
    });

    res.status(204).send();
  }),
);
