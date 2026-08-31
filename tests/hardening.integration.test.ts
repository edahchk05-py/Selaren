import { execSync, spawn } from "child_process";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { SEND_OUTCOME_UNKNOWN } from "../src/lib/constants";

const PORT = 55433;
const DATABASE_URL = `postgresql://selaren:selaren@127.0.0.1:${PORT}/selaren?schema=public`;
const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

process.env.DATABASE_URL = DATABASE_URL;
process.env.SELAREN_ENCRYPTION_KEY = ENCRYPTION_KEY;
process.env.SELAREN_SESSION_SECRET = "selaren-test-session-secret-32chars";
process.env.OPENAI_API_KEY = "test-openai-key";

const { openaiCreate } = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: (opts: unknown) => openaiCreate(opts),
      },
    };
  },
}));

let waSeq = 0;
const sendSessionText = vi.fn(async () => ({ messageId: `wamid.out.${++waSeq}` }));
const sendTemplate = vi.fn(async () => ({ messageId: `wamid.tpl.${++waSeq}` }));

vi.mock("../src/lib/whatsapp/client", () => ({
  sendSessionText,
  sendTemplate,
  downloadWhatsAppMedia: vi.fn(),
  WhatsAppSendError: class WhatsAppSendError extends Error {
    constructor(
      message: string,
      readonly statusCode?: number,
    ) {
      super(message);
      this.name = "WhatsAppSendError";
    }
  },
}));

