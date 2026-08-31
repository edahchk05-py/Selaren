import { after, NextRequest, NextResponse } from "next/server";
import { verifyMetaSignature, extractWebhook } from "@/lib/whatsapp/webhook";
import { ingestInbound, ingestStatus, applyOptOut } from "@/lib/services/inbound";
import { processAiConversation } from "@/lib/services/ai";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const secret = process.env.META_APP_SECRET ?? "";
  if (!verifyMetaSignature(raw, sig, secret)) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  after(async () => {
    const { inbounds, statuses, optOuts } = extractWebhook(payload);
    for (const o of optOuts) {
      await applyOptOut(o.phoneNumberId, o.phoneE164);
    }
    for (const s of statuses) {
      await ingestStatus(s.waMessageId, s.status);
    }
    const aiConversationIds: string[] = [];
    for (const i of inbounds) {
      const result = await ingestInbound(i);
      if ("queuedAi" in result && result.queuedAi && result.conversationId) {
        aiConversationIds.push(result.conversationId);
      }
    }
    for (const conversationId of aiConversationIds) {
      await processAiConversation(conversationId);
    }
  });

  return NextResponse.json({ ok: true });
}
