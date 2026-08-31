-- Durable marker that Graph has been invoked for this outbound row.
-- Used to refuse a second send when the worker dies after Meta accepts the message.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "send_started_at" TIMESTAMP(3);
