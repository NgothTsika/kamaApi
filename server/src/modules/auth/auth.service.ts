import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { User } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/errors";
import { initializeGamificationForNewUser } from "../gamification/gamification.integration";

type OAuthProfile = {
  email: string;
  avatar?: string;
};

const googleClient = env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(env.GOOGLE_CLIENT_ID)
  : null;
const appleJwks = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

const oauthPasswordPlaceholder = "__OAUTH__";

const buildUniqueUsername = async (email: string): Promise<string> => {
  const base = email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .toLowerCase();
  const initial = base.length > 2 ? base : `kamagamer${Date.now()}`;

  let attempt = initial;
  let index = 1;
  while (true) {
    const existing = await prisma.user.findUnique({
      where: { username: attempt },
    });
    if (!existing) return attempt;
    attempt = `${initial}${index}`;
    index += 1;
  }
};

const upsertSocialUser = async (
  profile: OAuthProfile,
  language?: string,
): Promise<User> => {
  const existing = await prisma.user.findUnique({
    where: { email: profile.email },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        avatar: profile.avatar ?? existing.avatar,
        language: language ?? existing.language,
      },
    });
  }

  const username = await buildUniqueUsername(profile.email);
  const newUser = await prisma.user.create({
    data: {
      email: profile.email,
      username,
      passwordHash: oauthPasswordPlaceholder,
      emailVerified: true,
      avatar: profile.avatar,
      language,
    },
  });

  // Initialize gamification for new user
  await initializeGamificationForNewUser(newUser.id);

  return newUser;
};

const createSession = async (userId: string) => {
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return session;
};

export const loginWithGoogle = async (
  idToken: string,
  language?: string,
): Promise<{ user: User; session: { token: string; expiresAt: Date } }> => {
  if (!googleClient) {
    throw new HttpError(500, "Google auth is not configured on the server");
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new HttpError(401, "Invalid Google token");
  }

  const user = await upsertSocialUser(
    { email: payload.email, avatar: payload.picture ?? undefined },
    language,
  );
  const session = await createSession(user.id);

  return { user, session };
};

export const loginWithApple = async (
  idToken: string,
  language?: string,
): Promise<{ user: User; session: { token: string; expiresAt: Date } }> => {
  if (!env.APPLE_CLIENT_ID) {
    throw new HttpError(500, "Apple auth is not configured on the server");
  }
  const verification = await jwtVerify(idToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_CLIENT_ID,
  });

  const payload = verification.payload;
  const email = payload.email;
  if (typeof email !== "string" || !email) {
    throw new HttpError(401, "Invalid Apple token");
  }

  const user = await upsertSocialUser({ email }, language);
  const session = await createSession(user.id);

  return { user, session };
};

export const loginWithEmail = async (
  email: string,
  password: string,
  language?: string,
): Promise<{ user: User; session: { token: string; expiresAt: Date } }> => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const session = await createSession(user.id);

  return { user, session };
};

export const registerWithEmail = async (
  username: string,
  email: string,
  password: string,
  language?: string,
): Promise<{ user: User; session: { token: string; expiresAt: Date } }> => {
  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (existingUser) {
    if (existingUser.email === email) {
      throw new HttpError(400, "Email already registered");
    }
    throw new HttpError(400, "Username already taken");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      language: language || "en",
      avatar: null,
    },
  });

  // Initialize gamification for new user
  await initializeGamificationForNewUser(user.id);

  // Create session
  const session = await createSession(user.id);

  return { user, session };
};
