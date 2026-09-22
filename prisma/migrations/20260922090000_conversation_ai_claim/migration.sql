-- An AI turn is claimed before the LLM call so two workers cannot answer twice.
-- The timestamp lets a restarted worker requeue a turn that died mid-flight.
ALTER TABLE "conversations" ADD COLUMN "ai_claimed_at" TIMESTAMP(3);

CREATE INDEX "conversations_needs_ai_reply_idx" ON "conversations" ("needs_ai_reply", "updated_at");
CREATE INDEX "conversations_ai_claimed_at_idx" ON "conversations" ("ai_claimed_at");
