import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

export const EXAMPLE_OPERATOR_PASSWORD = "change-this-password";

export function resolveOperatorCredentials(env: NodeJS.ProcessEnv): {
  email: string;
  password: string;
  resetPassword: boolean;
} {
  const email = (env.SELAREN_OPERATOR_EMAIL ?? "founder@selaren.local").toLowerCase();
  const password = env.SELAREN_OPERATOR_PASSWORD;
  if (!password) {
    throw new Error("SELAREN_OPERATOR_PASSWORD is required to seed the operator");
  }
  if (env.NODE_ENV === "production" && password === EXAMPLE_OPERATOR_PASSWORD) {
    throw new Error("SELAREN_OPERATOR_PASSWORD must not be the example password in production");
  }
  const reset =
    env.SELAREN_OPERATOR_RESET_PASSWORD === "1" || env.SELAREN_OPERATOR_RESET_PASSWORD === "true";
  return { email, password, resetPassword: reset };
}

export async function upsertSelarenOperator(
  db: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ created: boolean; passwordUpdated: boolean; email: string }> {
  const creds = resolveOperatorCredentials(env);
  const existing = await db.user.findUnique({ where: { email: creds.email } });
  if (existing) {
    await db.user.update({
      where: { email: creds.email },
      data: {
        isSelarenOperator: true,
        deactivatedAt: null,
        ...(creds.resetPassword ? { passwordHash: await bcrypt.hash(creds.password, 12) } : {}),
      },
    });
    return { created: false, passwordUpdated: creds.resetPassword, email: creds.email };
  }
  await db.user.create({
    data: {
      email: creds.email,
      name: "Selaren",
      passwordHash: await bcrypt.hash(creds.password, 12),
      isSelarenOperator: true,
      mustChangePassword: false,
    },
  });
  return { created: true, passwordUpdated: true, email: creds.email };
}
