import { prisma } from "./lib/db";
import { runTick } from "./lib/jobs/tick";

const interval = Number(process.env.WORKER_INTERVAL_MS ?? 4000);

let stopped = false;
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function tickOnce() {
  if (stopped) return;
  if (inFlight) return;
  inFlight = (async () => {
    try {
      await runTick();
    } catch (err) {
      console.error("tick_failed", err);
    }
  })();
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

function schedule() {
  if (stopped) return;
  timer = setTimeout(() => {
    void tickOnce().then(schedule);
  }, interval);
}

async function shutdown(signal: string) {
  if (stopped) return;
  stopped = true;
  console.log("worker_shutdown", signal);
  if (timer) clearTimeout(timer);
  if (inFlight) await inFlight;
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

console.log("Selaren worker started");
void tickOnce().then(schedule);
