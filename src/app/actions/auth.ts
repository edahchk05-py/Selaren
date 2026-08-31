"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  loginAllowed,
  verifyPassword,
} from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getAppContext, requireAppContext } from "@/lib/tenancy";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const key = `login:${email}`;
  if (!loginAllowed(key)) {
    return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  }
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { deactivatedAt: null }, include: { clinic: true } } },
    });
  } catch {
    return {
      error: "Connexion impossible pour le moment. Vérifiez que Selaren est bien démarré, puis réessayez.",
    };
  }
  if (!user || user.deactivatedAt || !(await verifyPassword(password, user.passwordHash))) {
    try {
      await audit({ action: "login_failure", entityType: "user", metadata: { email } });
    } catch {
      /* ignore if db still failing */
    }
    return { error: "Identifiants incorrects." };
  }
  const clinicId =
    user.isSelarenOperator
      ? user.memberships[0]?.clinicId ?? null
      : user.memberships[0]?.clinicId ?? null;
  await createSession({ userId: user.id, clinicId });
  await audit({
    userId: user.id,
    clinicId,
    action: "login_success",
    entityType: "user",
    entityId: user.id,
  });
  if (user.mustChangePassword) redirect("/change-password");
  if (!clinicId && user.isSelarenOperator) redirect("/clinics");
  if (user.memberships.length > 1) redirect("/select-clinic");
  redirect("/inbox");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(formData: FormData) {
  const ctx = await requireAppContext();
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Le mot de passe doit contenir au moins 10 caractères." };
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false },
  });
  redirect("/inbox");
}

export async function switchClinicAction(formData: FormData) {
  const ctx = await requireAppContext();
  const clinicId = String(formData.get("clinicId") ?? "");
  const allowed =
    ctx.isOperator || ctx.memberships.some((m) => m.clinicId === clinicId);
  if (!allowed) return;
  await createSession({ userId: ctx.userId, clinicId });
  if (ctx.isOperator) {
    await audit({
      clinicId,
      userId: ctx.userId,
      action: "operator_access",
      entityType: "clinic",
      entityId: clinicId,
    });
  }
  redirect("/inbox");
}

export async function currentContext() {
  return getAppContext();
}
