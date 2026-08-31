import { ClinicStatus, MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { hashPassword } from "../auth";
import { encryptSecret } from "../crypto";
import { audit } from "../audit";
import { activationGaps, knowledgeComplete, type ActivationState } from "../activation";
import { SLOT_MINUTES_MAX, SLOT_MINUTES_MIN } from "../constants";

const DEFAULT_HOURS: { weekday: number; enabled: boolean; start: string; end: string }[] = [
  { weekday: 0, enabled: true, start: "09:00:00", end: "18:00:00" },
  { weekday: 1, enabled: true, start: "09:00:00", end: "18:00:00" },
  { weekday: 2, enabled: true, start: "09:00:00", end: "18:00:00" },
  { weekday: 3, enabled: true, start: "09:00:00", end: "18:00:00" },
  { weekday: 4, enabled: true, start: "09:00:00", end: "18:00:00" },
  { weekday: 5, enabled: false, start: "09:00:00", end: "13:00:00" },
  { weekday: 6, enabled: false, start: "09:00:00", end: "13:00:00" },
];

function timeValue(hms: string) {
  return new Date(`1970-01-01T${hms}Z`);
}

export async function createClinic(args: {
  operatorUserId: string;
  name: string;
  city: "casablanca" | "marrakech";
  defaultSlotMinutes?: number;
  defaultConsultationValueMad?: number;
  depositTypicallyRequired?: boolean;
}) {
  const slot = args.defaultSlotMinutes ?? 30;
  if (slot < SLOT_MINUTES_MIN || slot > SLOT_MINUTES_MAX) throw new Error("INVALID_SLOT");

  const clinic = await prisma.clinic.create({
    data: {
      name: args.name.trim(),
      city: args.city,
      defaultSlotMinutes: slot,
      defaultConsultationValueMad: args.defaultConsultationValueMad ?? null,
      depositTypicallyRequired: args.depositTypicallyRequired ?? true,
      workingHours: {
        create: DEFAULT_HOURS.map((h) => ({
          weekday: h.weekday,
          enabled: h.enabled,
          startTime: timeValue(h.start),
          endTime: timeValue(h.end),
        })),
      },
    },
  });

  await audit({
    clinicId: clinic.id,
    userId: args.operatorUserId,
    action: "clinic_create",
    entityType: "clinic",
    entityId: clinic.id,
  });
  return clinic;
}

export async function createClinicUser(args: {
  clinicId: string;
  actorUserId: string;
  email: string;
  name: string;
  password: string;
  role: MembershipRole;
}) {
  const email = args.email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: args.name.trim(),
        passwordHash: await hashPassword(args.password),
        mustChangePassword: true,
      },
    });
  }
  await prisma.clinicMembership.create({
    data: {
      clinicId: args.clinicId,
      userId: user.id,
      role: args.role,
    },
  });
  await audit({
    clinicId: args.clinicId,
    userId: args.actorUserId,
    action: "membership_create",
    entityType: "membership",
    entityId: user.id,
    metadata: { role: args.role, email } as Prisma.InputJsonValue,
  });
  return user;
}

export async function deactivateMembership(args: {
  clinicId: string;
  actorUserId: string;
  membershipId: string;
}) {
  const m = await prisma.clinicMembership.findUniqueOrThrow({
    where: { id: args.membershipId },
  });
  if (m.clinicId !== args.clinicId) throw new Error("TENANT");
  if (m.role === "owner") {
    const others = await prisma.clinicMembership.count({
      where: { clinicId: args.clinicId, role: "owner", deactivatedAt: null, id: { not: m.id } },
    });
    if (others < 1) throw new Error("LAST_OWNER");
  }
  await prisma.clinicMembership.update({
    where: { id: m.id },
    data: { deactivatedAt: new Date() },
  });
  await audit({
    clinicId: args.clinicId,
    userId: args.actorUserId,
    action: "membership_deactivate",
    entityType: "membership",
    entityId: m.id,
  });
}

