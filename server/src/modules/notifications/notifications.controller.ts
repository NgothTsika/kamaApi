import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const unreadOnly =
      typeof req.query.unread === "string"
        ? req.query.unread === "true"
        : true;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user!.id,
        read: unreadOnly ? false : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.status(200).json({ notifications });
  }),
);

notificationsRouter.post(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(req.params);

    await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { read: true },
    });

    res.status(204).send();
  }),
);

notificationsRouter.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (_req, res) => {
    await prisma.notification.updateMany({
      where: { userId: _req.user!.id, read: false },
      data: { read: true },
    });

    res.status(204).send();
  }),
);

