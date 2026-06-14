# Defect Report — Dryback Recalculation Queue (Stop-Ship Audit)

Status: **BLOCKED — nothing to fix in this branch.**
Safety verdict: **STOP-SHIP** for any future implementation that ignores
the defects listed below. The current branch contains none of the
implicated code, so no production defects exist *yet*; this document
exists to make sure they never land.

---

## 1. Audit scope

I searched the entire repository and the Lovable Cloud database for any
of the following before writing a single line of fix code:

- File search:
  - `rg -l "dryback"` → **0 files**
  - `rg -l "process_dryback|dryback_recalc|recalculate_dryback|irrigation_events|weight_before_kg|weight_after_kg"` → **0 files**
- Database search:
  - `information_schema.tables` for `%dryback%`, `%irrigation%`, `%recalc%` → **0 rows**
- Migrations directory: no migration mentioning a dryback queue,
  `process_dryback_recalculation_queue`, or `recalculate_dryback_for_container`.
- Edge Functions (`supabase/functions/*`): no function that drains or
  processes a dryback recalculation queue.

### Audit conclusion

The "recent dryback recalculation queue / migration / Edge Function"
described in the task does **not exist in this branch**. The only
Transpiration-Response-adjacent code is the pure, deterministic
calculation skeleton:

- `src/lib/transpirationResponseRules.ts`
- `src/test/transpiration-response-rules.test.ts`
- `src/test/transpiration-response-golden-fixtures.test.ts`
- `fixtures/transpiration-response/golden-windows.json`

These are pure rules — they do **not** read or write any queue, do not
touch Supabase, do not invoke Edge Functions, and do not assume an
`irrigation_events` table.

### Schema assumption that fails the precondition

The task says:

> Verify whether `irrigation_events.weight_before_kg` and
> `irrigation_events.weight_after_kg` exist. If those columns do not
> exist, stop implementation and return BLOCKED with exact missing
> schema assumptions.

They do not exist. There is no `irrigation_events` table at all. Per
the explicit instruction, implementation is **BLOCKED**.

---

## 2. Defects (catalogued for any future PR that introduces this queue)

Each defect below MUST be addressed before a dryback queue ships.
A future PR that reintroduces any of these is automatically stop-ship.

### D1 — Two overloaded `process_dryback_recalculation_queue` functions
- **Severity:** Critical (stop-ship)
- **Root cause:** Two functions with the same name but different
  execution models (SQL-draining `p_max_items int` vs.
  per-container/per-grow RPC) coexist. Callers cannot tell which one
  runs; PostgREST overload resolution can silently flip.
- **Safety impact:** Two execution models = unpredictable recalculation
  cadence, double-processing, lost work.
- **Required fix:** Keep **exactly one** execution model.
  - Edge Function claims/drains queue items.
  - One per-container/per-grow RPC (e.g. `recalculate_dryback_for_container`)
    processes a single scope.
  - **Delete** any SQL-draining `process_dryback_recalculation_queue(p_max_items int)`.

### D2 — Pending uniqueness silently drops fresh recalculation requests
- **Severity:** Critical (stop-ship)
- **Root cause:** Partial unique index + `ON CONFLICT DO NOTHING` on
  enqueue means a fresh request arriving while an older row is
  `pending` / `processing` / `retrying` is dropped on the floor.
- **Safety impact:** Telemetry that should trigger a new calculation
  is silently ignored. Grower sees stale dryback as if it were current.
- **Required fix:** Explicit coalescing model:
  - At most one **active** row per `(grow_id, container_id)`.
  - New request while `pending`: `UPDATE` →
    `last_requested_at = now()`, `request_count = request_count + 1`,
    keep `status = 'pending'`.
  - New request while `processing`: `UPDATE` →
    `needs_reprocess = true`, `last_requested_at = now()`,
    `request_count = request_count + 1`.
  - Edge Function completion path:
    - if `needs_reprocess` → set `status = 'pending'`, clear processing
      lock, clear `needs_reprocess`, preserve attempt metadata.
    - else → `status = 'completed'`.
  - New request while `failed` → reopen as `pending` with fresh metadata.
  - **Never** `ON CONFLICT DO NOTHING` on the user-facing enqueue path.

### D3 — Partial unique index / `ON CONFLICT` not tested against real DB
- **Severity:** High
- **Root cause:** Behavior eyeballed, not exercised against a real
  Postgres instance. Partial indexes interact subtly with
  `ON CONFLICT` target inference.
- **Required fix:** SQL-level tests (pgTAP or repo's existing
  `supabase/tests/*.sql` harness) that exercise the actual migration
  in a real database, including conflict-target inference.

### D4 — Assumed but missing schema (`irrigation_events.weight_before_kg`, `weight_after_kg`)
- **Severity:** Critical (blocks the entire feature)
- **Root cause:** Calculation contract assumes columns that are not in
  the schema and not in any migration in this branch.
- **Required fix (precondition before any queue work):**
  - Cultivation/product confirm whether the source of truth is
    `irrigation_events` + settled weight columns, or load-cell readings
    in `sensor_readings`, or a manual-weight diary surface.
  - Add a migration that creates the columns/table with documented
    semantics:
    - **Start window weight:** post-irrigation settled / baseline weight.
    - **End window weight:** pre-next-irrigation weight.
  - Add schema-assertion tests so a future drift fails CI loudly.

