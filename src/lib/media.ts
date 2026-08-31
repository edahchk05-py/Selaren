import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const ROOT = join(process.cwd(), "storage", "media");

export async function saveClinicMedia(clinicId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const ext =
    mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : mimeType.includes("png")
        ? "png"
        : mimeType.includes("ogg") || mimeType.includes("audio")
          ? "ogg"
          : mimeType.includes("pdf")
            ? "pdf"
            : "bin";
  const dir = join(ROOT, clinicId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), buffer);
  return `/api/media/${clinicId}/${name}`;
}

export function mediaDiskPath(clinicId: string, filename: string): string {
  if (filename.includes("..") || filename.includes("/")) throw new Error("INVALID_MEDIA");
  return join(ROOT, clinicId, filename);
}
