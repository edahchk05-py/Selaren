# MVP

The first MVP contains **only** the items below.

Do not add features because they are common in SaaS, dental software, or AI products.

## In scope

1. **Clinic account / workspace**
2. **Patient conversation inbox**
3. **WhatsApp integration**
4. **AI-assisted responses**
5. **Clinic-specific knowledge / context**
6. **Human takeover**
7. **Lead qualification**
8. **Appointment availability**
9. **Appointment booking**
10. **Follow-up for unconverted inquiries**
11. **Basic analytics**

## Basic analytics

Analytics should eventually show:

- inquiries
- qualified inquiries
- booked appointments
- deposits
- follow-ups
- no-shows
- conversion rate

The North Star remains deposited consultations generated through Selaren. See `blueprint/Product/North-Star.md`.

Deposits are **tracked only** (staff marks deposited + optional MAD amount). Selaren does not collect payment. See `blueprint/Spec/`.

## Explicitly out of scope for this MVP

- voice AI
- medical records
- CNSS / CNOPS
- odontogram
- accounting, payroll, inventory
- full clinic management
- complex CRM or ERP
- multi-country or multi-vertical support
- autonomous AI agents
- unnecessary AI features
- advanced reporting
- billing infrastructure unless required to run the MVP
- aesthetic/dermatology or other future verticals
- anything unrelated to converting inquiries into appointments

## Locked for implementation

Open product decisions are resolved in `blueprint/Spec/` (especially `Assumptions.md`). Do not reopen them during build.

Pilot commercial terms and exact MAD prices stay **outside the product** (manual founder invoicing). No billing infrastructure.

No-shows, deposit tracking, WhatsApp reminders, and missed-call recovery (log + WhatsApp, no voice) are specified because they complete the approved conversion loop and analytics list.

## Build rules

- Implement only what `blueprint/Spec/` defines.
- Do not add modules, pages, or automations beyond that spec.
- Do not start implementation until the founder asks to implement.
- Cursor must not invent extra features around this list.
