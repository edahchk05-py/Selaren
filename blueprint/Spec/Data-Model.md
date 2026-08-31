# Data model

Logical schema for the MVP. IDs are UUID. All clinic-owned tables include `clinic_id` and are tenant-scoped.

Timestamps are stored in UTC; display in `Africa/Casablanca`.

## Entity-relationship (summary)

```
users
   └─ clinic_memberships ─┐
selaren_operator (flag)    │
                           ▼
                        clinics
                           ├─ clinic_knowledge          (1:1)
                           ├─ treatments                (1:n)
                           ├─ working_hours             (1:7)
                           ├─ availability_exceptions   (1:n)
                           ├─ whatsapp_connections      (1:1)
                           ├─ contacts                  (1:n)
                           │     └─ conversations       (1:1)
                           │           └─ messages      (1:n)
                           ├─ inquiries                 (1:n)
                           │     ├─ qualifications      (1:1)
                           │     ├─ follow_ups          (1:n)
                           │     └─ missed_calls        (1:n)
                           ├─ appointments              (1:n)
                           │     └─ reminders           (1:n)
                           └─ audit_events              (1:n)
```

Relationships:

- `contacts.phone_e164` unique per `clinic_id`
- `conversations.contact_id` unique
- `inquiries` belong to contact + conversation
- At most one inquiry per contact with `status in (open, booked)`
- `appointments.inquiry_id` required
- `messages.conversation_id` required

## Tables

### users

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| email | citext unique | login |
| password_hash | text | |
| name | text | |
| is_selaren_operator | bool | default false |
| deactivated_at | timestamptz | nullable |
| created_at | timestamptz | |

### clinics

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| name | text | |
| city | enum | `casablanca`, `marrakech` |
| country_code | char(2) | always `MA` |
| timezone | text | always `Africa/Casablanca` |
| locale | text | always `fr` |
| status | enum | `onboarding`, `active`, `paused` |
| default_slot_minutes | int | 15–60, default 30 |
| default_consultation_value_mad | numeric(12,2) | nullable until activation |
| deposit_typically_required | bool | default true |
| created_at | timestamptz | |

### clinic_memberships

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| user_id | uuid fk | |
| role | enum | `owner`, `staff` |
| deactivated_at | timestamptz | |
| created_at | timestamptz | |
| unique (clinic_id, user_id) | | |

### clinic_knowledge

| Column | Type | Notes |
| --- | --- | --- |
| clinic_id | uuid pk/fk | 1:1 |
| about_text | text | |
| tone | text | |
| pricing_notes | text | |
| faqs | text | |
| policies | text | |
| booking_rules | text | |
| do_not_say | text | |
| follow_up_text | text | nullable; default used if empty |
| missed_call_text | text | nullable |
| updated_at | timestamptz | |
| updated_by_user_id | uuid fk | nullable |

### treatments

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| name | text | |
| category | enum | `implant`, `veneer`, `aligner`, `orthodontics`, `aesthetic`, `other` |
| offered | bool | |
| estimated_value_mad | numeric(12,2) | nullable |
| notes | text | |
| created_at | timestamptz | |

### working_hours

| Column | Type | Notes |
| --- | --- | --- |
| clinic_id | uuid fk | |
| weekday | int | 0 = Monday … 6 = Sunday (ISO) |
| enabled | bool | |
| start_time | time | local |
| end_time | time | local |
| primary (clinic_id, weekday) | | |

### availability_exceptions

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| start_at | timestamptz | |
| end_at | timestamptz | |
| kind | enum | `blocked` only in MVP |
| reason | text | nullable |

### whatsapp_connections

| Column | Type | Notes |
| --- | --- | --- |
| clinic_id | uuid pk/fk | |
| waba_id | text | |
| phone_number_id | text unique | webhook routing key |
| display_phone_e164 | text | |
| access_token_encrypted | text | |
| status | enum | `disconnected`, `pending`, `active`, `error` |
| last_error | text | nullable |
| updated_at | timestamptz | |

### contacts

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| phone_e164 | text | |
| name | text | nullable |
| language | enum | `fr`, `ar`, `unknown` |
| wa_opt_out | bool | default false |
| created_at | timestamptz | |
| unique (clinic_id, phone_e164) | | |

### conversations

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| contact_id | uuid fk unique | |
| mode | enum | `ai`, `human` |
| status | enum | `open`, `closed` |
| ai_halt_reason | text | nullable |
| last_patient_message_at | timestamptz | nullable |
| last_outbound_at | timestamptz | nullable |
| unread_count | int | default 0 |
| updated_at | timestamptz | |

