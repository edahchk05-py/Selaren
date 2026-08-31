import { createHmac, timingSafeEqual } from "crypto";

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type InboundExtract = {
  phoneNumberId: string;
  from: string;
  waMessageId: string;
  text: string;
  mediaId?: string;
  mediaType?: "image" | "audio" | "document" | "other";
  timestamp?: number;
};

export type StatusExtract = {
  waMessageId: string;
  status: string;
  phoneNumberId: string;
  errors?: string;
};

export type OptOutExtract = {
  phoneE164: string;
  phoneNumberId: string;
};

export function extractWebhook(payload: unknown): {
  inbounds: InboundExtract[];
  statuses: StatusExtract[];
  optOuts: OptOutExtract[];
} {
  const inbounds: InboundExtract[] = [];
  const statuses: StatusExtract[] = [];
  const optOuts: OptOutExtract[] = [];
  const root = payload as {
    entry?: {
      changes?: {
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Record<string, unknown>[];
          statuses?: Record<string, unknown>[];
        };
      }[];
    }[];
  };

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id ?? "";
      for (const msg of value?.messages ?? []) {
        const from = String(msg.from ?? "");
        const id = String(msg.id ?? "");
        if (!from || !id) continue;
        const type = String(msg.type ?? "text");
        let text = "";
        let mediaId: string | undefined;
        let mediaType: InboundExtract["mediaType"];

        if (type === "text") {
          text = String((msg.text as { body?: string } | undefined)?.body ?? "");
        } else if (type === "button") {
          text = String((msg.button as { text?: string } | undefined)?.text ?? "");
        } else if (type === "interactive") {
          const interactive = msg.interactive as {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
          text =
            interactive?.button_reply?.title ??
            interactive?.list_reply?.title ??
            "";
        } else if (type === "image") {
          mediaId = String((msg.image as { id?: string } | undefined)?.id ?? "");
          mediaType = "image";
          text = String((msg.image as { caption?: string } | undefined)?.caption ?? "");
        } else if (type === "audio") {
          mediaId = String((msg.audio as { id?: string } | undefined)?.id ?? "");
          mediaType = "audio";
        } else if (type === "document") {
          mediaId = String((msg.document as { id?: string } | undefined)?.id ?? "");
          mediaType = "document";
          text = String((msg.document as { caption?: string } | undefined)?.caption ?? "");
        } else {
          mediaType = "other";
        }

        if (/^(stop|arrêt|arret|unsubscribe)$/i.test(text.trim())) {
          optOuts.push({ phoneE164: toE164Guess(from), phoneNumberId });
        }

        inbounds.push({
          phoneNumberId,
          from,
          waMessageId: id,
          text,
          mediaId,
          mediaType,
          timestamp: Number(msg.timestamp ?? 0) || undefined,
        });
      }
      for (const st of value?.statuses ?? []) {
        const waMessageId = String(st.id ?? "");
        const status = String(st.status ?? "");
        const errors = JSON.stringify(st.errors ?? null);
        if (String(errors).includes("131047") || String(errors).includes("user")) {
          const recipient = String(st.recipient_id ?? "");
          if (recipient) optOuts.push({ phoneE164: toE164Guess(recipient), phoneNumberId });
        }
        if (waMessageId) {
          statuses.push({ waMessageId, status, phoneNumberId, errors });
        }
      }
    }
  }
  return { inbounds, statuses, optOuts };
}

function toE164Guess(from: string): string {
  if (from.startsWith("+")) return from;
  return `+${from}`;
}
