import { PrismaClient } from "@prisma/client";
import { applyConstraints } from "./apply-constraints";
import { upsertSelarenOperator } from "../src/lib/seedOperator";

const prisma = new PrismaClient();

async function main() {
  await applyConstraints().catch((e) => {
    console.warn("constraints (run after db is up):", e.message);
  });

  const result = await upsertSelarenOperator(prisma, process.env);
  console.log(
    `Operator ready: ${result.email}` +
      (result.created ? " (created)" : result.passwordUpdated ? " (password reset)" : " (password unchanged)"),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
