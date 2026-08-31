import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature, extractWebhook } from "../src/lib/whatsapp/webhook";

describe("whatsapp webhook", () => {
  it("rejects bad signatures", () => {
    expect(verifyMetaSignature("{}", "sha256=dead", "secret")).toBe(false);
  });

  it("extracts text inbound and is idempotent-ready via wa id", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PN" },
                messages: [
                  { from: "212612345678", id: "wamid.1", type: "text", text: { body: "Implants vendredi" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const { inbounds } = extractWebhook(payload);
    expect(inbounds[0]?.waMessageId).toBe("wamid.1");
    expect(inbounds[0]?.text).toBe("Implants vendredi");
    expect(inbounds[0]?.phoneNumberId).toBe("PN");
  });

  it("does not run the delayed worker tick from the webhook route", () => {
    const src = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    expect(src).not.toMatch(/runTick/);
    expect(src).toMatch(/processAiConversation/);
  });
});
