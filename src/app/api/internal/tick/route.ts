import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/jobs/tick";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  await runTick();
  return NextResponse.json({ ok: true });
}
