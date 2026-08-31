"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MembershipRole, TreatmentCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, configLockedForClinicUsers, requireAppContext, requireClinic } from "@/lib/tenancy";
import {
  activateClinic,
  createClinic,
  createClinicUser,
  deactivateMembership,
  saveWhatsAppConnection,
  setClinicStatus,
  deleteContactData,
} from "@/lib/services/onboarding";
import { audit } from "@/lib/audit";
import { casablancaDateTime } from "@/lib/time";
import { hashPassword } from "@/lib/auth";

export async function createClinicAction(formData: FormData) {
  const ctx = await requireAppContext();
  if (!can(ctx, "create_clinic")) return;
  const clinic = await createClinic({
    operatorUserId: ctx.userId,
    name: String(formData.get("name") ?? ""),
    city: String(formData.get("city")) as "casablanca" | "marrakech",
    defaultSlotMinutes: Number(formData.get("defaultSlotMinutes") ?? 30),
    defaultConsultationValueMad: Number(formData.get("defaultConsultationValueMad") || 0) || undefined,
    depositTypicallyRequired: formData.get("depositTypicallyRequired") === "on",
  });
  redirect(`/clinics/${clinic.id}/setup`);
}

export async function inviteUserAction(formData: FormData) {
  const ctx = await requireClinic("invite_staff");
  if (configLockedForClinicUsers(ctx)) return;
  const role = String(formData.get("role")) as MembershipRole;
  if (role === "owner" && !can(ctx, "invite_owner")) return;
  try {
    await createClinicUser({
      clinicId: ctx.clinicId,
      actorUserId: ctx.userId,
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
      role,
    });
  } catch {
    return;
  }
  revalidatePath("/settings");
}

export async function deactivateMemberAction(formData: FormData) {
  const ctx = await requireClinic("invite_staff");
  try {
    await deactivateMembership({
      clinicId: ctx.clinicId,
      actorUserId: ctx.userId,
      membershipId: String(formData.get("membershipId") ?? ""),
    });
  } catch (e) {
    return;
  }
  revalidatePath("/settings");
}

export async function saveKnowledgeAction(formData: FormData) {
  const ctx = await requireClinic("edit_config");
  if (configLockedForClinicUsers(ctx)) return;
  await prisma.clinicKnowledge.upsert({
    where: { clinicId: ctx.clinicId },
    create: {
      clinicId: ctx.clinicId,
      aboutText: String(formData.get("aboutText") ?? ""),
      tone: String(formData.get("tone") ?? ""),
      pricingNotes: String(formData.get("pricingNotes") ?? ""),
      faqs: String(formData.get("faqs") ?? ""),
      policies: String(formData.get("policies") ?? ""),
      bookingRules: String(formData.get("bookingRules") ?? ""),
      doNotSay: String(formData.get("doNotSay") ?? ""),
      followUpText: String(formData.get("followUpText") ?? "") || null,
      missedCallText: String(formData.get("missedCallText") ?? "") || null,
      updatedByUserId: ctx.userId,
    },
    update: {
      aboutText: String(formData.get("aboutText") ?? ""),
      tone: String(formData.get("tone") ?? ""),
      pricingNotes: String(formData.get("pricingNotes") ?? ""),
      faqs: String(formData.get("faqs") ?? ""),
      policies: String(formData.get("policies") ?? ""),
      bookingRules: String(formData.get("bookingRules") ?? ""),
      doNotSay: String(formData.get("doNotSay") ?? ""),
      followUpText: String(formData.get("followUpText") ?? "") || null,
      missedCallText: String(formData.get("missedCallText") ?? "") || null,
      updatedByUserId: ctx.userId,
    },
  });
  await audit({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    action: "knowledge_edit",
    entityType: "clinic_knowledge",
    entityId: ctx.clinicId,
  });
  revalidatePath("/settings");
}

export async function saveClinicBasicsAction(formData: FormData) {
  const ctx = await requireClinic("edit_config");
  if (configLockedForClinicUsers(ctx)) return;
  await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: {
      name: String(formData.get("name") ?? ""),
      defaultSlotMinutes: Number(formData.get("defaultSlotMinutes") ?? 30),
      defaultConsultationValueMad: Number(formData.get("defaultConsultationValueMad") ?? 0),
      depositTypicallyRequired: formData.get("depositTypicallyRequired") === "on",
    },
  });
  await audit({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    action: "clinic_edit",
    entityType: "clinic",
    entityId: ctx.clinicId,
  });
  revalidatePath("/settings");
}

