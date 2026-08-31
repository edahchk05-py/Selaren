# MVP acceptance criteria

The MVP is acceptable when a premium dental clinic in Casablanca or Marrakech can run the conversion loop on real WhatsApp demand and see honest numbers.

UI polish is not a criterion. Completeness of out-of-scope products is a failure.

## A. Workspace and access

- [ ] Operator can create a clinic in `onboarding` with city Casablanca or Marrakech
- [ ] Owner and staff can sign in and only see their clinic
- [ ] Staff cannot edit knowledge, hours, WhatsApp connection, or invite owners
- [ ] Owner can edit knowledge, treatments, hours, exceptions, and invite staff
- [ ] Operator access to a clinic is audited
- [ ] Clinic cannot become `active` without the activation checklist (or documented operator override for templates)
- [ ] Paused clinic: inbound stored, AI does not send

## B. Onboarding

- [ ] Knowledge + ≥1 treatment + hours + owner + WhatsApp can be configured
- [ ] Activation blocked when required pieces are missing

## C. Inquiry capture

- [ ] Inbound WhatsApp creates contact, conversation, and `open` inquiry
- [ ] Second message from the same number does not create a second open inquiry
- [ ] After close, a new inbound creates a **new** inquiry on the same conversation
- [ ] Manual inquiry can be created with a valid phone
- [ ] Duplicate webhooks do not duplicate messages or inquiries

## D. WhatsApp conversation

- [ ] Inbox shows threads with messages in order
- [ ] Inbound media is visible
- [ ] Outbound session send works inside the 24h window
- [ ] Outside the window, free-form AI send is blocked and staff is flagged
- [ ] Templates send for follow-up, reminder, confirmation, missed-call when the window is closed (or failure is visible if template missing)

## E. AI behavior

- [ ] On an `active` clinic, `mode = ai`, inbound text gets at most one auto-reply using clinic knowledge
- [ ] AI does not invent a price that is not in knowledge/treatments
- [ ] AI does not diagnose from photos
- [ ] AI does not book a slot that is not free
- [ ] AI replies in the patient’s language when it is French or Darija
- [ ] Halt conditions in Conversations.md stop further AI sends
- [ ] LLM failure surfaces Needs staff and does not drop the inquiry

## F. Human takeover

- [ ] Staff can take over; AI stops immediately
- [ ] Staff send implies takeover
- [ ] Stall auto follow-ups pause during takeover
- [ ] Reminders still send during takeover
- [ ] Staff can release to AI; AI may reply if the last patient message is unanswered

## G. Qualification

- [ ] New inquiry starts `unevaluated`
- [ ] AI can move to `in_progress` / `qualified` / `disqualified` per rules
- [ ] Staff can override and lock
- [ ] Qualified requires treatment interest, `intent = book`, `can_attend_clinic = yes`
- [ ] Spam/wrong-number can auto-close; other disqualifications do not silently disappear
- [ ] `qualified_at` is set once and remains for funnel math

## H. Availability and booking

- [ ] Free slots match hours minus blocked exceptions minus scheduled appointments
- [ ] Staff can book a free slot; inquiry becomes `booked`
- [ ] AI can book only after an explicit slot acceptance
- [ ] Overlap is rejected
- [ ] One scheduled appointment per contact
- [ ] Confirmation is sent
- [ ] Reschedule moves occupancy and reminders
- [ ] Cancel frees the slot and returns inquiry to `open` if nothing else is scheduled

## I. Deposits

- [ ] Staff can mark / unmark deposited with optional MAD amount
- [ ] No payment gateway exists
- [ ] North Star counts deposited consultations with `deposited_at` in range

## J. Follow-up

- [ ] Eligible open inquiries get stall steps at 2h, 24h, 72h, 7 days from last activity
- [ ] Quiet hours delay automatic follow-ups to 09:00
- [ ] Booking, close, disqualify, or takeover pauses/cancels as specified
- [ ] Patient reply reschedules rather than duplicating a step
- [ ] After step 4, auto sequence stops and staff is flagged
- [ ] Recovered = follow-up sent + later booked

## K. Missed-call recovery

- [ ] Staff can log a phone + optional name/time/notes
- [ ] Creates or attaches inquiry `source = missed_call`
- [ ] Sends recovery WhatsApp when notify is on and inquiry is not already booked
- [ ] Booked contact: no sales recovery by default
- [ ] Failed WhatsApp still keeps the missed-call record

## L. Reminders and no-shows

- [ ] T−24h and T−2h scheduled; past ones skipped
- [ ] Cancel/reschedule cancels or rebuilds reminders
- [ ] Staff can mark showed / no-show; no-show not allowed before start
- [ ] System never auto-marks no-show
- [ ] Outcome pending appears 24h after start if still `pending`

## M. Dashboard

- [ ] Tiles match formulas in Dashboard-and-Metrics.md
- [ ] Default range last 14 days, Casablanca timezone
- [ ] Duplicate-closed inquiries excluded from funnel denominators
- [ ] Show-up rate ignores pending
- [ ] No AI-message or chatbot vanity tiles
- [ ] Estimated revenue is the sum of deposited values, labeled as estimate

## N. Security / privacy

- [ ] Tenant isolation: no cross-clinic reads
- [ ] WhatsApp tokens encrypted; not shown to staff
- [ ] Webhook signatures verified
- [ ] Media not sent to the LLM
- [ ] Contact deletion possible via owner request + operator execute
- [ ] Audit events for the actions listed in Roles-and-Permissions.md

## O. Explicit non-goals (must remain absent)

- [ ] No voice AI or PBX
- [ ] No medical records / odontogram / CNSS
- [ ] No accounting, inventory, payroll
- [ ] No Instagram/website channel product
- [ ] No Google Calendar
- [ ] No billing or payment collection
- [ ] No patient login
- [ ] No multi-country / multi-vertical packaging
- [ ] No autonomous agent framework

## Definition of done for a pilot clinic

A real clinic number is connected, front desk can take over, a test (then real) patient can go from WhatsApp or missed call to a booked slot, staff can mark a deposit and attendance, unconverted threads get follow-ups, booked patients get reminders, and the owner can read the North Star and supporting rates without asking an engineer to query the database.
