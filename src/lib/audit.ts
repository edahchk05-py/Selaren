import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function audit(args: {
  clinicId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditEvent.create({
    data: {
      clinicId: args.clinicId ?? null,
      userId: args.userId ?? null,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId ?? null,
      metadata: args.metadata ?? {},
    },
  });
}
