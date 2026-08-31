# One-clinic pilot: localhost → a real clinic

This is the operational path for **one** Casablanca or Marrakech clinic. It does not add product scope. Source of truth remains `blueprint/Spec/`.

A complete pilot means the conversion loop works on the clinic’s real WhatsApp number:

**Inquiry → reply → qualification → appointment → deposit mark → show-up**

plus stall follow-ups, T−24h / T−2h reminders, missed-call recovery, pause, and human takeover.

Staff use the French UI. Patients never log in.

---

## 0. What this machine must keep running

Three processes, all from the repo root:

| Process | Command | Why |
| --- | --- | --- |
| PostgreSQL | `npm run db:dev` **or** Docker/`docker compose up -d` | App and worker die without it |
| Next.js | `npx next dev -H 127.0.0.1 -p 3000` | UI + webhook + server actions |
| Worker | `npm run worker:dev` (local) or `npm run worker` after `npm run build` | Delayed follow-ups and reminders. Immediate staff/AI sends flush in-process; **do not skip the worker** |

The webhook acknowledges Meta and ingests inbound messages. It does **not** run the delayed-job tick. Optional substitute for the worker if you host without a long-lived process: `POST /api/internal/tick` every ~30s with `Authorization: Bearer $CRON_SECRET`. **Do not use that cron while the worker is running.** For a laptop pilot, run the worker.

Staff should open **http://127.0.0.1:3000** (or this machine on the LAN). Meta cannot reach localhost; only the webhook needs a public HTTPS URL.

The first hosted pilot uses **one web replica**. Login rate-limiting is in-process (not Redis).

---

## 1. Secrets (`.env`)

Copy `.env.example` → `.env`. Fill **before** seed and before Meta verification.

| Variable | Rule |
| --- | --- |
| `DATABASE_URL` | `postgresql://selaren:selaren@localhost:5432/selaren?schema=public` if using `db:dev` |
| `SELAREN_SESSION_SECRET` | ≥ 32 characters; generate a real value |
| `SELAREN_ENCRYPTION_KEY` | 64 hex chars (32 bytes). Used to encrypt the clinic WhatsApp token. Losing it means re-entering the token |
| `SELAREN_OPERATOR_EMAIL` / `SELAREN_OPERATOR_PASSWORD` | Operator login; password ≥ 10 chars recommended. Change the example password |
| `META_APP_SECRET` | From the Meta app. Empty = every webhook POST is rejected |
| `META_WEBHOOK_VERIFY_TOKEN` | Any long random string; **same value** in Meta webhook settings |
| `OPENAI_API_KEY` | Required for AI auto-replies. Without it, threads halt `ai_provider_error` and stay in Needs staff |
| `CRON_SECRET` | Required only if you use `/api/internal/tick` |
| `WHATSAPP_GRAPH_VERSION` | Leave `v21.0` unless Meta requires otherwise |

Do **not** put the clinic access token in `.env`. It is entered in Clinique and stored encrypted.

---

## 2. Database (once per machine)

```bash
npm install
npm run db:dev          # keep this terminal open (embedded Postgres)
# other terminal:
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

If this machine already has tables from an older `db push` (no migration history): `npx prisma db push` then `npx prisma migrate resolve --applied 20260831120000_init`. Do not run that resolve on a fresh production database.

Confirm operator login works: open http://127.0.0.1:3000 → operator email/password from `.env`.

Health: `GET http://127.0.0.1:3000/api/health` → `{ "ok": true, "service": "selaren" }` only when Postgres is up.

---

## 3. Public HTTPS for Meta (required)

Meta Cloud API will not deliver to `http://127.0.0.1`.

1. Start Next.js bound to localhost:
   ```bash
   npx next dev -H 127.0.0.1 -p 3000
   ```
2. In another terminal, expose **only** that port with a stable HTTPS tunnel (ngrok, Cloudflare Tunnel, or equivalent):
   ```bash
   ngrok http 127.0.0.1:3000
   ```
3. Copy the `https://….ngrok-free.app` origin.
4. Webhook URL (no trailing query):
   `https://<tunnel-host>/api/webhooks/whatsapp`

Keep the tunnel process alive for the whole pilot. If the URL changes, update Meta and re-verify.

