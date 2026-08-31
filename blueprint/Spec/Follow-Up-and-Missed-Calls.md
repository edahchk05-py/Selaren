# Follow-up and missed-call recovery

These two flows exist to recover demand the clinic already paid to generate.

## Follow-up (unconverted inquiries)

An inquiry is **eligible for automatic stall follow-up** when all of:

- `status = open`
- qualification is not `disqualified`
- conversation `mode = ai` (human takeover **pauses** auto stall follow-up)
- clinic `status = active`
- no `scheduled` appointment
- follow-up sequence not exhausted
- contact has not opted out

Staff may always send a **manual** follow-up regardless of mode.

### Cadence (from last activity)

`last_activity_at` = latest of last inbound, last outbound, inquiry `created_at`.

When a message is sent or received, **reschedule** the next pending stall follow-up from that new `last_activity_at`. Do not stack duplicates.

| Step | Fire after last activity | Purpose |
| --- | --- | --- |
| 1 | **2 hours** | Same-day recovery of silence after first contact |
| 2 | **24 hours** | Next-day nudge |
| 3 | **72 hours** | Second chance |
| 4 | **7 days** | Final auto nudge |

After step 4 sends (or if a step fails permanently), set halt/flag `follow_up_exhausted` and **stop**. Staff must act or close as `unresponsive`.

If step 1’s fire time would be **after 21:00 or before 09:00** Casablanca, delay that send to the next 09:00. Later steps use the same quiet hours.

Quiet hours apply to **automatic** follow-ups only. Reminders and staff messages are not delayed (reminders are tied to appointment time).

### What is sent

Short, clinic-branded, non-medical. Invite a reply or a booking.

- Inside 24h window: session text generated from a **fixed clinic-language template** (not a free-form LLM essay). Optional: LLM may fill clinic name + first name only. Prefer a stored sentence in knowledge `follow_up_text` with a default:

  FR default: « Bonjour, nous revenons vers vous concernant votre demande. Souhaitez-vous réserver une consultation à la clinique ? »

- Outside 24h window: WhatsApp template `follow_up_nudge`

`sender_type = system`. Increment follow-up counts when `sent_at` is set.

### Cancellation

Cancel pending stall follow-ups when:

- inquiry is booked
- inquiry is closed
- inquiry is disqualified
- staff takeover (pause; see Conversations)
- patient replies (reschedule from new activity — a reply is not a cancel of the *sequence*, it resets the timer)

### Recovered inquiry (definition)

An inquiry is **recovered** if:

1. At least one follow-up row has `sent_at` not null, **and**
2. The inquiry later reaches `booked_at` not null

(Manual follow-ups count the same as automatic.)

## Missed-call recovery

There is **no** phone integration and **no** voice AI.

The front desk (or owner) logs that a call was missed. Selaren turns that into a WhatsApp inquiry so the lead is not lost.

### Staff action

Required:

- `phone` (E.164; Moroccan numbers normalized from `0XXXXXXXXX` → `+212...`)

Optional:

- `name`
- `called_at` (default now)
- `notes`

### System behavior

1. Normalize phone. Reject if invalid.
2. Upsert contact; set name if provided and contact name empty.
3. If conversation missing, create it. Default `mode = ai` if clinic `active`.
4. Insert `missed_calls` row.
5. If contact has `open` or `booked` inquiry → attach missed call to it. If `booked`, do **not** send a “we missed you” sales pitch; notify staff in-thread instead (system note, no patient message, or a short “we tried to call you back” only if staff checks “notify patient”).
6. If no open/booked inquiry → create inquiry `source = missed_call`, `status = open`.
7. For a new or open unbooked inquiry: send recovery WhatsApp immediately.

### Recovery message

Purpose: acknowledge the missed call and restart the conversion loop.

FR default: « Bonjour, nous avons manqué votre appel à la clinique. Comment pouvons-nous vous aider ? Vous pouvez répondre ici pour une question ou pour réserver une consultation. »

- Inside 24h window (unusual for a cold number): session text
- Outside 24h (typical): template `missed_call_recovery`

This outbound sets `first_response_at` if it was null.

### After the patient replies

Normal conversation + qualification + booking. Source remains `missed_call` on that inquiry.

### What this is not

- No click-to-call
- No call recording
- No IVR
- No automatic detection of missed calls from a PBX
- No SMS fallback if WhatsApp fails — mark failed, **Needs staff**, staff can phone back outside Selaren
