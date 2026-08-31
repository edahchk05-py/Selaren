# Selaren

Patient-demand conversion for premium private dental clinics in Casablanca and Marrakech.

**Turn every inquiry into an appointment.**

Selaren is not a chatbot, AI receptionist, PMS, EMR, CRM, or payment system.

Source of truth: [`blueprint/`](blueprint/Spec/README.md). Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). One-clinic go-live: [`docs/PILOT.md`](docs/PILOT.md). Handbook: [`docs/SELAREN_USER_GUIDE.md`](docs/SELAREN_USER_GUIDE.md) · [PDF](docs/SELAREN_USER_GUIDE.pdf). Product: [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md).

## What this MVP does

Inquiry → WhatsApp → AI-assisted reply → qualification → availability → booking → follow-up → reminder → dashboard → conversion tracking.

Deposits are **tracked**, not collected. Missed calls are **logged by staff**, then recovered on WhatsApp. No PBX. No billing.

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL 16 + Prisma (`prisma migrate deploy`)
- Meta WhatsApp Cloud API
- OpenAI (JSON replies, server-side guardrails)
- Background worker (`npm run worker` → `node dist/worker.js`) polling PostgreSQL (outbox, AI, follow-ups, reminders)

Production is three processes: **PostgreSQL + Next.js Web + Worker**. The WhatsApp webhook does not run delayed jobs.

## Environment variables

Copy `.env.example` to `.env` for local development. Production injects the same names via the host (no `.env` file). Required:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `SELAREN_SESSION_SECRET` | ≥32 chars, session cookie |
| `SELAREN_ENCRYPTION_KEY` | 64 hex chars (32 bytes) for WhatsApp tokens |
| `SELAREN_OPERATOR_EMAIL` / `SELAREN_OPERATOR_PASSWORD` | Seeded operator. Production seed requires a real password (not the example). Re-running seed does not reset the password unless `SELAREN_OPERATOR_RESET_PASSWORD=true`. |
| `META_APP_SECRET` | Webhook `X-Hub-Signature-256` |
| `META_WEBHOOK_VERIFY_TOKEN` | Webhook handshake |
| `OPENAI_API_KEY` | AI replies |
| `CRON_SECRET` | Optional `POST /api/internal/tick` — do not use while the worker runs |

Per-clinic WhatsApp credentials are entered in the app (encrypted at rest). They are not env vars.

## Run locally

PostgreSQL must be reachable. Use `npm run db:dev` (embedded Postgres, keep that process open) or `docker compose up -d` if Docker is available.

```bash
cp .env.example .env
# edit .env

npm install
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts

npx next dev -H 127.0.0.1 -p 3000
# other terminals:
npm run worker:dev
# HTTPS tunnel for Meta — see docs/PILOT.md
```

If this database was created earlier with `db push` and has no migration history: `npx prisma db push` then `npx prisma migrate resolve --applied 20260831120000_init`.

Open http://127.0.0.1:3000 — sign in as the operator from `.env`.

Webhook URL for Meta: `https://<public-host>/api/webhooks/whatsapp`

Health: `GET /api/health` — 200 only when Postgres is reachable.

## Production (Railway)

Three services, same Git repo. **Do not deploy with a single `npm ci --omit=dev` as the build install.** `esbuild` is a devDependency used only to compile `dist/worker.js`.

| Service | Build | Start |
| --- | --- | --- |
| PostgreSQL | plugin | — |
| Web | `npm ci` then `npm run build` | `npx prisma migrate deploy && npm start` |
| Worker | `npm ci` then `npm run build` | `npm run worker` |

`nixpacks.toml` encodes install = `npm ci` (devDependencies included). Railway Railpack does the same with `npm ci --include=dev`. After the image is built, the runtime does **not** need `tsx` or `esbuild`.

Do **not** set a custom install command of `npm ci --omit=dev`. That cannot compile the worker. Omit-dev is only valid **after** `dist/worker.js` exists (or as a prune step after build).

Health check path: `/api/health`. First pilot: one Web replica, one Worker. Do not also cron `/api/internal/tick`.

Local media (`storage/media/{clinicId}/`) is **ephemeral** on Railway unless a volume is attached. The first pilot can be text-first.

Worker env comes from `process.env`. `npm run worker` does not read a `.env` file and does not need `tsx` at runtime.

`npx prisma migrate deploy` on the Web start command only (not on the Worker). Seed (`tsx prisma/seed.ts`) is **not** part of deploy. If you seed production once: `SELAREN_OPERATOR_PASSWORD` is required, must not be `change-this-password`, and a second seed does not overwrite the operator password unless `SELAREN_OPERATOR_RESET_PASSWORD=true`.

## Manual end-to-end test

1. Operator: create a clinic (Casablanca or Marrakech).
2. Add owner + optional staff; set knowledge, ≥1 treatment, hours, consultation value.
3. Connect WhatsApp Cloud API (or session-only pilot override).
4. Activate. Confirm AI does not send while `onboarding` / `paused`.
5. Send a WhatsApp text to the clinic number. Confirm one open inquiry, one thread, no duplicate on a second message.
6. Confirm an auto-reply using clinic knowledge (clinic `active`, mode AI, inside 24h).
7. Ask a price that is **not** in knowledge → halt `missing_price`, Needs staff.
8. Staff takeover → AI stops; send a human reply.
9. Release to AI; continue; qualify (treatment + intent to book + can attend).
10. Book a free slot (staff or patient accepting a listed slot). Confirmation + reminders T−24h / T−2h (skip if already past).
11. Mark deposit (MAD optional). Confirm North Star increments on the dashboard.
12. Mark showed / no-show (no-show blocked before start). System must not auto-mark no-show.
13. Log a missed call for a new number → recovery WhatsApp. For an already booked number → no sales pitch.
14. Leave an unbooked thread silent → follow-ups at 2h, 24h, 72h, 7d (quiet hours 21:00–09:00 Casablanca).
15. Pause clinic → inbound stored, AI silent, staff can still reply.
16. Staff cannot edit knowledge/WhatsApp; owner can. Operator can list all clinics.

Automated checks: `npm test` (phone, qualification, slots, quiet hours, metrics, webhook, activation). Full WhatsApp/LLM path needs live credentials.

## Known gaps vs live Meta/OpenAI

Without `OPENAI_API_KEY`, AI halts `ai_provider_error` and the inquiry stays visible.

Without approved templates, outside-24h jobs fail visibly (Needs staff) unless session-only pilot.

Local media is stored under `storage/media/{clinicId}/`. On Railway this disk is ephemeral unless a volume is mounted; inbound media is not required for the conversion loop.

## Do not add

Voice, PMS, medical records, CNSS, billing, payment collection, Instagram/website channels, Google Calendar, patient login, multi-country packaging.
