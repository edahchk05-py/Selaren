# Qualification logic

Qualification answers: **is this person a fit to book a consultation at this clinic?**

It does not answer medical suitability. It does not replace the dentist.

AI may **propose** field values. Staff values **win**.

## Record

One `qualifications` row per inquiry.

| Field | Values | Meaning |
| --- | --- | --- |
| `status` | `unevaluated` \| `in_progress` \| `qualified` \| `disqualified` | Roll-up |
| `treatment_id` | optional FK | Matched offered treatment |
| `treatment_label` | string | Raw interest if unmatched |
| `intent` | `unknown` \| `information` \| `book` \| `admin` | Why they wrote |
| `can_attend_clinic` | `unknown` \| `yes` \| `no` | Can they come to this city/clinic |
| `disqualify_reason` | see below | Required if disqualified |
| `notes` | text | Staff/AI short note |
| `locked_by_staff` | boolean | If true, AI must not change fields |
| `updated_at` | timestamp | |

`intent = admin` means existing-patient logistics (confirm time, change slot, invoice question). That is not a new marketing lead; see rules below.

## Status rules

### `unevaluated`

Default at inquiry creation. No fields set beyond defaults (`intent = unknown`, `can_attend_clinic = unknown`).

### `in_progress`

Any signal exists but the inquiry is not yet qualified or disqualified.

### `qualified`

**All** of the following are true:

1. **Treatment interest is known** — `treatment_id` is set **or** `treatment_label` is non-empty and not generic spam. “Implants / veneers / aligners / ortho / aesthetic / other offered treatment / consultation for a high-value treatment” all count. A request for “cleaning only” or “price for toothpaste” does **not** qualify unless the clinic listed that as an offered treatment.
2. **Booking intent** — `intent = book`. The person wants a visit, not only a number in chat.
3. **Can attend** — `can_attend_clinic = yes`. If they never indicated otherwise and they are messaging the local clinic number, AI may set `yes` (assumption: writing to the clinic implies they can come, unless they say they are abroad / wrong city and cannot travel).
4. **Reachable** — contact has a valid E.164 phone (always true for WhatsApp-originated inquiries).
5. **Not disqualified** by a reason below.

High-value vs low-value: prefer mapping to the clinic’s offered treatments. If they want a consult without naming a treatment, store `treatment_label = "consultation"` and qualify **only if** `intent = book` and the clinic’s knowledge allows unnamed consults (default: **yes** — a booked consult is the point).

### `disqualified`

Any of:

| `disqualify_reason` | When |
| --- | --- |
| `no_intent` | Explicitly will not book; information only after being offered a slot and declining |
| `cannot_attend` | Wrong city / cannot travel / not in Morocco |
| `treatment_not_offered` | Wants something the clinic does not offer |
| `spam` | Ads, bots, junk |
| `wrong_number` | Not a patient inquiry |
| `existing_admin_only` | Pure admin on an already booked/deposited visit **and** no new demand (do not count as a new qualified lead) |
| `other` | Staff specified in notes |

Disqualification **closes** the inquiry only if staff confirms close, or if `spam` / `wrong_number` (system may auto-close those two). Other disqualified inquiries stay `open` until staff closes (they might still be nurtured manually). Auto follow-up **stops** when `disqualified`.

## `existing_admin_only`

If the contact already has a `scheduled` or recently `showed` appointment and the message is only “what time is it?” / “running late”:

- Do not create a second inquiry
- Set qualification `disqualified` / `existing_admin_only` **only** if this were a *new* inquiry — which it should not be
- On the existing booked inquiry, do not flip `qualified` off
- AI or staff answers the admin question; do not increment “qualified inquiries” again

## Transitions

```
unevaluated → in_progress → qualified
unevaluated → in_progress → disqualified
unevaluated → qualified          (enough info in the first message)
unevaluated → disqualified       (clear spam)
qualified → disqualified         (staff/AI correction)
disqualified → in_progress|qualified  (staff override or new evidence)
```

Any transition **to** `qualified` sets `inquiries.qualified_at` if it was null. Later disqualification does **not** clear `qualified_at` (funnel: “became qualified” is historical). Dashboard “qualified inquiries” for a cohort = inquiries with `qualified_at` not null, minus `closed_reason = duplicate`.

Staff override with `locked_by_staff = true` freezes AI writes.

## Questions AI should ask (only the missing ones)

Ask the minimum:

1. What treatment or problem are they inquiring about? (if unknown)
2. Would they like to book a consultation? (if `intent` is not `book`)
3. Can they come to the clinic in this city? (only if they suggested they cannot)

Do not interrogate medical history, budget, ID, or insurance.

Budget is **not** a qualification field in MVP. If they volunteer a budget, store it in `notes` only.

## Priority treatments (routing, not a gate)

Categories: implant, veneer, aligner, orthodontics, aesthetic, other.

Inbox may show a “high-value” hint when `treatment.category` is not `other`. This is display-only. It does not change qualification math.