### messages

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| conversation_id | uuid fk | |
| direction | enum | `inbound`, `outbound` |
| sender_type | enum | `patient`, `ai`, `staff`, `system` |
| staff_user_id | uuid fk | nullable |
| body | text | |
| media_url | text | nullable |
| media_type | text | nullable |
| template_name | text | nullable |
| wa_message_id | text | unique nullable |
| status | enum | `queued`, `sent`, `delivered`, `read`, `failed` |
| error_detail | text | nullable |
| created_at | timestamptz | |

### inquiries

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| contact_id | uuid fk | |
| conversation_id | uuid fk | |
| source | enum | `whatsapp`, `missed_call`, `manual` |
| status | enum | `open`, `booked`, `closed` |
| closed_reason | enum | nullable |
| first_response_at | timestamptz | nullable |
| qualified_at | timestamptz | nullable |
| booked_at | timestamptz | nullable |
| estimated_value_mad | numeric(12,2) | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Partial unique index: one row per `contact_id` where `status in ('open','booked')`.

### qualifications

| Column | Type | Notes |
| --- | --- | --- |
| inquiry_id | uuid pk/fk | |
| status | enum | `unevaluated`, `in_progress`, `qualified`, `disqualified` |
| treatment_id | uuid fk | nullable |
| treatment_label | text | nullable |
| intent | enum | `unknown`, `information`, `book`, `admin` |
| can_attend_clinic | enum | `unknown`, `yes`, `no` |
| disqualify_reason | enum | nullable |
| notes | text | |
| locked_by_staff | bool | default false |
| updated_at | timestamptz | |

### appointments

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| inquiry_id | uuid fk | |
| contact_id | uuid fk | |
| start_at | timestamptz | |
| end_at | timestamptz | |
| status | enum | `scheduled`, `cancelled`, `rescheduled` |
| attendance | enum | `pending`, `showed`, `no_show` |
| deposit_status | enum | `none`, `deposited` |
| deposit_amount_mad | numeric(12,2) | nullable |
| deposited_at | timestamptz | nullable |
| marked_by_user_id | uuid fk | nullable |
| superseded_by_appointment_id | uuid fk | nullable |
| confirmation_sent_at | timestamptz | nullable |
| notes | text | |
| created_at | timestamptz | |

Prevent overlapping `scheduled` appointments on the same clinic: exclusion constraint on `tstzrange(start_at, end_at)` where `status = 'scheduled'`.

Partial unique: one `scheduled` appointment per `contact_id`.

### follow_ups

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| inquiry_id | uuid fk | |
| step | int | 1–4 |
| kind | enum | `stall`, `manual` |
| scheduled_at | timestamptz | |
| sent_at | timestamptz | nullable |
| canceled_at | timestamptz | nullable |
| message_id | uuid fk | nullable |
| created_at | timestamptz | |

### reminders

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| appointment_id | uuid fk | |
| kind | enum | `t24h`, `t2h` |
| scheduled_at | timestamptz | |
| sent_at | timestamptz | nullable |
| canceled_at | timestamptz | nullable |
| skip_reason | text | nullable |
| message_id | uuid fk | nullable |
| unique (appointment_id, kind) | | |

### missed_calls

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | |
| contact_id | uuid fk | |
| inquiry_id | uuid fk | |
| called_at | timestamptz | |
| logged_by_user_id | uuid fk | |
| notes | text | |
| notify_patient | bool | default true |
| created_at | timestamptz | |

### audit_events

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| clinic_id | uuid fk | nullable (global operator actions) |
| user_id | uuid fk | nullable |
| action | text | |
| entity_type | text | |
| entity_id | uuid | nullable |
| metadata | jsonb | no secrets, no raw tokens |
| created_at | timestamptz | |

## Jobs / outbox (required for reliability)

Implementation must persist outbound WhatsApp and scheduled work (follow-ups, reminders), not fire-and-forget in memory.

Minimum: `message_outbox` or use `messages.status = queued` plus a scheduler that polls `follow_ups` and `reminders` where `sent_at` and `canceled_at` are null and `scheduled_at <= now()`.

## What is not a table

No: patients-as-users, invoices, medical charts, odontograms, inventory, Instagram threads, calendar accounts, payment intents, AI-agent runs, multi-branch orgs.
