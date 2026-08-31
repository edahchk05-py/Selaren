import EmbeddedPostgres from "embedded-postgres";
import { mkdirSync } from "fs";
import { join } from "path";

const dir = join(process.cwd(), "data", "pg");
mkdirSync(dir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "selaren",
  password: "selaren",
  port: 5432,
  persistent: true,
});

async function main() {
  try {
    await pg.initialise();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already|exists|initialized/i.test(msg)) {
      console.warn("initialise:", msg);
    }
  }
  await pg.start();
  try {
    await pg.createDatabase("selaren");
  } catch {
    /* already exists */
  }
  console.log("PostgreSQL running on localhost:5432 (user selaren / db selaren)");
  console.log("Keep this process open. Then run: npx prisma migrate deploy && npx tsx prisma/seed.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