Staff should still use `http://127.0.0.1:3000` on this machine. Using the ngrok URL for the UI is optional; if you do, Next.js CSRF for server actions is allowed for `*.ngrok-free.app` / `*.ngrok.app` in `next.config.ts`.

---

## 4. Meta app (one app for this pilot)

In [Meta for Developers](https://developers.facebook.com):

1. App with **WhatsApp** product.
2. Webhook:
   - Callback URL = `https://<tunnel-host>/api/webhooks/whatsapp`
   - Verify token = `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to **messages** (includes inbound, statuses, and user deletion / stop).
3. Copy **App secret** → `META_APP_SECRET`, restart Next.js.
4. Click Verify. Meta GET must return the challenge as `text/plain` (already implemented).
5. WhatsApp → API Setup:
   - Note **Phone number ID** and **WhatsApp Business Account ID (WABA)**.
   - Generate a **permanent / long-lived** access token (not a 24h debug token).
   - Display number in E.164 (`+212…`).
6. For the first hours, use a **Meta test number** and add your personal WhatsApp as a recipient. Do not activate the clinic on a live patient number until step 8 passes.

Production clinics never share a WhatsApp number across environments.

---

## 5. WhatsApp templates (French, language code `fr`)

Submit these **exact names** in the WABA. Language code in Meta must be **`fr`** (the app sends `language: { code: "fr" }`). Body variables only — no medical copy.

| Template name | Body variables (in order) | When it is required |
| --- | --- | --- |
| `missed_call_recovery` | `{{1}}` clinic name, `{{2}}` first name | Missed-call to a number **outside** the 24h window (almost always) |
| `follow_up_nudge` | `{{1}}` clinic name, `{{2}}` first name | Stall follow-ups 2h / 24h / 72h / 7d if the patient went silent |
| `appointment_confirmation` | `{{1}}` clinic, `{{2}}` first name, `{{3}}` date, `{{4}}` time | Booking / reschedule if outside 24h |
| `appointment_reminder` | `{{1}}` clinic, `{{2}}` first name, `{{3}}` date, `{{4}}` time | T−24h and T−2h |
| `appointment_cancelled` | `{{1}}` clinic name, `{{2}}` first name | Cancellation notice if outside 24h |

Example bodies (must match the number of variables above):

- missed_call / follow-up: `{{1}} : Bonjour {{2}}, nous revenons vers vous. Répondez à ce message.`
- confirmation / reminder: `{{1}} : Bonjour {{2}}, rendez-vous le {{3}} à {{4}}. Répondez si vous devez modifier.`
- cancelled: `{{1}} : Bonjour {{2}}, votre rendez-vous a été annulé. Répondez pour replanifier.`

**Wait until Meta status is Approved** before treating outside-window jobs as in-scope.

Session-only override (Clinique → “Pilote 24h uniquement”) is allowed by the spec for an **in-window** dry run. It is **not** a complete clinic pilot: missed-call recovery and T−24h reminders will fail visibly (`outside_window` / Needs staff) without approved templates.

Inside the 24h customer-care window, Selaren sends **session text**, even if a template name is attached. Templates are used only outside that window.

---

## 6. Operator: create and configure the clinic

Sign in as operator → **Cliniques** → create clinic.

City: Casablanca **or** Marrakech only. Timezone is `Africa/Casablanca`. Deposits are tracked, not collected.

On **Clinique** (or setup), complete the activation checklist (enforced):

- [ ] Name and city
- [ ] Default consultation value MAD > 0
- [ ] ≥ 1 owner (invite with a temporary password ≥ 10 characters)
- [ ] ≥ 1 offered treatment (implant / veneers / aligners / etc.)
- [ ] Knowledge: about, tone, pricing notes, FAQs, policies, booking rules, do-not-say — all non-empty
- [ ] ≥ 1 enabled weekday
- [ ] WhatsApp: WABA ID, Phone number ID, display `+212…`, access token
- [ ] Templates acknowledged **or** session-only pilot checked

Save WhatsApp **once** with the token. The token is never shown again.

Operator clicks **Activer**. If the checklist is incomplete, the page stays on Clinique with “Activation refusée” and the missing items listed. Status must become `active` before AI may send to real patients. While `onboarding` / `paused`, inbound is stored; AI does not send; staff may still reply.

Invite front-desk `staff`. Owner/operator can reset a temporary password from the team list (forces change on next login).

---

## 7. Worker + tunnel still up

Before any live message:

```bash
npm run worker:dev
```

Confirm:

- Tunnel URL still matches Meta
- `GET /api/health` ok
- Clinic status `active`
- WhatsApp connection `active`

---

## 8. Closed-loop test (Meta test number or your phone)

Do this **before** the clinic’s public number is the live inbound line.

1. Send a WhatsApp **text** to the clinic number → Inbox shows one open inquiry, one thread. A second message from the same number must **not** open a second inquiry.
2. Clinic `active`, thread in AI mode, inside 24h → one auto-reply using knowledge. No invented prices.
3. Ask a price **not** in knowledge → halt `missing_price`, Needs staff.
4. **Prendre la main** → AI stops. Staff reply actually arrives on WhatsApp (not stuck `queued`).
5. **Rendre à l’IA**; continue until qualification: treatment + intent to book + can attend.
6. Book a listed slot (staff or patient accepting a listed slot). Confirmation sent. Reminders scheduled T−24h / T−2h (skipped if already past).
7. Agenda: reschedule to another listed slot; cancel; mark acompte (MAD optional) and unmark; mark Venu / Absent (Absent blocked before start; system never auto-marks no-show).
8. Dashboard: deposited consultation increments North Star after acompte.
9. Log a missed call for a **new** number → recovery WhatsApp (needs approved `missed_call_recovery` if outside 24h). For a number already booked → no sales pitch.
10. Leave an unbooked thread silent → follow-ups at 2h, 24h, 72h, 7d; quiet hours 21:00–09:00 Casablanca (worker must stay up overnight for this).
11. **Pause** → inbound stored, AI silent, staff can still reply. Re-activate when ready.
12. Staff cannot edit knowledge / hours / WhatsApp; owner can.

If a send fails, open the thread: `errorDetail` on the outbound message (template name mismatch, expired token, outside window). Fix credentials or templates; do not add product features.

---

## 9. Cut over to the real clinic number

Only after step 8 is green on a test recipient:

1. Pause if anything looks wrong.
2. In Meta, the **clinic’s** Cloud API number is the one saved in Clinique (Phone number ID + token + display E.164).
3. Confirm the same webhook still receives that number (`phone_number_id` routes to this clinic).
4. Activate. Operator stays on-site for the 14-day pilot.
5. Owner: change password, confirm hours/treatments/deposit policy text, practice takeover on a test thread.
6. Front desk: Inbox all day; log missed calls; mark acompte and présence on Agenda.

If the laptop sleeps, WhatsApp inbound ACK can still work while Next.js runs, but **follow-ups and reminders stop** without the worker. Keep the machine awake or move the same three processes to Railway (or any always-on host with HTTPS):

- **PostgreSQL**
- **Web:** build with `npm ci` (not `--omit=dev`) then `npm run build`; start `npx prisma migrate deploy && npm start` — Meta callback `https://<web-host>/api/webhooks/whatsapp`
- **Worker:** same build; start `npm run worker` (`node dist/worker.js`), same `DATABASE_URL` and secrets, no public HTTP, no `.env` file

`nixpacks.toml` keeps the Nixpacks install as `npm ci` so `esbuild` can compile the worker. Do not override install to `npm ci --omit=dev`. Runtime does not need `tsx`. Do not run `prisma/seed.ts` on every deploy (it will not reset the operator password unless `SELAREN_OPERATOR_RESET_PASSWORD=true`; production still requires a real `SELAREN_OPERATOR_PASSWORD` if you seed once).

Local media on Railway is ephemeral unless a volume is attached. Hosting is not a new product feature.

---

## 10. Pause / stop

Operator → Clinique → **Pause**. Inbound is kept. AI does not send.

To stop Meta traffic: unsubscribe the webhook or disconnect the number in Meta. Then stop Next.js, worker, tunnel, and `db:dev`.

---

## Out of scope (do not add during the pilot)

Voice, PBX, PMS, medical records, CNSS, billing, payment collection, Instagram, website widget, Google Calendar, patient login, multi-number, multi-country.

Commercial setup/monthly fees and invoicing stay manual, outside the product.
