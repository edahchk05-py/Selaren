# North Star

## Primary North Star

**Deposited consultations generated through Selaren.**

This is the metric the company exists to move.

## Supporting metrics

- inquiry response time
- qualified inquiry rate
- booking rate
- deposit rate
- show-up rate
- recovered inquiries
- estimated revenue generated

## What these mean operationally

| Metric | Question it answers |
| --- | --- |
| Response time | How fast does the clinic engage after an inquiry? |
| Qualified inquiry rate | Of inquiries, how many are actually fit to book? |
| Booking rate | Of qualified (or total) inquiries, how many become appointments? |
| Deposit rate | Of bookings, how many leave a deposit? |
| Show-up rate | Of booked / deposited consultations, how many attend? |
| Recovered inquiries | How many would have been missed or left unconverted without follow-up? |
| Estimated revenue generated | What is the financial value of converted demand? |

Exact formulas, denominators, timezone, and “through Selaren” are fixed in `blueprint/Spec/Dashboard-and-Metrics.md`.

## What not to optimize

Do not optimize for:

- number of AI messages
- chatbot conversation count
- time spent in the product
- vanity AI demos
- feature volume

Activity is not the outcome. Deposited consultations are.

## Pilot measurement

A 14-day pilot should measure at least:

- response time
- inquiries
- qualified inquiries
- appointments
- deposits
- follow-ups
- conversion

The objective is to prove measurable financial value, not to prove that AI can reply.

## Analytics constraint

Basic analytics should serve this North Star and its supporting metrics.

Do not build advanced reporting.
