# Plant Merge Execution Plan

Status: **Audit + plan only. No RPC implemented yet.**
Owner: Verdant core team.
Companion code: `src/lib/plantMergeRules.ts` (preview-only v1).
Companion test: `src/test/plant-merge-execution-plan.test.ts`.

---

## 1. Goal

Allow a grower to merge a duplicate plant into a canonical target plant
without losing any grow history, photos, sensor context, alerts, or
Action Queue records.

Core principle:

> A duplicate plant merge must be **all-or-nothing**, executed **server-side**,
> in **one transaction**, under the merging user's `auth.uid()`.

The current client-side preview (`plantMergeRules.ts`) intentionally
blocks execution whenever the source plant has any linked history. This
document specifies the server-side path that lifts that block safely.

---

## 2. Audit of plant-linked data

The audit was performed against `<supabase-tables>` in project context
plus `rg` searches for `plant_id` / `plantId` across `src/` and
`supabase/functions/`.

### 2.1 Tables that reference `plants.id` via `plant_id`

| Table                    | `plant_id` nullable | Owner column | Merge action |
|--------------------------|--------------------|--------------|--------------|
| `grow_events`            | yes                | `user_id`    | **REASSIGN** source → target |
| `diary_entries`          | yes                | `user_id`    | **REASSIGN** source → target |
| `alerts`                 | yes                | `user_id`    | **REASSIGN** source → target |
| `action_queue`           | yes                | `user_id`    | **REASSIGN** source → target |
| `action_queue_events`    | (via parent)       | `user_id`    | Untouched (follows parent) |
| `alert_events`           | (via parent)       | `user_id`    | Untouched (follows parent) |

Typed event subtype tables (`watering_events`, `feeding_events`,
`training_events`, `observation_events`, `environment_events`,
`photo_events`) reference `grow_events.id` via `event_id`, **not**
`plant_id` directly. Because the parent `grow_events.plant_id` is
reassigned, subtypes follow automatically. No additional UPDATE is
required against subtype tables.

### 2.2 Tables that do NOT have `plant_id` but are tent/grow scoped

These must **not** be touched by a plant merge:

- `sensor_readings` — keyed on `tent_id`, no `plant_id` column. Tent
  scope is preserved; plant attribution is derived at read time.
- `pi_ingest_idempotency_keys` — bridge/tent scoped; no plant linkage.
- `pi_ingest_bridge_credentials` — credential storage; unrelated.
- `grow_targets` — grow scoped.
- `tents`, `grows` — parent containers.
- `harvests` — grow scoped.

### 2.3 App-level concepts with no dedicated table

- **Daily Grow Check** records are reads over `grow_events` /
  `diary_entries`. They follow automatically once parents are
  reassigned. No separate UPDATE needed.
- **Photos** are stored either as `photo_url` on `diary_entries` or as
  `photo_events` rows hanging off `grow_events`. Both paths follow the
  parent reassignment.
- **Timeline / history views** are reads. Nothing to migrate.

### 2.4 Foreign-key constraint check

`<supabase-tables>` reports `No foreign keys` on the relevant tables
(ownership is enforced via RLS + `user_id` rather than DB-level FKs to
`plants.id`). This means:

- The merge does **not** need to defer constraints.
- The merge **must** still verify ownership and grow scope in SQL,
  because the DB will not.

### 2.5 Source-plant terminal state

The current `plants` schema has:

- `is_archived boolean not null default false`
- no `merged_into_plant_id`
- no `merged_at`
- no `status` column

With existing schema we can mark the source as `is_archived = true` and
append a structured note to `last_note`. That is acceptable for v1.

A **future, optional** minimal migration (NOT part of this task) would
add:

```sql
alter table public.plants
  add column if not exists merged_into_plant_id uuid,
  add column if not exists merged_at timestamptz;
```

with an index on `merged_into_plant_id`. This is documented here only;
no migration is applied in this task.

### 2.6 Audit logging

There is no `plant_events` or generic audit table today. Existing
event tables (`alert_events`, `action_queue_events`, `lead_events`) are
scoped to their own parents and are not appropriate carriers for a
plant-merge audit row.

Decision: **audit logging is deferred**. The RPC will return a full
summary object so the client can render a confirmation; persistent
audit can be added with the optional migration in §2.5.

---

## 3. Server-side merge contract

### 3.1 Proposed RPC

```sql
create or replace function public.merge_duplicate_plant(
  source_plant_id uuid,
  target_plant_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$ ... $$;
```

Notes:

- `SECURITY DEFINER` is used **only** so the function can run as a
  single transaction with `set search_path`. It must still gate every
  action on `auth.uid()`. **No `service_role` involvement.**
