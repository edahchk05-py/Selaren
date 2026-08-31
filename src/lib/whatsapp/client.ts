const GRAPH = () =>
  `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

async function graphPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${GRAPH()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    messages?: { id: string }[];
    error?: { message: string; code?: number };
  };
  if (!res.ok) {
    throw new WhatsAppSendError(
      `${res.status} ${json.error?.message ?? "WhatsApp error"}`,
      res.status,
    );
  }
  return json;
}

export async function sendSessionText(args: {
  phoneNumberId: string;
  token: string;
  to: string;
  body: string;
}) {
  const json = await graphPost(`/${args.phoneNumberId}/messages`, args.token, {
    messaging_product: "whatsapp",
    to: args.to,
    type: "text",
    text: { preview_url: false, body: args.body },
  });
  return { messageId: json.messages?.[0]?.id };
}

export async function sendTemplate(args: {
  phoneNumberId: string;
  token: string;
  to: string;
  template: string;
  language: string;
  bodyParams: string[];
}) {
  const json = await graphPost(`/${args.phoneNumberId}/messages`, args.token, {
    messaging_product: "whatsapp",
    to: args.to,
    type: "template",
    template: {
      name: args.template,
      language: { code: args.language },
      components:
        args.bodyParams.length > 0
          ? [
              {
                type: "body",
                parameters: args.bodyParams.map((text) => ({ type: "text", text })),
              },
            ]
          : [],
    },
  });
  return { messageId: json.messages?.[0]?.id };
}

export async function downloadWhatsAppMedia(args: {
  mediaId: string;
  token: string;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`${GRAPH()}/${args.mediaId}`, {
    headers: { Authorization: `Bearer ${args.token}` },
  });
  if (!metaRes.ok) throw new Error("media_meta_failed");
  const meta = (await metaRes.json()) as { url: string; mime_type?: string };
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${args.token}` },
  });
  if (!fileRes.ok) throw new Error("media_download_failed");
  const buf = Buffer.from(await fileRes.arrayBuffer());
  return { buffer: buf, mimeType: meta.mime_type ?? "application/octet-stream" };
}