describe("production hardening (postgres)", () => {
  let pg: EmbeddedPostgres;
  let prisma: typeof import("../src/lib/db").prisma;
  let bookAppointment: typeof import("../src/lib/services/appointments").bookAppointment;
  let rescheduleAppointment: typeof import("../src/lib/services/appointments").rescheduleAppointment;
  let cancelAppointment: typeof import("../src/lib/services/appointments").cancelAppointment;
  let ingestInbound: typeof import("../src/lib/services/inbound").ingestInbound;
  let runTick: typeof import("../src/lib/jobs/tick").runTick;
  let encryptSecret: typeof import("../src/lib/crypto").encryptSecret;
  let getHealth: typeof import("../src/lib/health").getHealth;
  let processAiConversation: typeof import("../src/lib/services/ai").processAiConversation;
  let takeover: typeof import("../src/lib/services/conversations").takeover;
  let upsertSelarenOperator: typeof import("../src/lib/seedOperator").upsertSelarenOperator;
  let listFreeSlots: typeof import("../src/lib/services/availability").listFreeSlots;

  let staffUserId: string;

  beforeAll(async () => {
    const dir = join(process.cwd(), "data", "pg-test");
    mkdirSync(dir, { recursive: true });
    pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: "selaren",
      password: "selaren",
      port: PORT,
      persistent: false,
      onLog: () => undefined,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("selaren");
    execSync("npx prisma migrate deploy", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL },
      stdio: "pipe",
    });
    vi.resetModules();
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.SELAREN_ENCRYPTION_KEY = ENCRYPTION_KEY;
    ({ prisma } = await import("../src/lib/db"));
    ({ bookAppointment, rescheduleAppointment, cancelAppointment } = await import(
      "../src/lib/services/appointments"
    ));
    ({ ingestInbound } = await import("../src/lib/services/inbound"));
    ({ runTick } = await import("../src/lib/jobs/tick"));
    ({ encryptSecret } = await import("../src/lib/crypto"));
    ({ getHealth } = await import("../src/lib/health"));
    ({ processAiConversation } = await import("../src/lib/services/ai"));
    ({ takeover } = await import("../src/lib/services/conversations"));
    ({ upsertSelarenOperator } = await import("../src/lib/seedOperator"));
    ({ listFreeSlots } = await import("../src/lib/services/availability"));
    const staff = await prisma.user.create({
      data: {
        email: `staff-${Date.now()}@selaren.test`,
        passwordHash: "test-hash",
        name: "Staff",
      },
    });
    staffUserId = staff.id;
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pg?.stop().catch(() => undefined);
  }, 30_000);

  async function addInquiry(clinicId: string, phoneSuffix: string) {
    const contact = await prisma.contact.create({
      data: { clinicId, phoneE164: `+2126${phoneSuffix}` },
    });
    const conversation = await prisma.conversation.create({
      data: {
        clinicId,
        contactId: contact.id,
        lastPatientMessageAt: new Date(),
      },
    });
    const inquiry = await prisma.inquiry.create({
      data: {
        clinicId,
        contactId: contact.id,
        conversationId: conversation.id,
        source: "whatsapp",
        status: "open",
        qualification: { create: { clinicId, status: "qualified" } },
      },
    });
    return { contact, conversation, inquiry };
  }

  async function seedClinic(phoneSuffix: string) {
    const clinic = await prisma.clinic.create({
      data: {
        name: "Clinique Test",
        city: "casablanca",
        status: "active",
        defaultConsultationValueMad: 800,
      },
    });
    const patient = await addInquiry(clinic.id, phoneSuffix);
    await prisma.whatsAppConnection.create({
      data: {
        clinicId: clinic.id,
        wabaId: "waba",
        phoneNumberId: `pn_${phoneSuffix}`,
        displayPhoneE164: `+2126${phoneSuffix}`,
        accessTokenEncrypted: encryptSecret("test-token"),
        status: "active",
        templatesAcknowledged: true,
      },
    });
    return { clinic, ...patient };
  }

  async function enableClinicHours(clinicId: string) {
    for (let weekday = 0; weekday < 7; weekday++) {
      await prisma.workingHours.upsert({
        where: { clinicId_weekday: { clinicId, weekday } },
        create: {
          clinicId,
          weekday,
          enabled: true,
          startTime: new Date("1970-01-01T09:00:00.000Z"),
          endTime: new Date("1970-01-01T18:00:00.000Z"),
        },
        update: {
          enabled: true,
          startTime: new Date("1970-01-01T09:00:00.000Z"),
          endTime: new Date("1970-01-01T18:00:00.000Z"),
        },
      });
    }
  }

  function aiJson(overrides: Record<string, unknown>) {
    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              language: "fr",
              classification: "booking",
              halt_reason: null,
              reply: "Réponse IA",
              book_slot_start_iso: null,
              ...overrides,
            }),
          },
        },
      ],
    };
  }

  beforeEach(() => {
    openaiCreate.mockReset();
    openaiCreate.mockResolvedValue(aiJson({ reply: "" }));
  });

  it("applies a fresh migrate deploy including uniqueness indexes", async () => {
    const rows = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT relname FROM pg_class
      WHERE relname IN ('appointments_one_scheduled_per_contact', 'inquiries_one_open_or_booked_per_contact')
    `;
    expect(rows.map((r) => r.relname).sort()).toEqual([
      "appointments_one_scheduled_per_contact",
      "inquiries_one_open_or_booked_per_contact",
    ]);
    const health = await getHealth();
    expect(health).toEqual({ ok: true, service: "selaren" });
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'send_started_at'
    `;
    expect(cols).toHaveLength(1);
  });

  it("reschedules without violating one-scheduled-per-contact", async () => {
    sendSessionText.mockResolvedValue({ messageId: "wamid.book" });
    const ctx = await seedClinic("111001");
    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const first = await bookAppointment({
      clinicId: ctx.clinic.id,
      inquiryId: ctx.inquiry.id,
      startAt: start,
      endAt: end,
      userId: staffUserId,
    });
    const nextStart = new Date(start.getTime() + 60 * 60 * 1000);
    const nextEnd = new Date(nextStart.getTime() + 30 * 60 * 1000);
    const second = await rescheduleAppointment({
      clinicId: ctx.clinic.id,
      appointmentId: first.id,
      startAt: nextStart,
      endAt: nextEnd,
      userId: staffUserId,
    });
    const scheduled = await prisma.appointment.findMany({
      where: { contactId: ctx.contact.id, status: "scheduled" },
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.id).toBe(second.id);
    const old = await prisma.appointment.findUniqueOrThrow({ where: { id: first.id } });
    expect(old.status).toBe("rescheduled");
    expect(old.supersededByAppointmentId).toBe(second.id);
    const oldReminders = await prisma.reminder.findMany({ where: { appointmentId: first.id } });
    expect(oldReminders.every((r) => r.canceledAt || r.skipReason === "past")).toBe(true);
    const newReminders = await prisma.reminder.findMany({ where: { appointmentId: second.id } });
    expect(newReminders.length).toBe(2);
  });

  it("rejects a second booking of the same slot", async () => {
    sendSessionText.mockResolvedValue({ messageId: "wamid.slot" });
    const a = await seedClinic("222001");
    const b = await addInquiry(a.clinic.id, "222002");
    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await bookAppointment({
      clinicId: a.clinic.id,
      inquiryId: a.inquiry.id,
      startAt: start,
      endAt: end,
      userId: staffUserId,
    });
    await expect(
      bookAppointment({
        clinicId: a.clinic.id,
        inquiryId: b.inquiry.id,
        startAt: start,
        endAt: end,
        userId: staffUserId,
      }),
    ).rejects.toThrow("SLOT_TAKEN");
  });

  it("does not keep two scheduled rows when concurrent bookings race the same slot", async () => {
    sendSessionText.mockResolvedValue({ messageId: "wamid.race" });
    const a = await seedClinic("333001");
    const b = await addInquiry(a.clinic.id, "333002");
    const start = new Date(Date.now() + 96 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const results = await Promise.allSettled([
      bookAppointment({
        clinicId: a.clinic.id,
        inquiryId: a.inquiry.id,
        startAt: start,
        endAt: end,
        userId: staffUserId,
      }),
      bookAppointment({
        clinicId: a.clinic.id,
        inquiryId: b.inquiry.id,
        startAt: start,
        endAt: end,
        userId: staffUserId,
      }),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    if (lost[0]?.status === "rejected") {
      expect((lost[0].reason as Error).message).toBe("SLOT_TAKEN");
    }
    const scheduled = await prisma.appointment.findMany({
      where: { clinicId: a.clinic.id, status: "scheduled", startAt: start },
    });
    expect(scheduled).toHaveLength(1);
  });

  it("treats a duplicate inbound wa_message_id as idempotent", async () => {
    const ctx = await seedClinic("444001");
    const item = {
      phoneNumberId: `pn_444001`,
      from: "2126444001",
      waMessageId: "wamid.dup.1",
      text: "Bonjour",
    };
    const first = await ingestInbound(item);
    const second = await ingestInbound(item);
    expect("duplicate" in second && second.duplicate).toBe(true);
    expect("inquiryId" in first && first.inquiryId).toBeTruthy();
    const messages = await prisma.message.findMany({
      where: { clinicId: ctx.clinic.id, waMessageId: "wamid.dup.1" },
    });
    expect(messages).toHaveLength(1);
  });

  it("sends a queued outbound only once under concurrent ticks", async () => {
    sendSessionText.mockClear();
    sendSessionText.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ messageId: "wamid.once" }), 80);
        }),
    );
    const ctx = await seedClinic("555001");
    const msg = await prisma.message.create({
      data: {
        clinicId: ctx.clinic.id,
        conversationId: ctx.conversation.id,
        direction: "outbound",
        senderType: "system",
        body: "hello",
        status: "queued",
      },
    });
    await Promise.all([runTick(), runTick()]);
    expect(sendSessionText).toHaveBeenCalledTimes(1);
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(stored.status).toBe("sent");
  });

  it("does not mark a follow-up sent when WhatsApp send fails", async () => {
    sendSessionText.mockReset();
    sendSessionText.mockRejectedValue(new Error("400 template name does not exist"));
    const ctx = await seedClinic("666001");
    const fu = await prisma.followUp.create({
      data: {
        clinicId: ctx.clinic.id,
        inquiryId: ctx.inquiry.id,
        step: 1,
        kind: "stall",
        scheduledAt: new Date(Date.now() - 1000),
      },
    });
    await runTick();
    const after = await prisma.followUp.findUniqueOrThrow({ where: { id: fu.id } });
    expect(after.sentAt).toBeNull();
    expect(after.skipReason).toBeTruthy();
    const outbound = await prisma.message.findFirst({
      where: { conversationId: ctx.conversation.id, direction: "outbound" },
      orderBy: { createdAt: "desc" },
    });
    expect(outbound?.status).toBe("failed");
  });

  it("does not send appointment reminders while the clinic is paused", async () => {
    sendSessionText.mockReset();
    sendSessionText.mockResolvedValue({ messageId: "wamid.rem" });
    const ctx = await seedClinic("777001");
    const start = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const appt = await bookAppointment({
      clinicId: ctx.clinic.id,
      inquiryId: ctx.inquiry.id,
      startAt: start,
      endAt: end,
      userId: staffUserId,
    });
    await prisma.clinic.update({ where: { id: ctx.clinic.id }, data: { status: "paused" } });
    await prisma.reminder.updateMany({
      where: { appointmentId: appt.id },
      data: { scheduledAt: new Date(Date.now() - 1000), canceledAt: null, skipReason: null, sentAt: null },
    });
    sendSessionText.mockClear();
    await runTick();
    const reminders = await prisma.reminder.findMany({ where: { appointmentId: appt.id } });
    expect(reminders.every((r) => r.sentAt === null)).toBe(true);
    expect(sendSessionText).not.toHaveBeenCalled();
  });

  it("sets confirmationSentAt only after a successful send", async () => {
    sendSessionText.mockReset();
    sendSessionText.mockRejectedValue(new Error("500 upstream"));
    const ctx = await seedClinic("888001");
    const start = new Date(Date.now() + 120 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const appt = await bookAppointment({
      clinicId: ctx.clinic.id,
      inquiryId: ctx.inquiry.id,
      startAt: start,
      endAt: end,
      userId: staffUserId,
    });
    const failed = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(failed.confirmationSentAt).toBeNull();
    sendSessionText.mockReset();
    sendSessionText.mockResolvedValue({ messageId: "wamid.ok" });
    await prisma.message.updateMany({
      where: { conversationId: ctx.conversation.id, direction: "outbound" },
      data: { status: "queued", claimedAt: null, sendAttempts: 0, sendStartedAt: null, errorDetail: null },
    });
    await runTick();
    const sent = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(sent.confirmationSentAt).not.toBeNull();
  });

  it("still allows cancel after a successful book", async () => {
    sendSessionText.mockResolvedValue({ messageId: "wamid.cancel" });
    const ctx = await seedClinic("999001");
    const start = new Date(Date.now() + 150 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const appt = await bookAppointment({
      clinicId: ctx.clinic.id,
      inquiryId: ctx.inquiry.id,
      startAt: start,
      endAt: end,
      userId: staffUserId,
    });
    await cancelAppointment({
      clinicId: ctx.clinic.id,
      appointmentId: appt.id,
      userId: staffUserId,
    });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(row.status).toBe("cancelled");
  });

  it("halts the entire AI turn when halt_reason is set with book_slot_start_iso", async () => {
    sendSessionText.mockClear();
    const ctx = await seedClinic("101001");
    await enableClinicHours(ctx.clinic.id);
    await prisma.conversation.update({
      where: { id: ctx.conversation.id },
      data: { needsAiReply: true, mode: "ai", lastPatientMessageAt: new Date() },
    });
    openaiCreate.mockResolvedValue(
      aiJson({
        halt_reason: "medical",
        reply: "Appelez la clinique, je réserve aussi.",
        book_slot_start_iso: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }),
    );
    await processAiConversation(ctx.conversation.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversation.id } });
    expect(conv.aiHaltReason).toBe("medical");
    expect(conv.mode).toBe("ai");
    const appts = await prisma.appointment.findMany({ where: { clinicId: ctx.clinic.id } });
    expect(appts).toHaveLength(0);
    const outbound = await prisma.message.findMany({
      where: { conversationId: ctx.conversation.id, direction: "outbound" },
    });
    expect(outbound).toHaveLength(0);
    expect(sendSessionText).not.toHaveBeenCalled();
  });

  it("does not send or book after staff takeover during an in-flight AI turn", async () => {
    sendSessionText.mockClear();
    const ctx = await seedClinic("101002");
    await enableClinicHours(ctx.clinic.id);
    await prisma.conversation.update({
      where: { id: ctx.conversation.id },
      data: { needsAiReply: true, mode: "ai", lastPatientMessageAt: new Date() },
    });

    let release!: (value: unknown) => void;
    openaiCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const running = processAiConversation(ctx.conversation.id);
    const claimed = await vi.waitFor(async () => {
      const row = await prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversation.id } });
      expect(row.needsAiReply).toBe(false);
      return row;
    });
    expect(claimed.mode).toBe("ai");

    await takeover({
      clinicId: ctx.clinic.id,
      conversationId: ctx.conversation.id,
      userId: staffUserId,
    });

    const slots = await listFreeSlots(ctx.clinic.id);
    const iso = slots[0]?.startAt.toISOString() ?? null;
    release(
      aiJson({
        halt_reason: null,
        reply: "Votre consultation est confirmée.",
        book_slot_start_iso: iso,
      }),
    );
    await running;

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversation.id } });
    expect(conv.mode).toBe("human");
    const appts = await prisma.appointment.findMany({ where: { clinicId: ctx.clinic.id } });
    expect(appts).toHaveLength(0);
    const outbound = await prisma.message.findMany({
      where: { conversationId: ctx.conversation.id, direction: "outbound", senderType: "ai" },
    });
    expect(outbound).toHaveLength(0);
    expect(sendSessionText).not.toHaveBeenCalled();
  });

  it("does not resend a message after Graph was invoked (crash-after-send)", async () => {
    sendSessionText.mockClear();
    const ctx = await seedClinic("101003");
    const stale = new Date(Date.now() - 3 * 60 * 1000);
    const msg = await prisma.message.create({
      data: {
        clinicId: ctx.clinic.id,
        conversationId: ctx.conversation.id,
        direction: "outbound",
        senderType: "system",
        body: "hello",
        status: "queued",
        claimedAt: stale,
        sendStartedAt: stale,
      },
    });
    await runTick();
    expect(sendSessionText).not.toHaveBeenCalled();
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(stored.status).toBe("failed");
    expect(stored.errorDetail).toBe(SEND_OUTCOME_UNKNOWN);
  });

  it("does not create a second follow-up message when the first send is unknown", async () => {
    sendSessionText.mockClear();
    const ctx = await seedClinic("101004");
    const stale = new Date(Date.now() - 3 * 60 * 1000);
    const msg = await prisma.message.create({
      data: {
        clinicId: ctx.clinic.id,
        conversationId: ctx.conversation.id,
        direction: "outbound",
        senderType: "system",
        body: "relance",
        templateName: "follow_up_nudge",
        status: "queued",
        claimedAt: stale,
        sendStartedAt: stale,
      },
    });
    const fu = await prisma.followUp.create({
      data: {
        clinicId: ctx.clinic.id,
        inquiryId: ctx.inquiry.id,
        step: 1,
        kind: "stall",
        scheduledAt: new Date(Date.now() - 1000),
        messageId: msg.id,
        claimedAt: stale,
      },
    });
    await runTick();
    expect(sendSessionText).not.toHaveBeenCalled();
    const messages = await prisma.message.findMany({
      where: { conversationId: ctx.conversation.id, direction: "outbound" },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.errorDetail).toBe(SEND_OUTCOME_UNKNOWN);
    const after = await prisma.followUp.findUniqueOrThrow({ where: { id: fu.id } });
    expect(after.sentAt).toBeNull();
    expect(after.skipReason).toBe(SEND_OUTCOME_UNKNOWN);
    expect(after.messageId).toBe(msg.id);
  });

  it("retries the same queued row when Graph was never started", async () => {
    sendSessionText.mockClear();
    sendSessionText.mockResolvedValue({ messageId: "wamid.retry-ok" });
    const ctx = await seedClinic("101005");
    const stale = new Date(Date.now() - 3 * 60 * 1000);
    const msg = await prisma.message.create({
      data: {
        clinicId: ctx.clinic.id,
        conversationId: ctx.conversation.id,
        direction: "outbound",
        senderType: "system",
        body: "hello",
        status: "queued",
        claimedAt: stale,
        sendStartedAt: null,
      },
    });
    await runTick();
    expect(sendSessionText).toHaveBeenCalledTimes(1);
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(stored.status).toBe("sent");
  });

  it("does not overwrite an existing operator password on seed unless reset is requested", async () => {
    const email = `op-${Date.now()}@selaren.test`;
    const first = await upsertSelarenOperator(prisma, {
      NODE_ENV: "test",
      SELAREN_OPERATOR_EMAIL: email,
      SELAREN_OPERATOR_PASSWORD: "first-operator-password",
    });
    expect(first.created).toBe(true);
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    const second = await upsertSelarenOperator(prisma, {
      NODE_ENV: "test",
      SELAREN_OPERATOR_EMAIL: email,
      SELAREN_OPERATOR_PASSWORD: "second-operator-password",
    });
    expect(second.passwordUpdated).toBe(false);
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(unchanged.passwordHash).toBe(created.passwordHash);
    const reset = await upsertSelarenOperator(prisma, {
      NODE_ENV: "test",
      SELAREN_OPERATOR_EMAIL: email,
      SELAREN_OPERATOR_PASSWORD: "second-operator-password",
      SELAREN_OPERATOR_RESET_PASSWORD: "true",
    });
    expect(reset.passwordUpdated).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(updated.passwordHash).not.toBe(created.passwordHash);
  });
});

describe("worker process", () => {
  it("starts from compiled JS with process.env and no .env file", async () => {
    execSync("node scripts/build-worker.mjs", { cwd: process.cwd(), stdio: "pipe" });
    const child = spawn("node", ["dist/worker.js"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        DATABASE_URL,
        SELAREN_ENCRYPTION_KEY: ENCRYPTION_KEY,
        NODE_ENV: "production",
        WORKER_INTERVAL_MS: "60000",
      },
    });
    const line = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("worker did not start")), 8000);
      child.stdout?.on("data", (buf: Buffer) => {
        const s = buf.toString();
        if (s.includes("Selaren worker started")) {
          clearTimeout(t);
          resolve(s);
        }
      });
      child.stderr?.on("data", (buf: Buffer) => {
        const s = buf.toString();
        if (/error/i.test(s) && !s.includes("tick_failed")) {
          /* still wait for started */
        }
      });
    });
    expect(line).toMatch(/Selaren worker started/);
    child.kill("SIGTERM");
    await new Promise((r) => child.once("exit", r));
  }, 20_000);
});
