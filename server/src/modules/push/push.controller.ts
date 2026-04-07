import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";

export const pushRouter = Router();

pushRouter.post(
  "/tokens",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      token: z.string().min(1),
      platform: z.enum(["ios", "android"]),
    });
    const { token, platform } = bodySchema.parse(req.body);

    const saved = await prisma.pushToken.upsert({
      where: { token },
      create: { token, platform, userId: req.user!.id },
      update: { platform, userId: req.user!.id },
      select: { id: true, token: true, platform: true, createdAt: true },
    });

    res.status(201).json({ pushToken: saved });
  }),
);

pushRouter.delete(
  "/tokens/:token",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ token: z.string().min(1) });
    const { token } = paramsSchema.parse(req.params);

    await prisma.pushToken.deleteMany({
      where: { token, userId: req.user!.id },
    });

    res.status(204).send();
  }),
);

