-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "City" AS ENUM ('casablanca', 'marrakech');

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('onboarding', 'active', 'paused');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'staff');

-- CreateEnum
CREATE TYPE "TreatmentCategory" AS ENUM ('implant', 'veneer', 'aligner', 'orthodontics', 'aesthetic', 'other');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('disconnected', 'pending', 'active', 'error');

-- CreateEnum
CREATE TYPE "ContactLanguage" AS ENUM ('fr', 'ar', 'unknown');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('ai', 'human');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('patient', 'ai', 'staff', 'system');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "InquirySource" AS ENUM ('whatsapp', 'missed_call', 'manual');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('open', 'booked', 'closed');

-- CreateEnum
CREATE TYPE "ClosedReason" AS ENUM ('unresponsive', 'not_interested', 'spam', 'duplicate', 'other');

-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('unevaluated', 'in_progress', 'qualified', 'disqualified');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('unknown', 'information', 'book', 'admin');

-- CreateEnum
CREATE TYPE "CanAttend" AS ENUM ('unknown', 'yes', 'no');

-- CreateEnum
CREATE TYPE "DisqualifyReason" AS ENUM ('no_intent', 'cannot_attend', 'treatment_not_offered', 'spam', 'wrong_number', 'existing_admin_only', 'other');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'cancelled', 'rescheduled');

-- CreateEnum
CREATE TYPE "Attendance" AS ENUM ('pending', 'showed', 'no_show');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('none', 'deposited');

-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('stall', 'manual');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('t24h', 't2h');

-- CreateEnum
CREATE TYPE "ExceptionKind" AS ENUM ('blocked');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_selaren_operator" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "country_code" CHAR(2) NOT NULL DEFAULT 'MA',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "status" "ClinicStatus" NOT NULL DEFAULT 'onboarding',
    "default_slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "default_consultation_value_mad" DECIMAL(12,2),
    "deposit_typically_required" BOOLEAN NOT NULL DEFAULT true,
    "session_only_pilot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_memberships" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_knowledge" (
    "clinic_id" UUID NOT NULL,
    "about_text" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "pricing_notes" TEXT NOT NULL,
    "faqs" TEXT NOT NULL,
    "policies" TEXT NOT NULL,
    "booking_rules" TEXT NOT NULL,
    "do_not_say" TEXT NOT NULL,
    "follow_up_text" TEXT,
    "missed_call_text" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" UUID,

    CONSTRAINT "clinic_knowledge_pkey" PRIMARY KEY ("clinic_id")
);

-- CreateTable
CREATE TABLE "treatments" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TreatmentCategory" NOT NULL,
    "offered" BOOLEAN NOT NULL DEFAULT true,
    "estimated_value_mad" DECIMAL(12,2),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_hours" (
    "clinic_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("clinic_id","weekday")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "kind" "ExceptionKind" NOT NULL DEFAULT 'blocked',
    "reason" TEXT,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "clinic_id" UUID NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_e164" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'pending',
    "last_error" TEXT,
    "templates_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("clinic_id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "name" TEXT,
    "language" "ContactLanguage" NOT NULL DEFAULT 'unknown',
    "wa_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "mode" "ConversationMode" NOT NULL DEFAULT 'ai',
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "ai_halt_reason" TEXT,
    "needs_ai_reply" BOOLEAN NOT NULL DEFAULT false,
    "last_patient_message_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "last_staff_viewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "sender_type" "MessageSenderType" NOT NULL,
    "staff_user_id" UUID,
    "body" TEXT NOT NULL DEFAULT '',
    "media_url" TEXT,
    "media_type" TEXT,
    "template_name" TEXT,
    "wa_message_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "error_detail" TEXT,
    "send_attempts" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "source" "InquirySource" NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'open',
    "closed_reason" "ClosedReason",
    "first_response_at" TIMESTAMP(3),
    "qualified_at" TIMESTAMP(3),
    "booked_at" TIMESTAMP(3),
    "estimated_value_mad" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualifications" (
    "inquiry_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "status" "QualificationStatus" NOT NULL DEFAULT 'unevaluated',
    "treatment_id" UUID,
    "treatment_label" TEXT,
    "intent" "Intent" NOT NULL DEFAULT 'unknown',
    "can_attend_clinic" "CanAttend" NOT NULL DEFAULT 'unknown',
    "disqualify_reason" "DisqualifyReason",
    "notes" TEXT NOT NULL DEFAULT '',
    "locked_by_staff" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("inquiry_id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "attendance" "Attendance" NOT NULL DEFAULT 'pending',
    "deposit_status" "DepositStatus" NOT NULL DEFAULT 'none',
    "deposit_amount_mad" DECIMAL(12,2),
    "deposited_at" TIMESTAMP(3),
    "marked_by_user_id" UUID,
    "superseded_by_appointment_id" UUID,
    "confirmation_sent_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "step" INTEGER NOT NULL,
    "kind" "FollowUpKind" NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "skip_reason" TEXT,
    "message_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "skip_reason" TEXT,
    "message_id" UUID,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missed_calls" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL,
    "logged_by_user_id" UUID NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "notify_patient" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missed_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "clinic_id" UUID,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_memberships_clinic_id_user_id_key" ON "clinic_memberships"("clinic_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_key" ON "whatsapp_connections"("phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_clinic_id_phone_e164_key" ON "contacts"("clinic_id", "phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_contact_id_key" ON "conversations"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_wa_message_id_key" ON "messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_status_created_at_idx" ON "messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_clinic_id_created_at_idx" ON "inquiries"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_contact_id_status_idx" ON "inquiries"("contact_id", "status");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_start_at_idx" ON "appointments"("clinic_id", "start_at");

-- CreateIndex
CREATE INDEX "follow_ups_scheduled_at_sent_at_canceled_at_idx" ON "follow_ups"("scheduled_at", "sent_at", "canceled_at");

-- CreateIndex
CREATE INDEX "reminders_scheduled_at_sent_at_canceled_at_idx" ON "reminders"("scheduled_at", "sent_at", "canceled_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_appointment_id_kind_key" ON "reminders"("appointment_id", "kind");

-- CreateIndex
CREATE INDEX "audit_events_clinic_id_created_at_idx" ON "audit_events"("clinic_id", "created_at");

-- AddForeignKey
ALTER TABLE "clinic_memberships" ADD CONSTRAINT "clinic_memberships_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_memberships" ADD CONSTRAINT "clinic_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_knowledge" ADD CONSTRAINT "clinic_knowledge_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_knowledge" ADD CONSTRAINT "clinic_knowledge_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_superseded_by_appointment_id_fkey" FOREIGN KEY ("superseded_by_appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_calls" ADD CONSTRAINT "missed_calls_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_calls" ADD CONSTRAINT "missed_calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_calls" ADD CONSTRAINT "missed_calls_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_calls" ADD CONSTRAINT "missed_calls_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial unique indexes and overlap exclusion (Prisma cannot express these).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX IF NOT EXISTS inquiries_one_open_or_booked_per_contact
  ON inquiries (contact_id)
  WHERE status IN ('open', 'booked');

CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_scheduled_per_contact
  ON appointments (contact_id)
  WHERE status = 'scheduled';

DO $$
BEGIN
  CREATE OR REPLACE FUNCTION selaren_tstzrange(timestamptz, timestamptz)
  RETURNS tstzrange
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  AS $fn$ SELECT tstzrange($1, $2, '[)') $fn$;

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
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'appointments_no_overlap_scheduled not applied: %', SQLERRM;
END $$;
