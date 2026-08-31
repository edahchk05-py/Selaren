# Selaren — Product overview

Internal product document. Not a pitch deck. Distinguishes **what exists today** from what might exist later.

## Thesis

Premium private dental clinics in Casablanca and Marrakech already buy demand (ads, Google, Instagram, website, reputation). They lose it after the inquiry: slow WhatsApp, forgotten threads, weak qualification, no follow-up, inconsistent booking, unrecovered missed calls.

Selaren is a **patient-demand conversion system**. It does one job: turn inquiries into deposited, attended consultations.

Tagline: **Turn every inquiry into an appointment.**

It is not a chatbot product. AI is an invisible speed layer with hard guardrails.

## Customer

Primary: premium private dental clinics in **Casablanca and Marrakech** with meaningful inbound volume, WhatsApp as the patient channel, a front desk, and high-value consults (implants, veneers, aligners, orthodontics, aesthetic).

Not: every dentist, multi-country chains, public hospitals, or clinics that need a PMS.

## Problem

Leakage after the inquiry. Staff cannot see what needs attention. Owners cannot see conversion.

## Solution (current MVP)

One clinic workspace. WhatsApp Cloud API in, French UI out.

Loop: **Inquiry → Response → Qualification → Appointment → Deposit (tracked) → Show-up.**

Supporting: stall follow-ups, T−24h / T−2h reminders, missed-call log → WhatsApp, operator-led onboarding, pause, human takeover.

## Roles

Exactly three: Selaren operator, clinic owner, clinic staff (accueil). No patient login. No dentist role.

## High-level architecture

Next.js + PostgreSQL. Meta WhatsApp webhooks. OpenAI for JSON replies (server-side guardrails). Background worker for outbox, follow-ups, reminders. WhatsApp tokens encrypted at rest. Tenant isolation by `clinic_id`. Details: `docs/ARCHITECTURE.md`.

## MVP scope (locked)

WhatsApp only. One clinic calendar. Deposit **tracking**, not collection. Missed calls logged by staff, not a PBX. Cities: Casablanca, Marrakech. Locale: French. Operator-led setup.

## Current limitations

- Meta templates required outside the 24-hour window (or session-only pilot, which is incomplete).
- No object storage beyond local media in development.
- Overlap exclusion index may not apply on Postgres 18; app still checks slots.
- Hosting for a real 14-day pilot must stay awake (app + database + worker + public HTTPS for Meta).
- Estimated revenue is not accounting.

## North Star

**Deposited consultations generated through Selaren** (acompte marked on the appointment).

## Business model (company, not in-product)

Manual invoicing. Typical range discussed: setup 8,000–15,000 MAD; monthly 3,500–8,000 MAD. 14-day in-person pilots. **Not implemented in software.**

## Pilot model

Operator on-sites a clinic, completes checklist, activates, tests on a Meta test number, then the clinic’s live WhatsApp. See `docs/PILOT.md`.

## Future expansion (not built, do not confuse with MVP)

Other cities or countries, Instagram as a channel, payment collection, PMS/calendar sync, multi-practitioner scheduling, self-serve signup, SaaS billing. None of this is in the product today.
