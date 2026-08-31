-- Extra constraints that Prisma cannot express in schema.prisma.
-- Applied by the production migration `20260831120000_init`.
-- `prisma/apply-constraints.ts` remains idempotent for databases created with `db push`.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX IF NOT EXISTS inquiries_one_open_or_booked_per_contact
  ON inquiries (contact_id)
  WHERE status IN ('open', 'booked');

CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_scheduled_per_contact
  ON appointments (contact_id)
  WHERE status = 'scheduled';

CREATE OR REPLACE FUNCTION selaren_tstzrange(timestamptz, timestamptz)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT tstzrange($1, $2, '[)') $$;

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
