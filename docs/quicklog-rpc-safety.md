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

| Param                                            | Trusted? | Purpose                                                                      |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------- |
| `p_target_type`                                  | enum     | `'plant'` or `'tent'` — anything else returns a safe reason code             |
| `p_target_id`                                    | uuid     | The selected target row; ownership resolved via DB                           |
| `p_action`                                       | enum     | `'water'` or `'note'`                                                        |
| `p_volume_ml`                                    | numeric  | Required > 0 when action = `water`                                           |
| `p_note`                                         | text     | Optional free text, nullable                                                 |
| `p_temperature_c`, `p_humidity_pct`, `p_vpd_kpa` | numeric  | Optional manual sensor snapshot                                              |
| `p_occurred_at`                                  | tstz     | Optional; defaults to `now()`                                                |
| `p_details`                                      | jsonb    | Optional object; `logged_at` must be a valid explicit-zone RFC3339 timestamp |
| `p_idempotency_key`                              | text     | Optional stable retry key (8–200 characters when present)                    |
| `p_stage`                                        | text     | Optional allow-listed cultivation stage                                      |

There is **no** `p_user_id`, **no** `p_grow_id`, and **no** `p_tent_id`. The
grow and tent are always resolved from the selected plant/tent row owned by
`auth.uid()`. This makes mixed-boundary attacks (plant in grow B but client
claims grow A) impossible by input shape.

## Captured versus occurred time

`logged_at` is capture/record time only. `grow_events.occurred_at` and
`diary_entries.entry_at` remain the grower-reported occurrence time and may be
backdated.

- The two Quick Log wrappers validate one canonical `details.logged_at`, pass
  it through a transaction-local trusted context, and persist it on the event
  and diary mirror.
- Direct compatibility writers do not have that trusted context. Their
  `logged_at` is server-stamped at insertion; caller JSON, an explicit column
  value, and occurrence time cannot supply capture time.
- Historical diary JSON is accepted during the forward backfill only when it
  parses and is within five minutes of the row's server `created_at`.
  Otherwise, diary rows use `created_at`. Linked grow events inherit the
  chosen diary capture; unmatched grow events use their own `created_at`.
- An exact retry of a pre-migration event request may reuse its original row
  even if its legacy `details.logged_at` is malformed or now too far in the
  future. Legacy request-hash equality is checked before new field validation;
  any changed payload still fails closed.
- The event wrapper validates raw `p_details` before timestamp normalization.
  Every valid JSON shape receives a compact, type-tagged internal request
  fingerprint so changed and cross-shape retries conflict. Valid grower object
  fields are reconstructed after the delegate returns; the fingerprint itself
  never becomes grower-facing plant memory.

## Allowed safe reason codes

The RPC returns `jsonb` of shape `{ ok: boolean, reason?: text, ... }`. When
`ok = false`, `reason` is one of the following short tokens. These tokens are
the **only** strings the RPC may put in `reason`. Adding a new code requires
updating this list and the regression tests in the same change.

| Code                      | Meaning                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `not_authenticated`       | `auth.uid()` is null                                                  |
| `invalid_target_type`     | `p_target_type` not in (`plant`, `tent`)                              |
| `missing_target_id`       | `p_target_id` is null                                                 |
| `unsupported_action`      | `p_action` not in (`water`, `note`)                                   |
| `invalid_volume`          | Water action with missing or non-positive `p_volume_ml`               |
| `invalid_details`         | `p_details` is present but is not a JSON object                       |
| `invalid_idempotency_key` | Retry key is present but outside its length bounds                    |
| `invalid_logged_at`       | Captured timestamp is malformed, impossible, or too far in the future |
| `target_not_owned`        | Selected plant/tent does not belong to `auth.uid()`                   |
| `grow_not_owned`          | Defense-in-depth: resolved grow does not belong to caller             |
| `save_failed`             | Atomic persistence failed; no raw database error is exposed           |

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
- `src/test/quicklog-dual-timestamp-foundation.test.ts` — safe legacy parsing,
  owner/grow mirror correlation, timestamp parity, grants, and scope fences.
- `scripts/run-quicklog-dual-timestamp-rls-harness.ts` — local-only runtime
  proof for both RPC variants, retries, duplicate/spoofed mirrors, untouched
  writers, malformed JSON, and anonymous grant denial.

## Targeted CI command

```
bun run test:quicklog-rpc-ownership
```

Runs only the QuickLog v2 RPC ownership/security slice. Wired into
`.github/workflows/ci.yml` as a dedicated job step that must pass before the
full suite.

## Integration harness status

`scripts/run-quicklog-dual-timestamp-rls-harness.ts` runs against the
disposable local Supabase replay lane. It signs in two temporary users through
the anonymous client boundary, exercises both RPCs, verifies persisted rows
with the local administrative client, and tears every fixture down in
`finally`. The harness refuses any non-loopback API host, so this test cannot
write to a hosted project.

The existing static SQL regressions remain required and complementary: runtime
behavior proves the applied database contract, while static tests ensure the
forward migration continues to encode safe parsing, deterministic same-owner
correlation, fixed search paths, and authenticated-only grants.
