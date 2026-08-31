# Selaren MVP — Implementation architecture

Source of truth: `blueprint/` (especially `blueprint/Spec/`). This document records **how** the spec is implemented. It does not change product scope.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 15 (App Router) + TypeScript | One deployable for UI + API (webhooks, actions) |
| Database | PostgreSQL 16 | Required exclusion/partial unique indexes, UUID, timestamptz |
| ORM | Prisma | Typed access; extra constraints in SQL migrations |
| Auth | Email + password, httpOnly signed session cookie (`jose`) | Matches spec; no SSO |
| Jobs | PostgreSQL-backed worker (`src/worker.ts` → `dist/worker.js`) | Spec: persist outbox; poll queued messages, follow-ups, reminders |
| WhatsApp | Meta Cloud API v21 | Locked |
| LLM | OpenAI Chat Completions (JSON object) | Single vendor; key at Selaren env, not per clinic |
| Secrets | AES-256-GCM for WhatsApp tokens | Never stored or shown in plaintext |
| Media | Local disk `storage/media/{clinicId}/…` | Clinic-scoped keys; session-gated download. **Ephemeral on Railway unless a volume is mounted.** First pilot is text-first. |
| UI locale | French | Locked |

No Redis. No billing. No payment gateway. No Google Calendar. No PBX.

## Production process model (Railway)

```
PostgreSQL
  ↑
  ├── Next.js Web   UI, server actions, GET/POST /api/webhooks/whatsapp, GET /api/health
  └── Worker        outbox flush, AI queue, stall follow-ups, appointment reminders
```

Meta → `POST /api/webhooks/whatsapp` (signature, persist inbound, 200).

The webhook **does not** run the delayed-job tick. After ingest it may call `processAiConversation` so AI replies stay immediate. Queued WhatsApp, follow-ups, and reminders belong to the **worker**.

`POST /api/internal/tick` with `Authorization: Bearer $CRON_SECRET` still exists as a substitute if a host cannot run a long-lived worker. **Do not use it while the worker is running** (duplicate sends).

First pilot: **one Web replica** and **one Worker replica**. Login rate-limit is in-process memory (10 attempts / 15 minutes / email). It is not shared across replicas.

## Commands

| Step | Command |
| --- | --- |
| Build | `npm ci` (devDependencies included) then `npm run build` (`prisma generate` + `next build` + compile worker to `dist/worker.js`). `esbuild` is a **devDependency**. Do not build with `npm ci --omit=dev`. |
| Runtime | Web: `npx prisma migrate deploy && npm start`. Worker: `npm run worker` (`node dist/worker.js`). Runtime may omit devDependencies. |
| Migrate | `npx prisma migrate deploy` |
| Web start | `npm start` (`next start --hostname 0.0.0.0`, port from `PORT`) |
| Worker start | `npm run worker` (`node dist/worker.js`, env from `process.env`, no `.env` file) |
| Health | `GET /api/health` — 200 `{ ok: true, service: "selaren" }` only if Postgres answers |

A fresh database is created entirely by `prisma migrate deploy` (schema, indexes, foreign keys, partial unique indexes, overlap exclusion when the Postgres version allows it). Do not use `prisma db push` in production.

Existing local databases that were created with `db push` (no `_prisma_migrations` row): add any missing columns with `prisma db push`, then `npx prisma migrate resolve --applied 20260831120000_init`. Do not run that resolve on an empty production database.

## Tenancy

- Every clinic-owned row has `clinic_id`.
- Queries always include `clinicId` from the session workspace (membership) or an operator clinic switch (audited).
- WhatsApp routing key: `phone_number_id` → `whatsapp_connections.clinic_id`.
- Staff never receive access tokens.

## AuthZ

| Role | Storage |
| --- | --- |
| `selaren_operator` | `users.is_selaren_operator` |
| `owner` / `staff` | `clinic_memberships.role` |

Paused clinic: owner/staff read-only except sending staff replies and viewing; operators may still configure. Mutations that edit knowledge/hours/WhatsApp/memberships are blocked for owner/staff when paused. Automated patient WhatsApp (AI, stall follow-ups, reminders) does not send while the clinic is not `active`.

## Async conversion loop

1. Inbound webhook verified → upsert contact/conversation/inquiry/message (`wa_message_id` idempotent).
2. If AI may send: `conversations.needs_ai_reply = true`.
3. Webhook `after()` and/or worker: load knowledge, treatments, next 12 slots, last 20 messages → LLM JSON → guardrails → at most one queued outbound. `needs_ai_reply` is claimed with `updateMany` before the LLM call. Any model `halt_reason` ends the turn (no book, no AI send). Immediately before booking or sending, the conversation is re-read; takeover (`mode=human`), pause, opt-out, or an existing halt abort the in-flight turn.
4. Worker (and immediate `enqueueOutbound` flush) send `messages.status = queued` via Cloud API after an atomic `claimed_at` claim (session vs template by 24h window). Before Graph is called, `send_started_at` is set. Meta Cloud API has **no** message idempotency key. If the process dies after Meta accepts the message, the row is marked `failed` / `send_outcome_unknown` and is **never sent again**. Follow-ups and reminders reuse one message row; they do not enqueue a second logical message on retry.
5. Follow-ups/reminders: due rows are claimed (`claimed_at`) before send. `sent_at` is set only after the outbound message is actually `sent`. Failed and unknown sends stay visible on the thread (`status = failed`, `error_detail`).

Booking: the clinic row is locked `FOR UPDATE` inside the appointment transaction. Partial unique index: one `scheduled` appointment per contact. Exclusion constraint (when applied): no overlapping `scheduled` intervals per clinic.

## Inferred implementation details (simplest safe)

Documented also in `blueprint/Spec/Assumptions.md` if product-visible:

- `users.must_change_password` — temporary password at onboarding.
- `clinics.session_only_pilot` — operator override when templates are not yet approved.
- `conversations.needs_ai_reply` — async AI queue flag.
- `claimed_at` / `send_started_at` on messages / follow-ups / reminders — worker claim and Graph in-flight marker, not a product feature.
- Login rate-limit: in-process, 10 attempts / 15 minutes / email. One web replica for the first pilot.
- Password reset: owner/operator can set a new temporary password (no patient email channel). Optional SMTP not required for MVP; operator sets password in-app.

## What is not in this architecture

Voice, PMS, records, Instagram, website widget, calendar sync, payments, billing, multi-country, autonomous agents.
