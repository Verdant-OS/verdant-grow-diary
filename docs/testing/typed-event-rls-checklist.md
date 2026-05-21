# Typed Event RLS / RPC Manual Verification Checklist

Status: REQUIRED before any UI/runtime wiring of `create_watering_event` or any
direct client write to the typed grow-event tables.

The local Vitest suite does **not** execute real Supabase RPC or RLS checks.
These ownership and rejection cases MUST be exercised against a live Lovable
Cloud (Supabase) instance with two distinct authenticated test users
(User A and User B), each owning their own `grows`, `tents`, and `plants`.

Do **not** use the service_role key for any of these checks. All calls must go
through the standard authenticated client. Do not wire `create_watering_event`
into QuickLog until every required case below is green.

---

## Scope

Tables and RPC under test:

- `public.grow_events` (parent)
- `public.watering_events` (subtype)
- `public.feeding_events`, `public.photo_events`, `public.observation_events`,
  `public.training_events`, `public.environment_events` (sibling subtypes,
  reference only — not wired)
- RPC `public.create_watering_event(...)`

Out of scope for this checklist:
- Leads
- service_role usage
- Any external action, automation, email, SMS, webhook, or export

---

## Required Ownership / Rejection Cases

Every item must be checked off with the date and the tester.

### A. Authentication

- [ ] `create_watering_event` rejects unauthenticated calls
      (anon client, no session) with an authentication / RLS error.

### B. Ownership: grow_id

- [ ] User A can call `create_watering_event` for a `grow_id` they own and it
      returns a new event UUID.
- [ ] User A calling `create_watering_event` with User B's `grow_id` is
      rejected (RPC raises `grow not found or not owned by caller`, no rows
      written).

### C. Ownership: tent_id

- [ ] User A cannot pass User B's `tent_id` — RPC raises
      `tent not found or not owned by caller`.
- [ ] User A passing their own `tent_id` that belongs to a different grow is
      handled per RPC contract (no cross-grow write).

### D. Ownership: plant_id

- [ ] User A cannot pass User B's `plant_id` — RPC raises
      `plant not found or not owned by caller`.
- [ ] User A passing their own `plant_id` together with a `tent_id` that does
      not match the plant's `tent_id` is rejected with
      `plant is not assigned to the provided tent`.

### E. Value validation

- [ ] `volume_ml <= 0` is rejected (RPC `volume_ml must be > 0`).
- [ ] `volume_ml = NULL` is rejected.
- [ ] Invalid `ph` (e.g. `-1`, `15`) is rejected by the
      `validate_watering_event` trigger (`ph out of range`).
- [ ] Invalid `ec_ms_cm` (negative) is rejected (`ec_ms_cm < 0`).
- [ ] Invalid `runoff_ph` (e.g. `-1`, `15`) is rejected
      (`runoff_ph out of range`).
- [ ] Invalid `runoff_ec` (negative) is rejected (`runoff_ec < 0`).

### F. Successful write shape

- [ ] A successful call produces exactly **one** row in `grow_events` and
      exactly **one** row in `watering_events` linked by `event_id`.
- [ ] The parent `grow_events.event_type = 'watering'`.
- [ ] The parent `grow_events.source = 'manual'`.
- [ ] The subtype `watering_events.user_id` equals `auth.uid()` of the caller
      and matches the parent `grow_events.user_id`.
- [ ] `occurred_at` defaults to `now()` when not supplied (no epoch-0).

### G. Atomicity / no orphans

- [ ] On a forced subtype validation failure (e.g. invalid `ph` injected),
      no orphan row remains in `grow_events` for that call
      (the RPC must roll back the entire transaction).
- [ ] On a forced ownership failure, no row is written to either table.

### H. Direct two-step client path (must remain unused)

- [ ] App code does **not** contain any client-side two-step path that first
      inserts into `grow_events` and then into `watering_events`
      (or any other `*_events` subtype) without going through an RPC.
      Verified by repo grep before each release.
- [ ] Sibling subtypes (`feeding_events`, `photo_events`,
      `observation_events`, `training_events`, `environment_events`) have
      **no** RPC yet. They MUST NOT be written from the client until an
      atomic RPC exists and this checklist is extended to cover them.

### I. RLS sanity (independent of RPC)

- [ ] User A cannot `SELECT` User B's rows in `grow_events`,
      `watering_events`, or any sibling subtype table.
- [ ] User A cannot `UPDATE` or `DELETE` User B's rows in any of these tables.
- [ ] Operator role (`has_role(auth.uid(), 'operator')`) can `SELECT` across
      users as designed, but cannot bypass per-user `INSERT/UPDATE/DELETE`
      checks via the standard client.

---

## Sign-off

| Date | Tester | Environment | Result |
|------|--------|-------------|--------|
|      |        |             |        |

QuickLog wiring of `create_watering_event` is blocked until every box in
sections A–I is checked and signed off here.
