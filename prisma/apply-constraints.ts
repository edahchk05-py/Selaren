import { prisma } from "../src/lib/db";

/** Idempotent extras for databases that were created with `db push` instead of migrate deploy. */
export async function applyConstraints() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS inquiries_one_open_or_booked_per_contact
    ON inquiries (contact_id)
    WHERE status IN ('open', 'booked')
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_scheduled_per_contact
    ON appointments (contact_id)
    WHERE status = 'scheduled'
  `);
  try {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION selaren_tstzrange(timestamptz, timestamptz)
      RETURNS tstzrange
      LANGUAGE sql
      IMMUTABLE
      PARALLEL SAFE
      AS $$ SELECT tstzrange($1, $2, '[)') $$
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap_scheduled'
        ) THEN
          ALTER TABLE appointments
            ADD CONSTRAINT appointments_no_overlap_scheduled
            EXCLUDE USING gist (
              clinic_id WITH =,
              selaren_tstzrange(start_at, end_at) WITH &&
            )
            WHERE (status = 'scheduled');
        END IF;
      END $$;
    `);
  } catch (err) {
    console.warn(
      "Overlap exclusion not applied (Postgres version). Booking still checks overlaps in application code.",
      err instanceof Error ? err.message : err,
    );
  }
}

if (require.main === module) {
  applyConstraints()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
