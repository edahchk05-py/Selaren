# Required integrations

Only the integrations below are in the MVP. Do not add others.

## 1. WhatsApp Cloud API (Meta)

**Required.** This is the patient channel.

### Purpose

- Receive inbound messages
- Send session messages and templates
- Receive delivery/read/opt-out callbacks

### Configuration (per clinic)

- WABA ID
- Phone number ID
- Permanent or long-lived access token (stored encrypted)
- Display number E.164
- Webhook verify token (app-level)

Webhook routing: `phone_number_id` → `whatsapp_connections.clinic_id`.

### Webhook

- Verify `X-Hub-Signature-256` with the Meta app secret
- Acknowledge quickly; process asynchronously
- Idempotent on `wa_message_id`
- Handle: text, image, audio, document, button/template replies (read as text)
- Handle `user` status `deleted` / stop: set `contacts.wa_opt_out = true`, cancel pending auto sends

### Required templates (outside 24h window)

Submit in **French** (primary). Darija/Arabic copies are optional for MVP.

| Name | Used for |
| --- | --- |
| `missed_call_recovery` | Missed-call WhatsApp |
| `follow_up_nudge` | Stall follow-up |
| `appointment_confirmation` | Booking / reschedule confirm |
| `appointment_reminder` | T−24h and T−2h (parameters: date, time) |
| `appointment_cancelled` | Cancellation notice |

Variable policy: clinic name, patient first name, date, time only. No medical content.

If a template is not yet approved, the clinic may still run an **in-window-only** pilot: session messages work; outside-window jobs fail visibly as Needs staff. Activation checklist allows operator override for this case.

### Not included

- WhatsApp Flows
- Catalog / commerce
- Broadcast lists
- Multi-number per clinic (exactly one connection)

## 2. LLM chat API

**Required** for AI-assisted replies.

### Purpose

Generate at most one reply per inbound, using clinic context and guardrails in [Conversations.md](./Conversations.md).

### Rules

- Vendor is an implementation choice (one provider)
- API key at **environment / Selaren** level, not per clinic
- Timeouts: fail after a short wait; retry once; then halt `ai_provider_error`
- Do not send patient photo/audio bytes to the LLM in MVP
- Do not log full prompts with phone numbers to third-party debug UIs
- System prompt must include: clinic knowledge, treatments, policies, do_not_say, open slots, language instruction, never invent prices, never diagnose, never book without a free slot

No other AI APIs (voice, embeddings search, autonomous tool-agents). A single “tools” call to `list_slots` / `create_appointment` **inside the same request lifecycle** is allowed if it is deterministic and server-validated. That is not an autonomous agent.

## 3. Application hosting / database / file storage

Required to run the product, not customer-facing integrations.

- Relational database (see Data-Model)
- Encrypted secret storage for WhatsApp tokens
- Object storage for inbound media (clinic-scoped keys)
- Background worker / cron for outbox, follow-ups, reminders

## Explicitly not integrated

| Integration | Status |
| --- | --- |
| Google Calendar / Outlook | No |
| Instagram Graph API | No |
| Website chat widget | No |
| Payment gateway (CMI, Stripe, PayPal, cash) | No |
| Telephony / PBX / missed-call webhooks | No |
| SMS | No |
| Email provider for patients | No |
| SaaS billing (Stripe subscriptions, etc.) | No |
| CNSS / CNOPS / DMP | No |
| Clinic PMS | No |

Staff invite emails: if implemented, a transactional email provider may be used **only** for login invites/password reset. That is not a patient channel. Password reset is in scope for auth completeness.

## Environments

Assume `development`, `staging`, `production`. Each has its own Meta app or test numbers. Production clinics never share a WhatsApp number across environments.
