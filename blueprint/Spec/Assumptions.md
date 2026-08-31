# Locked MVP assumptions

The founder approved proceeding from the blueprint without further discovery. The items below were previously open. They are now **locked for the MVP**.

If an engineer needs a choice that is still not listed, take the simplest option that serves the conversion loop and add it to this file. Do not invent adjacent products.

## Commercial (not in the product)

| Decision | Assumption |
| --- | --- |
| Setup and monthly price | Invoiced **manually** by the founder. Ranges stay 8,000–15,000 MAD setup and 3,500–8,000 MAD / month. No in-app billing. |
| Pilot commercial terms | **Outside the product.** Founder agrees terms with the clinic. The app does not encode paid vs complimentary pilots. |
| SaaS billing infrastructure | **Not built.** |

## Product

| Decision | Assumption |
| --- | --- |
| Deposits | **Tracked only.** Staff marks an appointment as deposited and may enter an amount in MAD. Selaren does not collect money. |
| Qualification | Structured rules in [Qualification.md](./Qualification.md). AI proposes; staff can override. |
| Availability source | **Internal calendar only.** One shared consultation calendar per clinic. No Google Calendar. No per-dentist calendars. |
| No-shows | **In MVP.** Staff marks showed / no-show. Unmarked appointments become `outcome_pending` 24 hours after start. They are **not** auto-counted as no-shows. |
| WhatsApp provider | **Meta WhatsApp Cloud API**. |
| LLM provider | One hosted chat model API (implementation may choose the vendor). Used only to draft/send conversation replies inside guardrails. |
| Languages | **App UI: French.** Conversations: reply in the patient’s language (French or Darija). Knowledge may be written in French and/or Darija. |
| Roles | `selaren_operator`, clinic `owner`, clinic `staff`. No dentist role, no patient login. |
| Auth | Email + password. Session required. No SSO, no magic-link-only. |
| Timezone | `Africa/Casablanca` for every clinic. |
| Currency | MAD. |
| Country | Morocco only. `country_code = MA`. |
| Cities | `casablanca` or `marrakech` on the clinic record. |
| Inquiry identity | One **open** inquiry per contact per clinic. Contact unique key is E.164 phone. |
| “Through Selaren” | Any inquiry stored in that clinic workspace, regardless of whether AI or a human sent the messages. |
| AI sending | AI **may auto-send** within guardrails until takeover, halt, or booking confirmation. This is assisted conversion, not an autonomous agent. |
| After-hours | AI and staff may reply at any hour. Bookings are only offered on future open slots. |
| Slot length | Default **30 minutes**. Clinic-configurable, 15–60 minutes, one value per clinic. |
| Reminders | WhatsApp at **T−24h** and **T−2h**. |
| Follow-up cadence | 2 hours → 24 hours → 72 hours → 7 days, then stop and flag for staff. |
| Missed calls | Staff logs the call. System creates/reopens an inquiry and sends a WhatsApp recovery message. No telephony integration. |
| Media | Inbound images/audio are stored and shown in the inbox. AI does **not** transcribe audio or diagnose from photos. |
| Estimated revenue | Sum of `estimated_value_mad` on **deposited** appointments in the reporting cohort. Default value comes from clinic or treatment. |

## Implementation details (locked for build)

| Decision | Assumption |
| --- | --- |
| `users.must_change_password` | Temporary password at onboarding; forced change on first login. |
| `clinics.session_only_pilot` | Operator override when WhatsApp templates are not yet approved (in-window-only). |
| `conversations.needs_ai_reply` | Worker flag to process AI asynchronously after webhook ACK. |
| Password reset | Owner/operator sets a new temporary password in-app. No patient email. SMTP is not required. |
| LLM vendor | OpenAI Chat Completions, JSON object response. Key is environment-level. |
| Media storage | Clinic-scoped files on disk in development (`storage/media`). Authenticated download only. |
| Job runner | PostgreSQL polling worker; optional `POST /api/internal/tick` with `CRON_SECRET`. |

## Explicit non-assumptions

Do not silently add:

- Instagram Graph API
- Website widget
- Multi-clinic users as a marketplace
- Treatment plan / quote PDF builder
- Two-way calendar sync
- Voice
