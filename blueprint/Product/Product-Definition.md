# Product Definition

Selaren is a patient-demand conversion system for premium private dental clinics.

It is not a chatbot, AI receptionist, PMS, EMR, CRM, ERP, or generic AI employee.

## Job of the product

Turn inbound patient inquiries into booked appointments — then deposits and show-ups where the clinic uses them.

**More qualified inquiries → more booked appointments → more revenue.**

## Conversion loop

1. Patient inquiry
2. Response
3. Qualification
4. Appointment
5. Deposit
6. Show-up

## Eventual product capabilities

The product should eventually help a clinic handle:

1. **Inquiry capture**
2. **Instant response**
3. **Conversation**
4. **Qualification**
5. **Appointment booking**
6. **Deposit**
7. **Follow-up**
8. **Reminders**
9. **Performance tracking**

“Eventually” is not a license to build beyond the MVP. The shippable slice is `blueprint/Product/MVP.md` plus the locked specification in `blueprint/Spec/`. Reminders, deposit **tracking**, no-show tracking, and missed-call recovery are in that spec because they complete the conversion loop and approved analytics — they are not a PMS or a new product.

## Product outcome

The clinic should lose fewer high-intent patients after they have already inquired.

## Hard boundaries

Do not build:

- voice AI
- medical records
- CNSS / CNOPS
- odontogram
- accounting
- payroll
- inventory
- full clinic management
- complex CRM
- ERP
- multi-country functionality
- multi-vertical functionality
- autonomous AI agents
- unnecessary AI features
- advanced reporting
- billing infrastructure unless required by the MVP
- anything unrelated to converting inquiries into appointments

## Implementation note

AI-assisted responses are in scope for the MVP. AI is a means. The product is conversion.

Human takeover is required. The system must not be designed as an unattended replacement for the front desk.

## Locked product decisions

Previously open items are specified in `blueprint/Spec/Assumptions.md` and the surrounding spec files. Do not ask the founder to re-decide them during implementation.

Summary: deposits tracked (not collected); internal one-calendar availability; WhatsApp Cloud API; roles `selaren_operator` / `owner` / `staff`; UI French; conversation language follows the patient; qualification rules in `blueprint/Spec/Qualification.md`.
