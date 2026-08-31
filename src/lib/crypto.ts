import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function keyBytes(): Buffer {
  const hex = process.env.SELAREN_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("SELAREN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [ivH, tagH, dataH] = payload.split(":");
  if (!ivH || !tagH || !dataH) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv(ALGO, keyBytes(), Buffer.from(ivH, "hex"));
  decipher.setAuthTag(Buffer.from(tagH, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataH, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
