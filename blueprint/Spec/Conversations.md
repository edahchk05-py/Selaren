# WhatsApp conversations, AI behavior, and human takeover

One conversation per contact per clinic. The inbox is this conversation list.

## Conversation lifecycle

```
created (on first message or missed-call/manual open)
  mode: ai | human
  status: open | closed
```

| Event | Effect |
| --- | --- |
| Inbound WhatsApp | Append inbound message. `status = open`. Unread + 1. |
| Outbound (AI, staff, system) | Append outbound. Reset unread if staff is viewing (UI later). |
| Staff takeover | `mode = human`. Cancel in-flight AI send. Pause auto follow-ups of kind `stall`. |
| Staff release to AI | `mode = ai`. AI may reply to the latest patient intent on next inbound, or immediately if the last message is inbound and unanswered. |
| Inquiry closed and no scheduled appointment | Conversation `status` may stay `open` (history remains). New inbound after a closed inquiry creates a **new inquiry** on the **same conversation**. |
| Clinic paused / onboarding | Force no AI sends to real patients. `mode` behaves as human for sending. |

Do not delete conversations. They are the inbox history.

## Message model

Each message has:

- `direction`: `inbound` \| `outbound`
- `sender_type`: `patient` \| `ai` \| `staff` \| `system`
- `body` (text; empty only if media-only inbound)
- `media_url` / `media_type` optional (`image` \| `audio` \| `document` \| `other`)
- `template_name` if sent as a template
- `wa_message_id` (idempotency key)
- `status`: `queued` \| `sent` \| `delivered` \| `read` \| `failed`
- `staff_user_id` when `sender_type = staff`

Inbound webhook retries must upsert on `wa_message_id` and not duplicate inquiries.

### 24-hour customer care window

Meta rule: free-form replies are allowed for 24 hours after the last **patient** message (`last_patient_message_at`).

| Situation | Channel |
| --- | --- |
| Inside 24h window | Session message (free-form text) |
| Outside 24h window | Approved **template** only |

If a send is required outside the window and the template is missing/rejected, mark the send `failed`, surface **Needs staff**, do not silently drop the inquiry.

System sends that must work outside the window: missed-call recovery, stall follow-ups, appointment confirmation (if outside window), reminders.

## Inbox behavior (product rules, not UI chrome)

Staff must be able to:

- See all conversations for their clinic
- Open a thread with full message history
- See mode (AI / human), inquiry stage, qualification, next appointment
- Send a reply (implies takeover if still `ai` — sending as staff **sets `mode = human`**)
- Take over without sending
- Release to AI
- Filter: needs staff, unread, unbooked, qualified, booked

Unread = inbound after last staff view of that thread. AI sends do not clear unread.

## AI conversation behavior

AI is an implementation tool for **speed and consistency**. It is not the product.

### When AI may send

All of the following:

- Clinic `status = active`
- Conversation `mode = ai`
- No unresolved halt (see below)
- Destination is not blocked
- Message passes guardrails
- Inside 24h window **or** the content maps to an approved template (MVP AI auto-send is **session-only**; AI does not pick templates). Templates are for system/staff jobs.

If the window is closed, AI **must not** free-form auto-send. Set halt `outside_window` and **Needs staff** (staff can send a template).

### What AI is allowed to do

- Greet and acknowledge the inquiry immediately
- Answer from **this clinic’s** knowledge, treatments, hours, and **real open slots**
- Ask qualification questions (treatment interest, intent to book a consult, ability to come to the clinic)
- Offer 1–3 concrete available slots
- Confirm a booking **only after** the patient clearly accepts a specific slot that is still free
- Say that a human will continue if the patient asks
- Stay in the patient’s language (French or Darija). If mixed, follow the latest patient message.

### What AI must never do

- Invent prices, promotions, clinical outcomes, or availability
- Give medical diagnosis, interpret X-rays/photos, or recommend stopping treatment
- Promise a specific dentist, guarantee results, or quote insurance/CNSS/CNOPS coverage
- Collect card numbers, ID scans, or medical history forms
- Book a slot that is not free
- Continue after takeover
- Speak as if it is a doctor or “the clinic’s AI receptionist”
- Mention Selaren to the patient unless knowledge says to (default: do not)

Self-identification if asked who is writing: the clinic’s team (front desk). Do not brand as an autonomous agent.

### Turn structure (logical)

On each inbound (when AI may send):

1. Load clinic knowledge, treatments, hours, open slots (next 14 days), inquiry + qualification, last 20 messages.
2. Classify: greeting, treatment question, price, booking, reschedule, cancel, human request, medical, spam, existing appointment admin, other.
3. Update qualification proposal.
4. Decide action: reply, reply+book, halt, or no-op (if already answered / duplicate).
5. If booking: create appointment in the same transaction as the confirmation message enqueue.
6. Enqueue at most **one** outbound message per inbound (no multi-message spam). Exception: confirmation may be the single message that includes the slot.

First response target: **as soon as the webhook is processed**. This is the response-time metric.

### Halt conditions (AI stops, Needs staff)

Set `conversations.ai_halt_reason` and `mode` stays `ai` but sends are blocked until staff take over or clears the halt.

| Reason | Trigger |
| --- | --- |
| `patient_requests_human` | Patient asks for a person, secretary, doctor, or callback |
| `medical` | Pain emergency, swelling, bleeding, post-op complication, diagnosis request |
| `missing_price` | Patient asks a price not in knowledge/treatments |
| `outside_window` | Need to reply, window closed |
| `booking_conflict` | Slot taken during confirm |
| `angry_or_complaint` | Clear anger, legal threat, refund fight |
| `low_confidence` | Model cannot stay inside knowledge |
| `ai_provider_error` | LLM or WhatsApp send failed twice |
| `media_only` | Inbound is image/audio with no usable text (staff must read/listen) |

Staff takeover clears `ai_halt_reason`. Release to AI is allowed after staff handled the halt.

### Prices

If knowledge/treatment contains a range or “from X MAD”, AI may repeat that wording and still push a consultation.

If no figure exists: do not invent. Offer to book a consult or halt `missing_price` if the patient insists on a number.

## Human takeover

Takeover is a **first-class** control, not an afterthought.

### Enter takeover

Any of:

- Staff clicks takeover
- Staff sends a message (automatic)
- Operator support send (automatic)

Effects:

- `mode = human`
- Clear `ai_halt_reason` or keep it for history; either way AI must not send
- Cancel queued AI drafts
- Pause automatic **stall** follow-ups (the human is on it)
- Reminders and booking confirmations **still send** (transactional)

### During takeover

- Only staff/operator/system-template messages go out
- Staff can still use **suggested replies** (optional): AI may **draft** a reply that is **not sent** until staff accepts. This draft is assistance, not autonomy. If drafts are not built in v1, that is acceptable; live sending by AI must stay off.
- Qualification and booking remain available to staff

### Release to AI

Staff explicitly releases.

- `mode = ai`
- Stall follow-ups resume using the existing cadence (do not restart at step 1 if steps already sent)
- If last message is inbound and unanswered, AI may reply immediately

### Who the patient sees

All outbound WhatsApp messages come from the **clinic’s WhatsApp number**. There is no separate “bot number.”

## System messages

`sender_type = system` is used for:

- missed-call recovery text/template
- stall follow-ups
- appointment confirmation
- reminders
- cancellation notice to the patient

System messages are not “AI.” They do not count as AI activity metrics (we do not track AI message volume as a success metric anyway).
