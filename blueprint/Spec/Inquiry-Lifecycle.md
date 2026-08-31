# Patient inquiry lifecycle

An **inquiry** is one demand cycle: a person reached the clinic and might become a deposited, attended consultation.

Selaren’s job is to move inquiries through the conversion loop — not to keep a permanent medical or CRM dossier.

## Identity

- A **contact** is a person at a clinic, keyed by `phone_e164`.
- A contact has **at most one `open` inquiry** at a time.
- A contact has **at most one conversation** (inbox thread) at a time.

New inbound WhatsApp on an existing open inquiry continues that inquiry. It does not create a second funnel entry.

## Sources

| `source` | When |
| --- | --- |
| `whatsapp` | Inbound WhatsApp message creates or continues an inquiry. Default. |
| `missed_call` | Staff logs a missed call and a recovery WhatsApp is sent. |
| `manual` | Staff/owner/operator creates an inquiry (walk-in interest, Instagram lead who gave a number, etc.). |

There is no native Instagram or website source in MVP. Those demand paths enter as `whatsapp` or `manual`.

## Inquiry fields (logical)

- `status`: `open` \| `booked` \| `closed`
- `closed_reason`: `unresponsive` \| `not_interested` \| `spam` \| `duplicate` \| `other` (only if closed)
- `source`
- `first_response_at` — first outbound message (AI, staff, or system template)
- `qualified_at`
- `booked_at`
- `estimated_value_mad` — snapshot used for revenue estimates; set when treatment is known or from clinic default at qualification/booking
- timestamps: `created_at`, `updated_at`

Qualification, appointment, follow-ups, and missed-call rows **hang off** the inquiry. They are not parallel funnels.

## Status machine

```
open
  ├─(appointment created)→ booked
  └─(staff/system close)→ closed

booked
  ├─(appointment cancelled and no other scheduled)→ open
  └─(staff close after completion/loss)→ closed

closed
  └─(new inbound or missed-call log)→ open  [new inquiry row]
```

`booked` means there is a `scheduled` appointment. Deposit and attendance live on the **appointment**, not as extra inquiry statuses.

Closing a `booked` inquiry that still has a future `scheduled` appointment is not allowed. Cancel or complete the appointment first.

## How an inquiry is created

### WhatsApp

1. Inbound message arrives.
2. Resolve clinic from WhatsApp `phone_number_id`.
3. If clinic is unknown → reject/log, no inquiry.
4. Upsert contact by clinic + E.164 phone.
5. If conversation missing, create it (`mode = ai` if clinic `active`, else `human`).
6. Append message.
7. If contact has an `open` or `booked` inquiry → attach to it.
8. Else create inquiry `source = whatsapp`, `status = open`, qualification `unevaluated`.

### Missed call

See [Follow-Up-and-Missed-Calls.md](./Follow-Up-and-Missed-Calls.md). Creates or reopens via a **new** inquiry if the previous one is `closed`; if `open`/`booked`, attaches to the existing one and records the missed call.

### Manual

Staff enters phone (required), name optional, note optional. Same upsert rules. Opening message is not auto-sent unless the creator chooses “send WhatsApp now” (allowed). If no message is sent, `first_response_at` stays null until an outbound exists.

## Stage for inbox (derived, not a stored mega-status)

Use these labels in the inbox. Derive them; do not invent a second source of truth.

| Label | Rule |
| --- | --- |
| New | `open` and `first_response_at` is null |
| Waiting on patient | `open`, first response sent, last message is outbound |
| Waiting on clinic | `open` or `booked`, last message is inbound, or `mode = human` |
| Qualifying | `open` and qualification `in_progress` |
| Qualified | `open` and qualification `qualified` and no scheduled appointment |
| Follow-up | `open` and a follow-up is scheduled or was sent and still unbooked |
| Booked | `status = booked` |
| Deposit pending | booked, appointment `deposit_status = none`, clinic `deposit_typically_required = true` |
| Deposited | booked, `deposit_status = deposited` |
| Outcome pending | appointment start + 24h passed, `attendance = pending` |
| No-show | `attendance = no_show` |
| Showed | `attendance = showed` |
| Closed | `status = closed` |
| Needs staff | AI halted, takeover, or follow-up sequence exhausted |

An inquiry can match more than one label. Inbox default sort: **Needs staff / Waiting on clinic first**, then newest inbound.

## Terminal outcomes (for metrics)

Counted from the inquiry cohort (see [Dashboard-and-Metrics.md](./Dashboard-and-Metrics.md)):

| Outcome | Definition |
| --- | --- |
| Still open | `status = open` |
| Booked | ever had `booked_at` set, or currently booked |
| Deposited | related appointment `deposit_status = deposited` |
| Showed | related appointment `attendance = showed` |
| No-show | related appointment `attendance = no_show` |
| Closed lost | `closed` with reason other than `duplicate` |
| Duplicate | `closed_reason = duplicate` — excluded from funnel denominators |

## What staff can do at any time

- Override qualification
- Take over the conversation
- Book, reschedule, cancel
- Mark deposit / attendance
- Close with a reason
- Log a missed call

## What the system can do without staff

- Create inquiry from WhatsApp
- Set `first_response_at`
- Propose/update qualification (until staff locks/overrides)
- Auto-send AI replies if `mode = ai` and clinic `active` and no halt
- Schedule/send follow-ups and reminders
- Reopen-by-new-inquiry on inbound after `closed`
