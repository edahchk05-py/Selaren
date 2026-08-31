# Clinic onboarding

Onboarding is **operator-led**, not self-serve. This matches the setup fee and in-person sales motion.

The product does not include a public “create your clinic” flow.

## Goal

When onboarding is complete, the clinic can:

1. Receive WhatsApp inquiries in Selaren
2. Reply (AI and/or human)
3. Qualify
4. Book against real availability
5. Follow up
6. See basic analytics

## Clinic statuses

| Status | Meaning |
| --- | --- |
| `onboarding` | Workspace exists; not yet live. AI must not send to real patients. |
| `active` | Live. Inbound WhatsApp is processed. |
| `paused` | Inbound may be received and stored, but AI must not send. Staff may reply. |

## Onboarding sequence

Operator performs these steps, in order. The UI for this sequence is not specified here; the **data and checks** are.

### 1. Create workspace

Required fields:

- `name`
- `city` (`casablanca` \| `marrakech`)
- `country_code` = `MA` (fixed)
- `timezone` = `Africa/Casablanca` (fixed)
- `locale` = `fr` (fixed for MVP)
- `default_slot_minutes` (default 30)
- `default_consultation_value_mad` (required before `active`; used for estimated revenue)
- `deposit_typically_required` (boolean; informational for AI copy and dashboard, not a payment trigger)

Result: `clinics.status = onboarding`.

### 2. Create owner user

- Email, name, temporary password (owner changes on first login).
- Membership role `owner`.

### 3. Optional: create staff users

Same as owner, role `staff`. Can be done later by the owner.

### 4. Treatments

Create the clinic’s offered high-value treatments. Each treatment:

- `name`
- `category`: `implant` \| `veneer` \| `aligner` \| `orthodontics` \| `aesthetic` \| `other`
- `offered` (default true)
- `estimated_value_mad` (optional; falls back to clinic default)
- `notes` (what AI may say: starting point, consult needed, etc.)

At least one offered treatment is required to go `active`.

### 5. Knowledge / context

A single knowledge record per clinic. Required before `active`:

- `about_text` — who the clinic is, neighborhood/area, languages spoken
- `tone` — short instruction (e.g. professional, warm, not salesy slang)
- `pricing_notes` — what may be said about price; if a figure is not written here or on a treatment, AI must not invent one
- `faqs` — common questions and answers
- `policies` — deposit expectation, cancellation, lateness (text only)
- `booking_rules` — consult length, who the consult is with (text), same-day rules
- `do_not_say` — medical advice limits, competitor talk, guarantees

Knowledge is the only clinic-specific AI context besides treatments, hours, and open slots.

### 6. Availability

- Working hours for each weekday (enable/disable + start/end).
- Optional blocked exceptions (holidays, closures).
- At least one enabled weekday is required to go `active`.

### 7. WhatsApp connection

Connect Cloud API credentials for **this clinic’s** business number. See [Integrations.md](./Integrations.md).

Required to go `active`:

- `status = active` on `whatsapp_connections`
- Inbound webhook delivering to this clinic
- Required message templates submitted/approved for use outside the 24-hour window (see template list in Integrations)

### 8. Activate

Operator sets `status = active` only if the checklist below passes.

Until `active`, inbound test messages may be sent to a designated test number. AI auto-send is off for non-test contacts while `onboarding`.

## Activation checklist (enforced)

- [ ] Clinic name, city set
- [ ] `default_consultation_value_mad` > 0
- [ ] ≥ 1 owner membership
- [ ] ≥ 1 offered treatment
- [ ] Knowledge required fields non-empty
- [ ] ≥ 1 enabled weekday with valid hours
- [ ] WhatsApp connection `active`
- [ ] Required templates available (or operator acknowledges same-day session-only pilot — see Integrations)

## Owner first-login duties

Not blockers for `active`, but expected in the 14-day pilot:

- Change password
- Confirm hours and treatments
- Confirm deposit policy text
- Practice takeover on a test thread

## What onboarding is not

- No payment method capture
- No CNSS/legal entity KYC in-app
- No automated website scrape
- No Instagram connection
- No migration from another PMS
