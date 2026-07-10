# API Design — Appointment Management System

This document defines the REST API contract for the backend, designed *before*
writing Express code, so the frontend and backend can be built against a
stable, agreed-upon shape.

## Design Principles

1. **Resources are nouns, not verbs.** The URL identifies *what* (`/customers`),
   the HTTP method identifies *what action* (`GET`, `POST`, `PUT`, `DELETE`).
2. **Plural nouns for collections.** `/customers` = the collection.
   `/customers/5` = one specific customer within that collection.
3. **HTTP status codes carry real meaning**, not just 200 for everything.
   - `200` OK (successful GET/PUT)
   - `201` Created (successful POST)
   - `204` No Content (successful DELETE — nothing to return)
   - `400` Bad Request (validation failure, malformed input)
   - `404` Not Found
   - `409` Conflict (e.g., double-booking an employee)
4. **Consistency across resources.** Same shape/conventions repeated for every
   entity — no per-endpoint surprises.
5. **The server, not the client, controls business-critical fields**
   (e.g., `status` on an appointment is never set directly by the client on
   creation — it always defaults to `'scheduled'` server-side).

---

## Customers

| Method | URL | Purpose | Success | Failure |
|---|---|---|---|---|
| GET | `/customers` | List all customers | 200 | — |
| GET | `/customers?search=term` | Search by name or phone (MVP "search customers" feature) | 200 | — |
| GET | `/customers/:id` | Get one customer | 200 | 404 |
| POST | `/customers` | Create a customer | 201 | 400 |
| PUT | `/customers/:id` | Update a customer | 200 | 404, 400 |
| DELETE | `/customers/:id` | Delete a customer | 204 | 404 |

**POST / PUT body:**
```json
{
  "name": "Jean Paul",
  "phone": "5xxxxxxx",
  "address": "Quatre Bornes"
}
```
- `name` — required
- `phone` — required, must be unique (Business Rule)
- `address` — optional

**GET response:** full row, including `created_at` / `updated_at` — useful
for the frontend (e.g. "customer since ..."), and this is an internal admin
tool, not a public API, so no need to hide bookkeeping fields.

---

## Employees

| Method | URL | Purpose | Success | Failure |
|---|---|---|---|---|
| GET | `/employees` | List all | 200 | — |
| GET | `/employees/:id` | Get one | 200 | 404 |
| POST | `/employees` | Create | 201 | 400 |
| PUT | `/employees/:id` | Update | 200 | 404, 400 |
| DELETE | `/employees/:id` | Delete | 204 | 404 |

**POST / PUT body:**
```json
{
  "name": "Marie Li",
  "phone": "5xxxxxxx",
  "address": "Rose Hill"
}
```
- `name` — required
- `phone`, `address` — optional

---

## Services

| Method | URL | Purpose | Success | Failure |
|---|---|---|---|---|
| GET | `/services` | List all | 200 | — |
| GET | `/services/:id` | Get one | 200 | 404 |
| POST | `/services` | Create | 201 | 400 |
| PUT | `/services/:id` | Update | 200 | 404, 400 |
| DELETE | `/services/:id` | Delete | 204 | 404, 409 if in use (see Business Rules — RESTRICT) |

**POST / PUT body:**
```json
{
  "name": "Haircut",
  "duration_min": 30,
  "price": 300.00
}
```
- `name` — required
- `duration_min` — required, must be > 0
- `price` — required, must be >= 0

---

## Appointments

| Method | URL | Purpose | Success | Failure |
|---|---|---|---|---|
| GET | `/appointments` | List all (supports query filters) | 200 | — |
| GET | `/appointments/:id` | Get one | 200 | 404 |
| GET | `/appointments/today` | Business owner's daily schedule | 200 | — |
| GET | `/appointments/week` | Business owner's weekly schedule | 200 | — |
| GET | `/appointments/availability?employee_id=&service_id=&date=` | Compute free time slots (powers customer booking flow) | 200 | — |
| POST | `/appointments` | Create an appointment (internal staff OR public booking) | 201 | 400, 409 (conflict/double-book) |
| PUT | `/appointments/:id` | Update / reschedule | 200 | 404, 400, 409 |
| PATCH | `/appointments/:id/cancel` | Cancel (sets status, does not delete row) | 200 | 404 |
| DELETE | `/appointments/:id` | Hard delete (admin-only, rare) | 204 | 404 |

**POST body:**
```json
{
  "customer_id": 12,
  "employee_id": 3,
  "service_id": 5,
  "start_time": "2026-07-15T14:00:00"
}
```
- `customer_id` — required
- `employee_id` — optional
- `service_id` — required
- `start_time` — required
- `status` — **never sent by client**; always defaults to `'scheduled'` server-side

**GET response (expanded, not raw IDs):**
```json
{
  "appointment_id": 42,
  "customer": { "customer_id": 12, "name": "Jean Paul" },
  "employee": { "employee_id": 3, "name": "Marie Li" },
  "service": { "service_id": 5, "name": "Haircut", "duration_min": 30, "price": 300 },
  "start_time": "2026-07-15T14:00:00",
  "status": "scheduled"
}
```
Expanding related data server-side avoids the frontend making 3 extra
requests per appointment just to display names.

**Why `PATCH /appointments/:id/cancel` instead of `PUT`:** cancelling is a
distinct business action (frees the time slot, may trigger a notification),
not a generic field edit. Giving it its own endpoint makes intent explicit
and gives cancel-specific logic (like freeing the slot) one clear home.

---

## Notifications

No dedicated public endpoint. Inside the `POST /appointments` handler, *after*
the row is successfully saved and just before returning `201`, the handler
calls `NotificationService.send(...)` as a fire-and-forget side effect.
A notification failure must never affect the booking's success or the
response sent to the client.

---

## Standard Error Shape

Used consistently across every endpoint, so the frontend can handle errors
generically:
```json
{
  "error": "Customer not found"
}
```
paired with the appropriate HTTP status code.