export async function addTreatmentAction(formData: FormData) {
  const ctx = await requireClinic("edit_config");
  if (configLockedForClinicUsers(ctx)) return;
  await prisma.treatment.create({
    data: {
      clinicId: ctx.clinicId,
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category")) as TreatmentCategory,
      offered: true,
      estimatedValueMad: Number(formData.get("estimatedValueMad") || 0) || null,
      notes: String(formData.get("notes") ?? ""),
    },
  });
  revalidatePath("/settings");
}

export async function saveHoursAction(formData: FormData) {
  const ctx = await requireClinic("edit_config");
  if (configLockedForClinicUsers(ctx)) return;
  for (let d = 0; d < 7; d++) {
    await prisma.workingHours.update({
      where: { clinicId_weekday: { clinicId: ctx.clinicId, weekday: d } },
      data: {
        enabled: formData.get(`enabled_${d}`) === "on",
        startTime: new Date(`1970-01-01T${String(formData.get(`start_${d}`) ?? "09:00")}:00Z`),
        endTime: new Date(`1970-01-01T${String(formData.get(`end_${d}`) ?? "18:00")}:00Z`),
      },
    });
  }
  await audit({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    action: "hours_edit",
    entityType: "working_hours",
    entityId: ctx.clinicId,
  });
  revalidatePath("/settings");
}

export async function addExceptionAction(formData: FormData) {
  const ctx = await requireClinic("edit_config");
  const startRaw = String(formData.get("startAt") ?? "");
  const endRaw = String(formData.get("endAt") ?? "");
  const startAt = parseCasablancaDateTimeLocal(startRaw);
  const endAt = parseCasablancaDateTimeLocal(endRaw);
  if (!startAt || !endAt) return;
  await prisma.availabilityException.create({
    data: {
      clinicId: ctx.clinicId,
      startAt,
      endAt,
      kind: "blocked",
      reason: String(formData.get("reason") ?? ""),
    },
  });
  revalidatePath("/settings");
}

function parseCasablancaDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value.replace("T", " ") : value;
  const [date, time] = normalized.split(" ");
  if (!date || !time) return null;
  const hms = time.length === 5 ? `${time}:00` : time;
  return casablancaDateTime(date, hms);
}

export async function saveWhatsAppAction(formData: FormData) {
  const ctx = await requireClinic("whatsapp_connect");
  if (configLockedForClinicUsers(ctx)) return;
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: ctx.clinicId } });
  await saveWhatsAppConnection({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    wabaId: String(formData.get("wabaId") ?? ""),
    phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
    displayPhoneE164: String(formData.get("displayPhoneE164") ?? ""),
    accessToken: String(formData.get("accessToken") ?? ""),
    templatesAcknowledged: formData.get("templatesAcknowledged") === "on",
    sessionOnlyPilot: ctx.isOperator ? formData.get("sessionOnlyPilot") === "on" : clinic.sessionOnlyPilot,
  });
  revalidatePath("/settings");
}

export async function activateClinicAction() {
  const ctx = await requireAppContext();
  if (!ctx.isOperator || !ctx.clinicId) return;
  try {
    await activateClinic({ clinicId: ctx.clinicId, operatorUserId: ctx.userId });
  } catch {
    redirect("/settings?activation=blocked");
  }
  redirect("/settings?activation=ok");
}

export async function pauseClinicAction() {
  const ctx = await requireAppContext();
  if (!ctx.isOperator || !ctx.clinicId) return;
  await setClinicStatus({ clinicId: ctx.clinicId, operatorUserId: ctx.userId, status: "paused" });
  revalidatePath("/settings");
}

export async function resetMemberPasswordAction(formData: FormData) {
  const ctx = await requireClinic("invite_staff");
  if (configLockedForClinicUsers(ctx)) return;
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return;
  const membership = await prisma.clinicMembership.findFirst({
    where: { clinicId: ctx.clinicId, userId, deactivatedAt: null },
  });
  if (!membership) return;
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await audit({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    action: "password_reset",
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/settings");
}

export async function deleteContactAction(formData: FormData) {
  const ctx = await requireClinic("delete_contact_execute");
  if (!ctx.isOperator) return;
  await deleteContactData({
    clinicId: ctx.clinicId,
    contactId: String(formData.get("contactId") ?? ""),
    operatorUserId: ctx.userId,
  });
  redirect("/inbox");
}
