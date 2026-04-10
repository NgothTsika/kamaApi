import { Router } from "express";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { HttpError } from "../../lib/errors";

export const usersRouter = Router();

// ==================== /me Routes ====================

usersRouter.get(
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
        role: true,
        language: true,
        xp: true,
        streak: true,
        offlineEnabled: true,
        createdAt: true,
      },
    });

    res.status(200).json({ user });
  }),
);

usersRouter.patch(
  "/me/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      language: z.string().min(2).max(10).optional(),
      offlineEnabled: z.boolean().optional(),
    });
    const body = bodySchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        language: body.language ?? undefined,
        offlineEnabled: body.offlineEnabled ?? undefined,
      },
      select: { id: true, language: true, offlineEnabled: true },
    });

    res.status(200).json({ user });
  }),
);

usersRouter.get(
  "/me/analytics",
  requireAuth,
  asyncHandler(async (req, res) => {
    const analytics = await prisma.userAnalytics.findUnique({
      where: { userId: req.user!.id },
    });

    const fallback = analytics
      ? null
      : await prisma.userAnalytics.create({
          data: { userId: req.user!.id },
        });

    res.status(200).json({ analytics: analytics ?? fallback });
  }),
);

// ==================== Admin Routes (MUST come before /:userId) ====================

usersRouter.get(
  "/admin",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        xp: true,
        streak: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ users });
  }),
);

usersRouter.post(
  "/admin",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["ADMIN", "MODERATOR"]).default("ADMIN"),
      username: z.string().min(3).optional(),
      name: z.string().optional(),
    });

    const body = bodySchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      throw new HttpError(409, "User with this email already exists");
    }

    // Hash password
    const hashedPassword = await hash(body.password, 10);

    // Create new admin user
    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: hashedPassword,
        username: body.username || body.email.split("@")[0],
        role: body.role,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        xp: true,
        streak: true,
        createdAt: true,
      },
    });

    res.status(201).json({ user: newUser });
  }),
);

usersRouter.patch(
  "/admin/:userId",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ userId: z.string().min(1) });
    const bodySchema = z.object({
      role: z.enum(["USER", "MODERATOR", "ADMIN"]).optional(),
      xp: z.number().min(0).optional(),
    });

    const { userId } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new HttpError(404, "User not found");

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: body.role ?? undefined,
        xp: body.xp ?? undefined,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        xp: true,
        streak: true,
        createdAt: true,
      },
    });

    res.status(200).json({ user: updated });
  }),
);

usersRouter.delete(
  "/admin/:userId",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ userId: z.string().min(1) });
    const { userId } = paramsSchema.parse(req.params);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new HttpError(404, "User not found");

    // Prevent deleting the only admin
    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw new HttpError(400, "Cannot delete the only admin user");
      }
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    res.status(204).send();
  }),
);

// ==================== Generic Routes (/:userId must come LAST) ====================

usersRouter.get(
  "/:userId",
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ userId: z.string().min(1) });
    const { userId } = paramsSchema.parse(req.params);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatar: true,
        language: true,
        xp: true,
        streak: true,
        createdAt: true,
      },
    });

    if (!user) throw new HttpError(404, "User not found");
    res.status(200).json({ user });
  }),
);
