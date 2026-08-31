# Appointments: availability, booking, deposits, reminders, no-shows

The only schedulable object in MVP is a **consultation appointment** on **one clinic calendar**.

No rooms, no practitioners, no chair management, no treatment-plan scheduling.

## Availability

### Working hours

Per weekday: `enabled`, `start_time`, `end_time` (local `Africa/Casablanca`).

If `enabled = false`, that weekday has no slots.

### Slot generation

- Length = `clinics.default_slot_minutes` (default 30, allowed 15–60).
- Slots are contiguous from `start_time` to `end_time` (a slot must **finish** by `end_time`).
- Generated on the fly for a window of **the next 14 days** when offering times. Do not pre-materialize years of rows.

### Exceptions

`availability_exceptions`:

- `kind = blocked` — no slots overlap `[start_at, end_at)`
- `kind = extra` is **not used** in MVP (do not implement extra hours). Include the column only if it keeps the model simple; otherwise omit. **MVP: blocked only.**

### Occupied time

A slot is unavailable if it overlaps any appointment with `status = scheduled`.

Cancelled and rescheduled-away rows do not occupy time.

### Offering slots

AI and staff see the same free-slot API:

- Input: now, clinic, optional day
- Output: up to the next 12 free slots over 14 days, skipping the past and skipping “starts in less than 15 minutes” unless staff overrides

Staff may book any free slot, including same-day if it starts ≥ 15 minutes from now.

## Booking flow

```
free slot selected
  → appointment row status=scheduled, attendance=pending, deposit_status=none
  → inquiry.status=booked, booked_at=now
  → snapshot inquiry.estimated_value_mad from treatment or clinic default
  → enqueue confirmation message
  → schedule reminders T−24h and T−2h
  → cancel pending stall follow-ups
```

### Who can book

- Staff / owner / operator: pick contact + slot (+ optional note)
- AI: only after the patient accepts a **specific** offered slot

### Confirmation message (system)

Must include: clinic name, date, local time, and that they should reply if they need to change.

Use session text if inside 24h; otherwise template `appointment_confirmation`.

### Constraints

- One `scheduled` appointment per contact per clinic at a time
- Double-book prevention: transactional check + unique exclusion on `scheduled` appointments overlapping the same clinic time (see Data-Model)
- Cannot book if clinic is `onboarding` (test bookings allowed only for a flagged test contact — skip in v1; simply allow operator to book during onboarding)

### Reschedule

1. Patient or staff requests a new slot
2. New appointment created `scheduled`
3. Old appointment `status = rescheduled`, `superseded_by_appointment_id` set
4. Inquiry stays `booked`; `booked_at` unchanged
5. Cancel old reminders; schedule new ones
6. Send confirmation for the new slot

Deposit on the old row copies to the new row if already `deposited`.

### Cancel

- `status = cancelled`
- Inquiry returns to `open` if no other `scheduled` appointment
- Cancel reminders
- Send cancellation notice if the patient was already confirmed (session or template `appointment_cancelled`)
- Staff should set a note. Optional close of inquiry is a separate action.

## Deposits (track only)

Selaren does **not** take payment.

Staff marks on the **current scheduled** (or already completed) appointment:

- `deposit_status`: `none` \| `deposited`
- `deposit_amount_mad` optional
- `deposited_at` set when marked deposited
- `marked_by_user_id`

Unmarking is allowed (mistake). Audit both.

If `clinics.deposit_typically_required = true`, AI/staff copy may say a deposit is expected **using knowledge/policies text only**. AI must not collect payment details.

North Star counts appointments with `deposit_status = deposited` attributed through a Selaren inquiry.

## Reminders

For each `scheduled` appointment, create two `reminders`:

| `kind` | `scheduled_at` |
| --- | --- |
| `t24h` | `start_at − 24 hours` |
| `t2h` | `start_at − 2 hours` |

Rules:

- If `scheduled_at` is already in the past when the appointment is created (same-day booking), skip that reminder.
- Send via WhatsApp: session message if window open, else template `appointment_reminder`.
- Do not send if appointment is no longer `scheduled` at send time.
- Do not send if contact opted out (WhatsApp stop). Mark `failed` / skipped `opt_out`.
- Takeover does **not** cancel reminders.
- After send, store `sent_at` and `message_id`.

No reminder SMS, email, or voice.

## Attendance and no-shows

`attendance` on the appointment:

| Value | Who sets | Meaning |
| --- | --- | --- |
| `pending` | default | Not yet known |
| `showed` | staff/owner/operator | Patient attended |
| `no_show` | staff/owner/operator | Did not attend |

`outcome_pending` is **derived**: `status = scheduled` AND `attendance = pending` AND `now >= start_at + 24 hours`.

The system **never** auto-sets `no_show`. Unmarked visits appear on the dashboard as outcome pending so the front desk can close them.

When `showed` or `no_show` is set, appointment `status` stays `scheduled` (it happened as a planned visit). Do not invent a `completed` status.

Staff may still cancel a future appointment; they must not mark no-show before `start_at`.

## Inquiry after the visit

Staff may `close` the inquiry after the visit (`other` or leave it booked for a short period). For funnel metrics, show-up/no-show is read from the appointment, not from inquiry close.

If the patient writes again later about a **new** treatment after close, a new inquiry is created on the same conversation.
