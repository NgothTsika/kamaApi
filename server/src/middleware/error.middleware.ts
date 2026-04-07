import { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
};
