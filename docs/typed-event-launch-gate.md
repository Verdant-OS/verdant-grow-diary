# Typed Event Launch Gate

This document defines the **hard preconditions** that MUST be met before the
typed grow-event write path (currently only `create_watering_event`) may be
enabled in any user-facing runtime. While any item below is unmet,
`typedWateringWriteEnabled` MUST remain `false` and QuickLog MUST continue to
write only to `diary_entries`.

The gate is non-negotiable. It is not a roadmap, not a wishlist, and not a
"nice to have". Each item is a binary pass/fail and must be re-verified
whenever the RPC, RLS, triggers, adapter, or feature-flag scaffold change.

---

## Scope

In scope:
- `create_watering_event` RPC
- `grow_events` parent table and `watering_events` subtype table
- `src/lib/quickLogTypedEventPayloadRules.ts` adapter
- `src/lib/featureFlags.ts` flag `typedWateringWriteEnabled`
- `src/lib/writeWateringTypedEvent.ts` disabled-by-default seam

Out of scope:
- Leads
- service_role usage in any client or runtime code
- External actions, automation, email, SMS, webhooks, exports
- Sibling typed-event tables (`feeding_events`, `photo_events`,
  `observation_events`, `training_events`, `environment_events`) — see
  "Explicit prohibitions" below

---

## Required launch gate items

Typed watering writes MAY be enabled **only after every item below is
verified and signed off**:

1. `docs/testing/typed-event-rls-checklist.md` has been fully completed
   with live authenticated-user verification using two distinct real
   accounts through the standard authenticated Supabase client. The
   Sign-off table at the bottom of that checklist must be filled in.
2. Unauthenticated RPC rejection is verified end-to-end against the live
   backend (anon client without a session receives an auth error and no
   rows are written).
3. The owning user can create a watering event for a `grow_id` they own
   and the RPC returns a new event UUID.
4. Cross-user `grow_id` rejection is verified: User A cannot create a
   watering event against User B's `grow_id`.
5. Cross-user `tent_id` rejection is verified: User A cannot pass User B's
   `tent_id`.
6. Cross-user `plant_id` rejection is verified: User A cannot pass User
   B's `plant_id`.
7. Plant/tent mismatch rejection is verified: passing a plant whose
   `tent_id` does not match the provided `tent_id` is rejected.
8. Invalid watering values are rejected by the RPC and/or the
   `validate_watering_event` trigger:
   - `volume_ml <= 0`
   - `volume_ml` NULL
   - `ph` outside `[0, 14]`
   - `ec_ms_cm` negative
   - `runoff_ph` outside `[0, 14]`
   - `runoff_ec` negative
9. A successful RPC call produces **exactly one** row in `grow_events`
   and **exactly one** row in `watering_events`, linked by `event_id`,
   with the parent `event_type = 'watering'`, `source = 'manual'`, and
   matching `user_id` across both rows.
10. A forced subtype validation failure produces **no orphan parent**
    row in `grow_events` (full transaction rollback verified).
11. No client two-step insert path exists in `src/` — verified by repo
    grep: there must be no `from('grow_events').insert(...)` or
    `from('watering_events').insert(...)` (or any sibling subtype) in
    runtime code. Only generated types, the pure adapter, the disabled
    helper, and tests may reference these tables.
12. `typedWateringWriteEnabled` defaults to `false` in
    `src/lib/featureFlags.ts` and the flag remains the single source of
    truth for the write path.
13. QuickLog `diary_entries` compatibility is preserved: when the flag
    is later flipped to `true`, QuickLog MUST continue to write its
    existing `diary_entries` row exactly as it does today. The typed
    write is additive only. No QuickLog field is moved, renamed, or
    dropped as part of enabling the flag.
14. A rollback plan is documented (see "Rollback plan" below) and the
    rollback has been rehearsed at least once in a non-production
    environment.

---

## Explicit prohibitions

The following are forbidden regardless of any future approval and MUST be
enforced by code review:

- **Enabling non-watering typed writes** (`feeding`, `photo`,
  `observation`, `training`, `environment`) is forbidden until a
  dedicated atomic `create_*_event` RPC exists for each kind and that
  kind has its own completed RLS checklist and launch gate sign-off.
  The adapter's `getTypedEventWriteReadiness` must continue to return
  `rpc_missing` for those kinds.
- **Direct client inserts** into `grow_events` or any subtype table
  (`watering_events`, `feeding_events`, `photo_events`,
  `observation_events`, `training_events`, `environment_events`) are
  forbidden. All writes MUST go through an atomic SECURITY DEFINER RPC
  that inserts the parent and the subtype in a single transaction.
- **`service_role` usage in client or runtime code** is forbidden. The
  service-role key must never be imported, referenced, or transported
  through the browser bundle, edge-function client code that is reachable
  from unauthenticated callers, or any QuickLog/UI path. RLS is the
  enforcement boundary.
- **Dual-writing without an atomic rollback strategy** is forbidden. The
  helper must not write to `diary_entries` and to the typed event tables
  in a way that can leave the two stores inconsistent on partial
  failure. Either the typed write is performed inside the same logical
  unit as the diary write with a documented rollback, or the typed write
  is treated as a best-effort shadow with a documented reconciliation
  job — never both, and never neither.

---

## Rollback plan

If, after enabling `typedWateringWriteEnabled = true`, any of the
following are observed in production:

- elevated error rate on `create_watering_event`
- any orphan `grow_events` row without a matching subtype
- any RLS violation in logs related to the typed event tables
- any user-visible regression in QuickLog or the diary

the rollback procedure is:

1. Flip `typedWateringWriteEnabled` back to `false` in
   `src/lib/featureFlags.ts` and ship the change.
2. Confirm via build that the helper short-circuits to
   `{ ok: false, status: 'disabled' }`.
3. QuickLog continues to write `diary_entries` exactly as before — no
   data migration is required because the typed write is additive.
4. Triage the captured errors before considering re-enable. Re-enabling
   requires re-running the full launch gate from item 1.

No data fix-up is required for `diary_entries`. Any orphan rows in
`grow_events` discovered after rollback are evidence of a contract
violation and must be investigated before the flag is flipped again.

---

## Sign-off

| Date | Approver | Checklist run ID | Flag value after sign-off |
|------|----------|------------------|---------------------------|
|      |          |                  | `false` until all items above pass |

Until this table is filled in with a row whose final column is `true`,
`typedWateringWriteEnabled` MUST remain `false`.
