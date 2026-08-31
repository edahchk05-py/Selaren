import { ClinicStatus, MembershipRole } from "@prisma/client";
import { prisma } from "./db";
import { loadUser, readSession } from "./auth";

export type AuthzAction =
  | "view"
  | "send"
  | "takeover"
  | "qualify"
  | "book"
  | "deposit"
  | "attendance"
  | "missed_call"
  | "follow_up"
  | "dashboard"
  | "edit_config"
  | "whatsapp_connect"
  | "invite_staff"
  | "invite_owner"
  | "create_clinic"
  | "pause_clinic"
  | "list_clinics"
  | "operator_flag"
  | "delete_contact_execute"
  | "delete_contact_request";

export type AppContext = {
  userId: string;
  email: string;
  name: string;
  isOperator: boolean;
  mustChangePassword: boolean;
  clinicId: string | null;
  clinicStatus: ClinicStatus | null;
  clinicName: string | null;
  membershipRole: MembershipRole | null;
  memberships: { clinicId: string; clinicName: string; role: MembershipRole; status: ClinicStatus }[];
};

export function can(ctx: AppContext, action: AuthzAction): boolean {
  if (ctx.isOperator) return true;
  const role = ctx.membershipRole;
  if (!role || !ctx.clinicId) return false;

  const staffOps: AuthzAction[] = [
    "view",
    "send",
    "takeover",
    "qualify",
    "book",
    "deposit",
    "attendance",
    "missed_call",
    "follow_up",
    "dashboard",
    "delete_contact_request",
  ];
  if (staffOps.includes(action)) return true;

  const ownerOnly: AuthzAction[] = [
    "edit_config",
    "whatsapp_connect",
    "invite_staff",
    "invite_owner",
  ];
  if (ownerOnly.includes(action)) return role === "owner";
  return false;
}

export function configLockedForClinicUsers(ctx: AppContext): boolean {
  if (ctx.isOperator) return false;
  return ctx.clinicStatus === "paused";
}

export async function getAppContext(): Promise<AppContext | null> {
  const session = await readSession();
  if (!session) return null;
  const user = await loadUser(session.userId);
  if (!user || user.deactivatedAt) return null;

  const memberships = user.memberships.map((m) => ({
    clinicId: m.clinicId,
    clinicName: m.clinic.name,
    role: m.role,
    status: m.clinic.status,
  }));

  let clinicId = session.clinicId;
  if (clinicId) {
    const allowed =
      user.isSelarenOperator || memberships.some((m) => m.clinicId === clinicId);
    if (!allowed) clinicId = null;
  }
  if (!clinicId && !user.isSelarenOperator && memberships.length === 1) {
    clinicId = memberships[0]!.clinicId;
  }

  let clinicStatus: ClinicStatus | null = null;
  let clinicName: string | null = null;
  let membershipRole: MembershipRole | null = null;
  if (clinicId) {
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    clinicStatus = clinic?.status ?? null;
    clinicName = clinic?.name ?? null;
    membershipRole = memberships.find((m) => m.clinicId === clinicId)?.role ?? null;
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isOperator: user.isSelarenOperator,
    mustChangePassword: user.mustChangePassword,
    clinicId,
    clinicStatus,
    clinicName,
    membershipRole,
    memberships,
  };
}

export async function requireAppContext(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  return ctx;
}

export async function requireClinic(action: AuthzAction = "view"): Promise<AppContext & { clinicId: string }> {
  const ctx = await requireAppContext();
  if (!ctx.clinicId) throw new Error("NO_CLINIC");
  if (!can(ctx, action)) throw new Error("FORBIDDEN");
  return ctx as AppContext & { clinicId: string };
}
