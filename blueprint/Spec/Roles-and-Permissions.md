# Roles and permissions

## Roles

Exactly three roles exist in the MVP.

| Role | Who | How created |
| --- | --- | --- |
| `selaren_operator` | Founder / Selaren internal | Seeded or created by another operator. Not a clinic employee. |
| `owner` | Clinic owner / decision-maker | Created during onboarding by an operator, or later by an existing owner. |
| `staff` | Receptionist, secretary, front desk | Invited by an owner (or created by an operator during setup). |

A user has at most one membership per clinic. A user may belong to multiple clinics only if explicitly attached (operator helping two pilot clinics, or an owner with two workspaces). There is no “group clinic” UI.

There is no patient account.

## Global vs clinic scope

- `selaren_operator` is a **global** flag on `users`.
- `owner` and `staff` are **clinic membership** roles.

An operator does not need a membership to open a clinic for setup, but every operator access to clinic data is audited.

## Permission matrix

| Action | staff | owner | operator |
| --- | --- | --- | --- |
| Sign in | Yes | Yes | Yes |
| View inbox, conversations, inquiries | Yes | Yes | Yes (audited) |
| Send WhatsApp messages | Yes | Yes | Yes (setup/support only) |
| Take over / release AI | Yes | Yes | Yes |
| Edit qualification | Yes | Yes | Yes |
| Book / reschedule / cancel appointment | Yes | Yes | Yes |
| Mark deposit | Yes | Yes | Yes |
| Mark show / no-show | Yes | Yes | Yes |
| Log missed call | Yes | Yes | Yes |
| Trigger or cancel a follow-up | Yes | Yes | Yes |
| View dashboard / metrics | Yes | Yes | Yes |
| Edit clinic knowledge, treatments, working hours, exceptions | No | Yes | Yes |
| Change slot duration, default consultation value, deposit-required flag | No | Yes | Yes |
| Connect / disconnect WhatsApp | No | Yes | Yes |
| Invite / deactivate `staff` | No | Yes | Yes |
| Invite / deactivate `owner` | No | Yes | Yes |
| Create clinic workspace | No | No | Yes |
| Pause / reactivate clinic | No | No | Yes |
| List all clinics | No | No | Yes |
| Change another user’s global operator flag | No | No | Yes |
| See other clinics’ data | No | No | Yes (audited) |
| Export or delete clinic personal data | No | Yes (request) | Yes (execute) |

“Invite / deactivate `owner`” by an owner: at least **one** active owner must remain.

Staff must not see WhatsApp access tokens, other clinics, or operator-only lists.

## Seat model

No seat billing in-app. A clinic may have:

- 1+ owners
- 0+ staff

No hard cap in software. Founder handles commercial volume in the contract.

## Session rules

- Authenticated session required for all app and API routes except WhatsApp webhooks and health checks.
- Webhooks authenticate with the Meta app secret, not a user session.
- A deactivated membership cannot access that clinic.
- A paused clinic is read-only for owner/staff except operator.

## Audit

Write an `audit_events` row for:

- login (success/failure without storing password)
- takeover / release
- qualification override
- appointment create / cancel / reschedule
- deposit and attendance marks
- knowledge or availability edits
- WhatsApp connect / disconnect
- membership changes
- operator access to a clinic
