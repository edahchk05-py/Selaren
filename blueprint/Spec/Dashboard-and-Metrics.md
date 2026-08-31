# Dashboard and metrics

Basic analytics only. No cohorts builder, no funnels editor, no CSV warehouse, no AI-message charts.

The dashboard exists to prove **financial conversion value** for a clinic (and for the founder during a ~14-day pilot).

## Time and scope

- Timezone: `Africa/Casablanca`
- One clinic at a time (the signed-in workspace)
- Operator may pick a clinic
- Default range: **last 14 days** inclusive, ending today
- Also required: today, last 7 days, last 30 days, custom start/end dates (dates only)

Two complementary views. Both are required.

### A. Inquiry cohort (funnel)

All inquiries with `created_at` in range, excluding `closed_reason = duplicate`.

This is the conversion funnel.

### B. Appointment operations

All appointments whose `start_at` falls in range, excluding `status = rescheduled` (count the surviving appointment only). Cancelled appointments in range are listed separately, not as no-shows.

This is how no-shows and today’s list stay honest.

## North Star

**Deposited consultations generated through Selaren**

```
north_star = count of appointments where
  deposit_status = deposited
  AND deposited_at is in the selected range
  AND inquiry_id is not null
```

Use `deposited_at` (not appointment start) so the North Star is “generated” in the period they paid the deposit. If `deposited_at` is null but status is deposited, fall back to `updated_at` of the mark.

Every deposited appointment in MVP is “through Selaren” because booking happens in Selaren.

## Dashboard tiles (required)

Display integer counts and the rates below. No other tiles.

From **inquiry cohort (A)** unless noted:

| Tile | Formula |
| --- | --- |
| Inquiries | `count(inquiries)` |
| Qualified inquiries | `count(qualified_at is not null)` |
| Booked appointments | `count(booked_at is not null)` |
| Deposits | `count` of those inquiries that have any related appointment `deposit_status = deposited` |
| Follow-ups | `count` of `follow_ups` with `sent_at` in range (operational count; not cohort-bound) **plus** show cohort: inquiries that received ≥1 follow-up |
| No-shows | From **view B**: `count(attendance = no_show)` |
| Outcome pending | From **view B**: derived outcome pending |
| Conversion rate | `booked / inquiries` if inquiries > 0, else 0 |
| Qualified inquiry rate | `qualified / inquiries` |
| Booking rate | `booked / qualified` if qualified > 0, else `booked / inquiries` |
| Deposit rate | `deposited / booked` if booked > 0, else 0 |
| Show-up rate | From **view B**: `showed / (showed + no_show)` if denominator > 0, else null (do not treat pending as no-show) |
| Median first response time | Median of `(first_response_at − created_at)` for inquiries with `first_response_at` set, in minutes |
| Recovered inquiries | Cohort inquiries that are recovered (follow-up sent **and** `booked_at` set) |
| Estimated revenue generated | Sum of `estimated_value_mad` on appointments with `deposit_status = deposited` and `deposited_at` in range. Missing value → clinic default. |

Also show the North Star number prominently (same as Deposits by `deposited_at` in range — keep one definition: the North Star formula above).

## Response time rules

- Clock starts at `inquiries.created_at`
- Clock stops at `first_response_at` (first outbound AI, staff, or system)
- If never responded, **exclude** from the median; show a secondary count: “unanswered”
- Do not average; use **median**

## What must not appear

- AI message count
- Tokens
- Chatbot engagement time
- Staff login time
- Graphs beyond a simple optional bar of the funnel counts (allowed: five numbers in a row). No extra report pages.

## Pilot review (same formulas)

A 14-day pilot review uses default range last 14 days and the tiles above. Success is movement in bookings, deposits, recovered inquiries, response time, and estimated revenue — not AI activity.

## Estimated revenue caveats

This is an **estimate**, labeled as such. It is not accounting. It uses clinic-declared values, not invoices.