export async function getActivationState(clinicId: string): Promise<ActivationState> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    include: {
      knowledge: true,
      treatments: true,
      workingHours: true,
      whatsappConnection: true,
      memberships: true,
    },
  });
  return {
    name: clinic.name,
    city: clinic.city,
    defaultConsultationValueMad: clinic.defaultConsultationValueMad
      ? Number(clinic.defaultConsultationValueMad)
      : null,
    ownerCount: clinic.memberships.filter((m) => m.role === "owner" && !m.deactivatedAt).length,
    offeredTreatmentCount: clinic.treatments.filter((t) => t.offered).length,
    knowledgeComplete: knowledgeComplete(clinic.knowledge),
    enabledWeekdays: clinic.workingHours.filter((h) => h.enabled).length,
    whatsappActive: clinic.whatsappConnection?.status === "active",
    templatesReady: clinic.whatsappConnection?.templatesAcknowledged ?? false,
    sessionOnlyPilot: clinic.sessionOnlyPilot,
  };
}

export async function activateClinic(args: { clinicId: string; operatorUserId: string }) {
  const state = await getActivationState(args.clinicId);
  const gaps = activationGaps(state);
  if (gaps.length) {
    const err = new Error("ACTIVATION_INCOMPLETE");
    (err as Error & { gaps: string[] }).gaps = gaps;
    throw err;
  }
  await prisma.clinic.update({
    where: { id: args.clinicId },
    data: { status: ClinicStatus.active },
  });
  await audit({
    clinicId: args.clinicId,
    userId: args.operatorUserId,
    action: "clinic_activate",
    entityType: "clinic",
    entityId: args.clinicId,
  });
}

export async function setClinicStatus(args: {
  clinicId: string;
  operatorUserId: string;
  status: ClinicStatus;
}) {
  if (args.status === "active") return activateClinic(args);
  await prisma.clinic.update({
    where: { id: args.clinicId },
    data: { status: args.status },
  });
  await audit({
    clinicId: args.clinicId,
    userId: args.operatorUserId,
    action: "clinic_status",
    entityType: "clinic",
    entityId: args.clinicId,
    metadata: { status: args.status },
  });
}

export async function saveWhatsAppConnection(args: {
  clinicId: string;
  userId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneE164: string;
  accessToken: string;
  templatesAcknowledged: boolean;
  sessionOnlyPilot: boolean;
}) {
  const existing = await prisma.whatsAppConnection.findUnique({ where: { clinicId: args.clinicId } });
  const encrypted = args.accessToken
    ? encryptSecret(args.accessToken)
    : existing?.accessTokenEncrypted;
  if (!encrypted) throw new Error("TOKEN_REQUIRED");
  await prisma.whatsAppConnection.upsert({
    where: { clinicId: args.clinicId },
    create: {
      clinicId: args.clinicId,
      wabaId: args.wabaId.trim(),
      phoneNumberId: args.phoneNumberId.trim(),
      displayPhoneE164: args.displayPhoneE164.trim(),
      accessTokenEncrypted: encrypted,
      status: "active",
      templatesAcknowledged: args.templatesAcknowledged,
    },
    update: {
      wabaId: args.wabaId.trim(),
      phoneNumberId: args.phoneNumberId.trim(),
      displayPhoneE164: args.displayPhoneE164.trim(),
      accessTokenEncrypted: encrypted,
      status: "active",
      lastError: null,
      templatesAcknowledged: args.templatesAcknowledged,
    },
  });
  await prisma.clinic.update({
    where: { id: args.clinicId },
    data: { sessionOnlyPilot: args.sessionOnlyPilot },
  });
  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "whatsapp_connect",
    entityType: "whatsapp_connection",
    entityId: args.clinicId,
  });
}

export async function deleteContactData(args: {
  clinicId: string;
  contactId: string;
  operatorUserId: string;
}) {
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: args.contactId } });
  if (contact.clinicId !== args.clinicId) throw new Error("TENANT");
  await prisma.$transaction([
    prisma.reminder.deleteMany({ where: { appointment: { contactId: contact.id } } }),
    prisma.appointment.deleteMany({ where: { contactId: contact.id } }),
    prisma.followUp.deleteMany({ where: { inquiry: { contactId: contact.id } } }),
    prisma.missedCall.deleteMany({ where: { contactId: contact.id } }),
    prisma.qualification.deleteMany({ where: { inquiry: { contactId: contact.id } } }),
    prisma.inquiry.deleteMany({ where: { contactId: contact.id } }),
    prisma.message.deleteMany({ where: { conversation: { contactId: contact.id } } }),
    prisma.conversation.deleteMany({ where: { contactId: contact.id } }),
    prisma.contact.delete({ where: { id: contact.id } }),
  ]);
  await audit({
    clinicId: args.clinicId,
    userId: args.operatorUserId,
    action: "contact_delete",
    entityType: "contact",
    entityId: args.contactId,
  });
}