### D5 — Hardcoded `confidence = 'high'`
- **Severity:** Critical (stop-ship — violates safety rules)
- **Root cause:** RPC writes `'high'` literally rather than deriving
  confidence from inputs.
- **Safety impact:** Stale / invalid / missing data presented as
  high-confidence. Direct violation of "bad or unknown telemetry must
  never be classified as healthy."
- **Required fix:** Derive confidence per the contract in
  `docs/spec-transpiration-response-calculation-rules.md` and
  `src/lib/transpirationResponseRules.ts`:
  - `high` only when load-cell weight + qualified size proxy + clear
    boundary + adequate VPD coverage.
  - `medium` only when manual weight + qualified size proxy + clear
    boundary + adequate VPD coverage.
  - `low` for size-unnormalized fallback or sparse VPD coverage.
  - `insufficient` for missing / stale / invalid / unrealistic inputs.
  - If a faithful derivation cannot be expressed at the SQL/RPC layer
    yet, **store conservative `low` or `insufficient`** and document
    the gap. **Never** default to `high`.

### D6 — Queue fetch ignores `next_retry_at`
- **Severity:** High
- **Root cause:** SELECT path does not filter `next_retry_at <= now()`.
- **Safety impact:** Failed items retried immediately, no backoff,
  thundering herd on the Edge Function.
- **Required fix:** All claim queries include
  `WHERE (next_retry_at IS NULL OR next_retry_at <= now())`.

### D7 — Processing items stuck forever on Edge Function crash
- **Severity:** High
- **Root cause:** No visibility timeout / reaper. A row that goes
  `processing` stays `processing` forever if the function dies.
- **Required fix:**
  - Stamp `processing_started_at` when claimed.
  - Reaper (cron or in-fetch sweep) resets `processing` rows older
    than the configured visibility timeout back to `pending` (with
    `attempt_count + 1`, `next_retry_at = now() + backoff + jitter`).
  - After `max_attempts`, mark `failed` with `last_error` metadata.

### D8 — Jitter code/docs disagreement
- **Severity:** Medium
- **Root cause:** Docs say ±20% but code uses ±40% (or vice versa).
- **Required fix:** Pick one. Prefer **±20%**. Make code and docs
  agree, and pin it with a test that asserts the bound.

---

## 3. Required tests (when the queue is actually built)

These are the tests that must pass before this feature ships. Listed
here so the future implementer cannot "forget" any.

1. Migration compiles cleanly against a real database.
2. No overloaded `process_dryback_recalculation_queue` remains
   (`pg_proc` count assertion).
3. Trigger / enqueue creates a queue request for a `(grow, container)`.
4. Fresh request while same scope is `pending` → coalesces via
   `UPDATE`, not dropped.
5. Fresh request while same scope is `processing` → sets
   `needs_reprocess = true`.
6. Completion with `needs_reprocess = true` → requeues as `pending`,
   does not mark `completed`.
7. Completion with no new request → marks `completed`.
8. `failed` row reopened by a fresh request.
9. Fetch path only returns due items (`next_retry_at <= now()`).
10. Not-due items skipped.
11. Stuck `processing` row older than visibility timeout recovered.
12. `max_attempts` reached → `failed` with `last_error` metadata.
13. Missing / invalid weight, VPD, or size → confidence is **never**
    `high`. Assert against `transpirationResponseRules` golden fixtures.
14. Grep / static assertion: no `confidence = 'high'` literal in the
    RPC or Edge Function.
15. Schema assertion: `irrigation_events.weight_before_kg` and
    `weight_after_kg` exist with documented semantics.
16. Partial-index / `ON CONFLICT` behavior verified against real DB,
    not eyeballed.
17. Jitter bound matches docs (±20%).
18. Static safety: no device control, no Action Queue writes, no AI
    Doctor calls, no alert creation, no `service_role` in client code,
    no RLS weakening, no client-trusted `user_id`.

---

## 4. Files changed in this PR

- **Created:** `docs/defect-report-dryback-queue-stop-ship.md` (this file)

No code, schema, RLS, Edge Function, or test files changed. The pure
Transpiration Response rules and their tests are untouched, as required.

---

## 5. Validation

- `rg` audits above: 0 hits, confirming nothing to fix.
- `information_schema.tables` audit: 0 hits, confirming no queue table.
- Transpiration Response pure-rule tests: unchanged, still green from
  the previous slice (40 tests).
- No migration was authored, so no migration validation was run.

---

## 6. Safety verdict

**BLOCKED on schema preconditions (D4).**
**STOP-SHIP** for any future PR that lands without fixing D1, D2, D5,
or D7 — those alone are each sufficient to drop fresh recalculation
requests or to classify bad telemetry as healthy.

---

## 7. Remaining risks / follow-up

- Cultivation/product must confirm the dryback weight source of truth
  before any schema work (load-cell `sensor_readings` vs. dedicated
  `irrigation_events` columns vs. manual diary weight).
- Confidence derivation at the SQL/RPC layer is non-trivial; the safest
  near-term path is to compute it in TypeScript using
  `evaluateTranspirationWindow` and have the RPC store only the
  derived result, never a literal.
- Visibility timeout, max attempts, and jitter bound need explicit
  product-approved values before implementation.

## 8. Rollback notes

This PR adds a single Markdown file. Rollback = delete
`docs/defect-report-dryback-queue-stop-ship.md`. No runtime impact.
