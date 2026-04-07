import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authorization.replace("Bearer ", "").trim();
  const session = await prisma.session.findFirst({
    where: {
      token,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          language: true,
        },
      },
    },
  });

  if (!session) {
    return res.status(401).json({ error: "Invalid session" });
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  req.user = session.user;
  req.sessionToken = token;
  return next();
};
