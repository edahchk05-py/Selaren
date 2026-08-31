import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { mediaDiskPath } from "@/lib/media";
import { requireClinic } from "@/lib/tenancy";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ clinicId: string; filename: string }> },
) {
  const { clinicId, filename } = await ctx.params;
  const session = await requireClinic("view").catch(() => null);
  if (!session || (session.clinicId !== clinicId && !session.isOperator)) {
    return new NextResponse("forbidden", { status: 403 });
  }
  try {
    const buf = await readFile(mediaDiskPath(clinicId, filename));
    return new NextResponse(buf, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
