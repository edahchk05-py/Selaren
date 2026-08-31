# Error states, edge cases, security and privacy

## Error states (product-visible)

Every failed patient-affecting action must leave the inquiry visible. Never delete the lead to “clean up” an error.

| Situation | System behavior | Staff sees |
| --- | --- | --- |
| WhatsApp connection missing / `error` | Inbound cannot route; outbound fails | Clinic-level banner; operator alert |
| Webhook signature invalid | Reject 403; do not process | Nothing (security) |
| Duplicate webhook | Ignore second copy | Single message |
| WhatsApp send failed (4xx/5xx) | `messages.status = failed`; retry 5xx once | Thread + Needs staff |
| Template not approved / rejected | Do not send free-form outside window | Needs staff + reason |
| Outside 24h, AI wanted to reply | Halt `outside_window`; no AI send | Needs staff |
| LLM timeout / error twice | Halt `ai_provider_error`; do not loop | Needs staff |
| Slot taken on confirm | Do not create appointment; halt `booking_conflict`; offer new slots or staff | Clear conflict state |
| Invalid phone on missed call / manual | Reject save | Field error |
| Overlapping staff double-book | Transaction rollback | “Créneau déjà pris” |
| Clinic `paused` | Store inbound; no AI send | Banner; staff can reply |
| Clinic `onboarding` | No AI to real patients | Operator-only live send caution |
| Patient opt-out | `wa_opt_out`; cancel auto follow-ups and reminders | Badge; staff must not blast |
| Media-only inbound | Store media; halt `media_only` | Inbox shows file |
| Unknown `phone_number_id` | Log; drop | Operator log |
| Staff deactivated mid-session | Next request 401/403 | Re-login |
| Last owner deactivation attempted | Reject | Error |

Scheduler errors (follow-up/reminder): retry with backoff; after N failures mark failed and Needs staff. Do not hide the inquiry.

## Edge cases

### Identity and threads

- Same person, two numbers → two contacts. Staff may close one as `duplicate`. Do not auto-merge.
- Two people share a phone → one contact. Staff notes in conversation. No split-thread feature.
- Patient changes WhatsApp username only → same phone, same contact.
- Inbound while staff is typing → both messages persist; AI must not send if `mode = human`.
- Inbound while AI send is in-flight → finish or cancel the in-flight send; do not send two uncoordinated AI replies. Serialize AI per conversation.

### Booking

- Patient says “yes” without choosing among several slots → AI must not pick silently; ask which slot.
- Patient confirms a slot that just disappeared → conflict path.
- Same-day booking after T−24h reminder would have been → skip past reminders.
- Reschedule loop → only the latest `scheduled` row occupies time.
- Cancel after deposit marked → appointment cancelled; deposit fields remain for history; North Star already counted if `deposited_at` in range. Do not auto-unmark.
- Timezone: all offers shown in Casablanca local time. Never mix UTC in patient copy.

### Qualification

- First message is already “I want implants Friday” → may qualify and offer slots in one turn.
- Staff locks qualification; AI later disagrees → AI does not write.
- Disqualified then they say they can travel → staff or (if unlocked) AI may requalify.

### Follow-up and reminders

- Takeover then silence → auto stall follow-up stays paused until release or staff sends a manual follow-up / closes.
- Follow-up send lands in quiet hours → delay to 09:00.
- Reminder at 07:00 for a 09:00 appointment → send (reminders ignore quiet hours).
- Opt-out after booking → skip reminders; staff sees warning on the appointment.

### Missed call

- Log for a number that already booked → attach; do not create a new inquiry; do not send sales recovery by default.
- Log for closed inquiry → **new** inquiry `source = missed_call`.
- WhatsApp send fails → missed_call row still exists; Needs staff to phone back outside the product.

### Multi-clinic

- Operator opens clinic A then B → no data bleed. Tokens and messages stay scoped.
- Same staff email on two clinics → allowed; user picks workspace after login if more than one membership.

### Languages

- Patient writes Darija in Latin script → treat as `ar`/`unknown` and reply in the same style if possible; French is an acceptable fallback if the model cannot hold Darija.
- Staff writes in French to a Darija patient during takeover → allowed (human choice).

## Security and privacy boundaries

### What Selaren stores

Operational conversion data only:

- Phone, optional name, message text, media files, appointment times, qualification labels, deposit **marks** (not card data)

### What Selaren must not store

- Clinical records, diagnoses, odontograms, radiographs as a chart
- National ID / passport images (if a patient sends one, staff should not copy it into knowledge; media is stored as a message attachment only)
- Card numbers, CVV, full payment accounts
- CNSS/CNOPS files
- Passwords in audit logs
- WhatsApp tokens in plaintext

### Roles of parties (MVP legal posture)

Assumption (simplest):

- The **clinic** is the data controller for patient conversations
- **Selaren** is a processor acting on the clinic’s instructions
- Patients are messaged on the **clinic’s** WhatsApp number

Do not implement a full legal center in-app. A written DPA stays offline with the founder.

### Access control

- Enforce `clinic_id` on every query (membership or operator)
- Operators: audit every clinic open
- Encryption at rest for tokens; TLS in transit
- Media URLs must not be world-guessable; authorize via session
- Webhooks: signature required

### Retention (simplest MVP)

- Keep data for the life of the clinic workspace
- Owner may request deletion of a contact (messages, media, inquiries). Honor by deleting or irreversibly anonymizing that contact’s rows
- Operator executes deletion
- No extra “marketing data lake”

### Morocco / CNDP

Do not ship a compliance product. Do:

- Collect minimum data
- Do not use patient threads to train a public model
- Do not send media to the LLM
- Keep hosting access limited to operators

### Medical safety

Selaren is not a medical device and not a records system.

- AI must refuse diagnosis
- Emergencies → halt `medical` and tell the patient to call the clinic or emergency services (knowledge may include the clinic phone)
- No voice triage

### Abuse

- Rate-limit login
- Rate-limit outbound WhatsApp per clinic to stay inside Meta limits; if throttled, queue and surface delay
- Do not build a campaign blaster

### Boundaries vs a PMS / CRM

If a request needs tooth charts, invoicing, stock, or a full contact database unrelated to an inquiry, it is out of scope. Contacts exist only because an inquiry, missed call, or manual lead created them.
