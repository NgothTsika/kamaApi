import { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: Pick<User, "id" | "email" | "username" | "language" | "role">;
      sessionToken?: string;
    }
  }
}

export {};
