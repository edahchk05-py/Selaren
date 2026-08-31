# Selaren MVP — Product Specification

This folder is the **implementation-ready product specification** for the first Selaren MVP.

It is subordinate to the company blueprint. If a later sentence here conflicts with `blueprint/Company/` or the hard “do not build” list, the blueprint wins.

Do not implement the application from this folder until the founder asks to build. This specification exists so an engineer can build **without guessing**.

## What this MVP is

A patient-demand conversion system for **one clinic workspace at a time**, used by premium private dental clinics in **Casablanca and Marrakech**.

It captures inbound demand (primarily WhatsApp), responds, qualifies, books a consultation, tracks deposit and attendance, follows up unconverted inquiries, recovers missed calls, reminds booked patients, and measures conversion.

It is not a chatbot product, AI receptionist, PMS, EMR, CRM, ERP, or payment system.

## Conversion loop (product spine)

```
Inquiry → Response → Qualification → Appointment → Deposit → Show-up
```

Every feature in this spec exists to move an inquiry along that loop or to measure it.

## Document map

| Topic | File |
| --- | --- |
| Locked MVP assumptions | [Assumptions.md](./Assumptions.md) |
| User roles, permissions | [Roles-and-Permissions.md](./Roles-and-Permissions.md) |
| Clinic onboarding | [Onboarding.md](./Onboarding.md) |
| Patient inquiry lifecycle | [Inquiry-Lifecycle.md](./Inquiry-Lifecycle.md) |
| WhatsApp conversation lifecycle, AI behavior, human takeover | [Conversations.md](./Conversations.md) |
| Qualification logic | [Qualification.md](./Qualification.md) |
| Availability, booking, deposits, reminders, no-shows | [Appointments.md](./Appointments.md) |
| Follow-up and missed-call recovery | [Follow-Up-and-Missed-Calls.md](./Follow-Up-and-Missed-Calls.md) |
| Dashboard and metric formulas | [Dashboard-and-Metrics.md](./Dashboard-and-Metrics.md) |
| Entities, relationships, constraints | [Data-Model.md](./Data-Model.md) |
| Required integrations | [Integrations.md](./Integrations.md) |
| Error states, edge cases, security/privacy | [Errors-Edge-Cases-Security.md](./Errors-Edge-Cases-Security.md) |
| MVP acceptance criteria | [Acceptance-Criteria.md](./Acceptance-Criteria.md) |

## In scope (MVP)

1. Clinic account / workspace
2. Patient conversation inbox
3. WhatsApp integration
4. AI-assisted responses
5. Clinic-specific knowledge / context
6. Human takeover
7. Lead qualification
8. Appointment availability
9. Appointment booking
10. Follow-up for unconverted inquiries
11. Basic analytics
12. Deposit **tracking** (not collection)
13. No-show tracking
14. Appointment reminders (WhatsApp)
15. Missed-call recovery (log + WhatsApp; no voice AI)

Items 12–15 are required to complete the approved conversion loop and the approved analytics list. They are not a new product category.

## Out of scope (do not specify or build)

- Voice AI, call recording, or a phone PBX
- Medical records, odontogram, CNSS/CNOPS
- Accounting, payroll, inventory, clinic operations
- Payment collection / payment gateway / SaaS billing
- Native Instagram, website-chat, SMS, or email channels
- Google Calendar or any external calendar sync
- Multi-practitioner / multi-location scheduling
- Multi-country or multi-vertical product
- Patient login or patient-facing web app
- Autonomous agents, extra AI features, advanced reporting
- Self-serve clinic signup / public pricing page

## How to implement from this spec

1. Treat enums, state machines, and metric formulas as contract.
2. Do not add entities, roles, channels, or automations that are not named here.
3. Assumptions are listed in [Assumptions.md](./Assumptions.md). Do not reopen them during implementation.
4. UI is not specified here. Screens come in a later phase.