- Returns a `jsonb` summary (see §3.5).
- Must be `revoke all ... from public` then
  `grant execute ... to authenticated`.

### 3.2 Preconditions (must all pass before any write)

1. `auth.uid()` is not null.
2. `source_plant_id is not null` and `target_plant_id is not null`.
3. `source_plant_id <> target_plant_id`.
4. Source plant row exists and `source.user_id = auth.uid()`.
5. Target plant row exists and `target.user_id = auth.uid()`.
6. `source.grow_id is not distinct from target.grow_id`
   (cross-grow merges are blocked at v1, mirroring `plantMergeRules.ts`).
7. Source is not already archived **as a previous merge** (idempotency,
   see §3.6).

Any failure raises with a stable `errcode`:

- `28000` — not authenticated
- `22023` — invalid argument (same id, null, cross-grow)
- `42501` — ownership mismatch
- `P0001` (custom message `plant_already_merged`) — repeat merge

### 3.3 Reassign step (single transaction)

Inside one `BEGIN ... COMMIT`:

```sql
update public.grow_events
   set plant_id = target_plant_id, updated_at = now()
 where plant_id = source_plant_id
   and user_id  = auth.uid();

update public.diary_entries
   set plant_id = target_plant_id
 where plant_id = source_plant_id
   and user_id  = auth.uid();

update public.alerts
   set plant_id = target_plant_id, updated_at = now()
 where plant_id = source_plant_id
   and user_id  = auth.uid();

update public.action_queue
   set plant_id = target_plant_id, updated_at = now()
 where plant_id = source_plant_id
   and user_id  = auth.uid();
```

Row counts from each statement are captured via `GET DIAGNOSTICS` and
fed into the summary.

### 3.4 Source terminal step

```sql
update public.plants
   set is_archived = true,
       last_note   = coalesce(
         'Merged into ' || target_plant_id::text || ' at ' || now()::text
         || E'\n' || coalesce(last_note, ''),
         last_note
       ),
       updated_at  = now()
 where id      = source_plant_id
   and user_id = auth.uid();
```

The source plant is **never** hard-deleted. No `delete from plants`
appears anywhere in the function.

### 3.5 Return value

```json
{
  "source_plant_id": "...",
  "target_plant_id": "...",
  "moved": {
    "grow_events": 12,
    "diary_entries": 4,
    "alerts": 0,
    "action_queue": 0
  },
  "skipped": {
    "sensor_readings_tent_scoped": true,
    "pi_ingest_idempotency_keys_tent_scoped": true
  },
  "source_status": "archived_as_merged",
  "audit_logged": false
}
```

The client uses `moved.*` to render a post-merge confirmation in
`PlantMergeDialog`.

### 3.6 Idempotency

The function is **reject-on-repeat**, not silently idempotent:

- If the source plant is already `is_archived = true` AND its
  `last_note` begins with `Merged into <target>`, raise
  `plant_already_merged`.
- This avoids accidental double-merges from rapid clicks while keeping
  the surface predictable.

### 3.7 What the RPC must NOT do

- Must not call any service_role API.
- Must not touch `sensor_readings`, `pi_ingest_*`, `grow_targets`,
  `harvests`, `tents`, or `grows`.
- Must not write to `action_queue_events` or `alert_events` (those are
  follow-the-parent logs).
- Must not delete any row anywhere.
- Must not modify automation, device control, or pi-ingest paths.
- Must not change RLS policies.

---

## 4. Client integration outline (future task)

When the RPC ships:

1. `plantMergeRules.ts` keeps preview as the source of truth for what
   *would* move.
2. A new thin wrapper calls `supabase.rpc('merge_duplicate_plant', ...)`
   inside `PlantMergeDialog` on confirm.
3. On success, the dialog shows the `moved` summary and refetches
   plant lists.
4. On `plant_already_merged`, the dialog shows "already merged" and
   refreshes silently.

No UI work is done in this task.

---

## 5. Safety verdict for this task

- Audit and docs only.
- No RPC implemented.
- No schema change.
- No client write path added.
- No sensor / pi-ingest / Edge Function / alert / Action Queue
  behavior changed.
- No service_role usage proposed anywhere.
- All proposed writes gated on `auth.uid()` and ownership.

---

## 6. Recommended next prompt

> Implement `public.merge_duplicate_plant(source_plant_id uuid,
> target_plant_id uuid)` per `docs/plant-merge-execution-plan.md`.
> Server-side only, one transaction, no service_role, no hard delete,
> reject repeat merges, return the documented JSON summary. Add
> migration + RPC contract tests. Do not wire the client yet.
