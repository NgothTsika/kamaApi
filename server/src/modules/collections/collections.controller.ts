import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { requireAuth } from "../../middleware/auth.middleware";
import { HttpError } from "../../lib/errors";

export const collectionsRouter = Router();

collectionsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const collections = await prisma.collection.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: "desc" },
      include: {
        items: {
          orderBy: [{ order: "asc" }, { addedAt: "asc" }],
          include: {
            lesson: { select: { id: true, slug: true, title: true, coverImage: true } },
          },
        },
      },
    });

    res.status(200).json({ collections });
  }),
);

collectionsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bodySchema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      isPublic: z.boolean().optional(),
    });
    const { title, description, isPublic } = bodySchema.parse(req.body);

    const collection = await prisma.collection.create({
      data: {
        userId: req.user!.id,
        title,
        description,
        isPublic: isPublic ?? false,
      },
    });

    res.status(201).json({ collection });
  }),
);

collectionsRouter.put(
  "/:collectionId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ collectionId: z.string().min(1) });
    const { collectionId } = paramsSchema.parse(req.params);

    const bodySchema = z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).optional().nullable(),
      isPublic: z.boolean().optional(),
    });
    const body = bodySchema.parse(req.body);

    const existing = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, userId: true },
    });
    if (!existing) throw new HttpError(404, "Collection not found");
    if (existing.userId !== req.user!.id) throw new HttpError(403, "Forbidden");

    const collection = await prisma.collection.update({
      where: { id: collectionId },
      data: {
        title: body.title ?? undefined,
        description: body.description === undefined ? undefined : body.description,
        isPublic: body.isPublic ?? undefined,
      },
    });

    res.status(200).json({ collection });
  }),
);

collectionsRouter.delete(
  "/:collectionId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ collectionId: z.string().min(1) });
    const { collectionId } = paramsSchema.parse(req.params);

    const existing = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, userId: true },
    });
    if (!existing) throw new HttpError(404, "Collection not found");
    if (existing.userId !== req.user!.id) throw new HttpError(403, "Forbidden");

    await prisma.collection.delete({ where: { id: collectionId } });
    res.status(204).send();
  }),
);

collectionsRouter.post(
  "/:collectionId/items",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({ collectionId: z.string().min(1) });
    const { collectionId } = paramsSchema.parse(req.params);

    const bodySchema = z.object({
      lessonId: z.string().min(1),
      order: z.number().int().min(0).optional(),
    });
    const { lessonId, order } = bodySchema.parse(req.body);

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, userId: true },
    });
    if (!collection) throw new HttpError(404, "Collection not found");
    if (collection.userId !== req.user!.id) throw new HttpError(403, "Forbidden");

    const item = await prisma.collectionItem.upsert({
      where: { collectionId_lessonId: { collectionId, lessonId } },
      create: { collectionId, lessonId, order: order ?? 0 },
      update: { order: order ?? undefined },
    });

    res.status(201).json({ item });
  }),
);

collectionsRouter.delete(
  "/:collectionId/items/:lessonId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const paramsSchema = z.object({
      collectionId: z.string().min(1),
      lessonId: z.string().min(1),
    });
    const { collectionId, lessonId } = paramsSchema.parse(req.params);

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, userId: true },
    });
    if (!collection) throw new HttpError(404, "Collection not found");
    if (collection.userId !== req.user!.id) throw new HttpError(403, "Forbidden");

    await prisma.collectionItem.deleteMany({
      where: { collectionId, lessonId },
    });

    res.status(204).send();
  }),
);

