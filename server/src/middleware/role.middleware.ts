import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";

export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const role = (req.user as any)?.role as UserRole | undefined;
    if (!role) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };

