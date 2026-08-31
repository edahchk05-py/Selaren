import { prisma } from "./db";

export type HealthPayload = { ok: boolean; service: "selaren" };

export async function getHealth(): Promise<HealthPayload> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: "selaren" };
  } catch {
    return { ok: false, service: "selaren" };
  }
}
