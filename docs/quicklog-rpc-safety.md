# QuickLog v2 RPC Safety — `public.quicklog_save_manual`

This document is the long-term safety contract for the QuickLog v2 atomic save
RPC. It is co-owned by the static safety tests under `src/test/`. Any change
to reason codes, input shape, or ownership behavior must be reflected here
**and** in the regression tests, or CI will fail.

## Function shape

`public.quicklog_save_manual` is `SECURITY DEFINER` with `search_path` pinned
to `'public', 'pg_temp'`. Caller identity is **always** derived from
`auth.uid()`. There is no `p_user_id` parameter, and the function never
accepts a client-supplied owner.

### Inputs (only)

| Param            | Trusted? | Purpose                                                |
|------------------|----------|--------------------------------------------------------|
| `p_target_type`  | enum     | `'plant'` or `'tent'` — anything else returns a safe reason code |
| `p_target_id`    | uuid     | The selected target row; ownership resolved via DB     |
| `p_action`       | enum     | `'water'` or `'note'`                                  |
| `p_volume_ml`    | numeric  | Required > 0 when action = `water`                     |
| `p_note`         | text     | Optional free text, nullable                           |
| `p_temperature_c`, `p_humidity_pct`, `p_vpd_kpa` | numeric | Optional manual sensor snapshot |
| `p_occurred_at`  | tstz     | Optional; defaults to `now()`                          |

There is **no** `p_user_id`, **no** `p_grow_id`, and **no** `p_tent_id`. The
grow and tent are always resolved from the selected plant/tent row owned by
`auth.uid()`. This makes mixed-boundary attacks (plant in grow B but client
claims grow A) impossible by input shape.

## Allowed safe reason codes

The RPC returns `jsonb` of shape `{ ok: boolean, reason?: text, ... }`. When
`ok = false`, `reason` is one of the following short tokens. These tokens are
the **only** strings the RPC may put in `reason`. Adding a new code requires
updating this list and the regression tests in the same change.

| Code                  | Meaning                                                   |
|-----------------------|-----------------------------------------------------------|
| `not_authenticated`   | `auth.uid()` is null                                      |
| `invalid_target_type` | `p_target_type` not in (`plant`, `tent`)                  |
| `missing_target_id`   | `p_target_id` is null                                     |
| `unsupported_action`  | `p_action` not in (`water`, `note`)                       |
| `invalid_volume`      | Water action with missing or non-positive `p_volume_ml`   |
| `target_not_owned`    | Selected plant/tent does not belong to `auth.uid()`       |
| `grow_not_owned`      | Defense-in-depth: resolved grow does not belong to caller |

### Reason-code rules

Reason codes **must**:

- Match `^[a-z][a-z0-9_]{2,40}$`.
- Never contain SQL keywords (`select`, `insert`, `update`, `delete`, `from`,
  `where`).
- Never name a schema or table (e.g. `public.`, `auth.`, `grow_events`).
- Never include UUIDs, stack traces, or internal IDs beyond the
  caller-submitted `p_target_id` (which the caller already knows).
- Never echo policy names or trigger names.

## Ownership boundary guarantees

1. `auth.uid()` is the only trusted identity.
2. The plant branch resolves `tent_id` and `grow_id` from the `plants` row
   owned by `auth.uid()`. Client cannot override.
3. The tent branch resolves `grow_id` from the `tents` row owned by
   `auth.uid()`. Client cannot override.
4. A defense-in-depth `EXISTS` check confirms the resolved `grow_id` is owned
   by `auth.uid()`; otherwise returns `grow_not_owned`.
5. All ownership checks run **before** the first `INSERT`. A rejected save
   writes zero rows to `grow_events`, `watering_events`, and
   `environment_events`.
6. Every `INSERT` uses `uid` (the local `auth.uid()` binding), never a
   client-provided value.
7. `EXECUTE` is `REVOKE`d from `PUBLIC` and granted only to `authenticated`.

## Out of scope for this RPC

- Writes to `alerts`.
- Writes to `action_queue`.
- Writes to `ai_doctor_sessions`.
- Any device-control verbs (actuator, relay, pump, dose, valve, switch).
- Any "live", "synced", "connected", or "imported" data classification.

## Regression test surface

The following tests guard this contract. If they fail, do **not** weaken the
tests — fix the RPC or update this document and the test list together.

- `src/test/quicklog-save-manual-rpc-ownership.test.ts` — ownership + insert
  ordering + grant boundary.
- `src/test/quicklog-save-manual-rpc-reason-codes.test.ts` — reason-code
  alignment with this doc, safe-token pattern, no leakage.
- `src/test/quicklog-save-manual-rpc-mixed-boundary.test.ts` — proves no
  client-trusted `user_id` / `grow_id` / `tent_id` parameters exist, so
  mixed-boundary attacks are impossible by input shape.
- `src/test/quicklog-save-manual-rpc-ci-script.test.ts` — confirms the
  targeted CI script and workflow job are wired.

## Targeted CI command

```
bun run test:quicklog-rpc-ownership
```

Runs only the QuickLog v2 RPC ownership/security slice. Wired into
`.github/workflows/ci.yml` as a dedicated job step that must pass before the
full suite.

## Integration harness status

**BLOCKED.** This repo does not currently run a local Supabase/Postgres
instance during CI (only `supabase/tests/permissions.sql` is provided for
manual `psql` runs against a linked DB). Real RPC integration tests that
exercise cross-user rejection with actual row counts are deferred until a
test database harness exists. Smallest setup needed:

1. Add `supabase start` to CI with a seeded test database.
2. Add a Deno or `psql` harness that signs two JWTs (user A, user B), calls
   the RPC, and asserts row counts in `grow_events` / `environment_events`.
3. Move ownership rejection cases from static SQL inspection to live RPC
   calls.

Until then, the static SQL regression suite is the source of truth.
