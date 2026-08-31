import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "selaren_session";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret() {
  const s = process.env.SELAREN_SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SELAREN_SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  userId: string;
  clinicId: string | null;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = String(payload.userId ?? "");
    if (!userId) return null;
    return {
      userId,
      clinicId: payload.clinicId ? String(payload.clinicId) : null,
    };
  } catch {
    return null;
  }
}

const loginAttempts = new Map<string, { n: number; resetAt: number }>();

export function loginAllowed(key: string): boolean {
  const now = Date.now();
  const row = loginAttempts.get(key);
  if (!row || now > row.resetAt) {
    loginAttempts.set(key, { n: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (row.n >= 10) return false;
  row.n += 1;
  return true;
}

export async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { deactivatedAt: null },
        include: { clinic: true },
      },
    },
  });
}
