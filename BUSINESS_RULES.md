# Business Rules — Appointment Management System

This document captures the real-world rules the system enforces — not
implementation details, but facts about how the business operates. Each
rule should be traceable to actual code (validation, a DB constraint, or a
route check). When behavior changes, update this file first, then the code.

## Roles & Permissions

Two roles exist on `users.role`: `owner` and `staff`.

| Action                                              | Owner | Staff |
|------------------------------------------------------|:---:|:---:|
| View all appointments                                | ✅  | ❌ (own only) |
| Create/edit/cancel their own appointments             | ✅  | ✅  |
| Create/edit/cancel other employees' appointments       | ✅  | ❌  |
| View / create customers                              | ✅  | ✅  |
| Delete customers                                     | ✅  | ❌  |
| View / manage employees                              | ✅  | ❌  |
| View / manage services (incl. prices)                | ✅  | ❌  |
| View revenue / reports (future feature)               | ✅  | ❌  |
| Register new staff accounts                          | ✅  | ❌  |

- A `users` row may optionally link to an `employees` row via
  `users.employee_id`. This is how the system knows "which employee is
  this logged-in staff member" for the "own appointments only" rule.
- `owner` accounts do not need an `employee_id` link.
- `POST /register` must NOT be a public, unauthenticated endpoint long
  term — only an already-logged-in owner should be able to create new
  staff accounts. (Currently still open — flagged as a gap to close.)
- `401 Unauthorized` = "we don't know who you are" (missing/invalid token).
  `403 Forbidden` = "we know who you are, and you're not allowed to do
  this." Use the correct one, not just 401 everywhere.

## Appointment Rules

- Cannot book an appointment in the past.
- Cannot double-book an employee (two non-cancelled appointments for the
  same employee cannot have overlapping time windows).
- Appointment duration is derived from the selected service's
  `duration_min`, not stored on the appointment itself, so changing a
  service's duration later doesn't leave stale data on old appointments.
- Cancelled appointments free the time slot (double-booking checks ignore
  appointments with `status = 'cancelled'`).
- `status` is never set by the client on creation — it always starts as
  `'scheduled'`, set server-side only.
- Deleting a customer cascades and deletes their appointments
  (`ON DELETE CASCADE`) — an appointment can't meaningfully exist without
  its customer.
- Deleting an employee does NOT delete their past appointments — it just
  unassigns them (`ON DELETE SET NULL`) — appointment history is real
  business history and must survive an employee leaving.
- Deleting a service that still has appointments referencing it is
  blocked (`ON DELETE RESTRICT`) — forces a conscious decision rather than
  silently corrupting appointment data.

## Customer Rules

- `name` is required.
- `phone` is required and must be unique.
- `address` is optional.

## Employee Rules

- `name` is required.
- `phone` and `address` are optional.

## Service Rules

- `name` is required.
- `duration_min` is required and must be greater than 0.
- `price` is required and must be zero or greater (0 is allowed, e.g. a
  free consultation; negative is not).

## User / Auth Rules

- `email` must be unique (enforced at the DB level via a UNIQUE
  constraint) — it's the login identifier.
- Passwords are never stored in plain text — always hashed with bcrypt
  before touching the database, and the hash is never returned in any API
  response.
- Login failures (wrong email OR wrong password) return the same generic
  "Invalid email or password" message, to avoid revealing which emails
  have real accounts (user enumeration protection).
- JWTs expire after 8 hours.
