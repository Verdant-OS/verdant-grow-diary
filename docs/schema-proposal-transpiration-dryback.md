# Schema Proposal — Transpiration Response Dryback Queue

Status: **Documentation only. No migrations, no schema changes, no code.**

This document proposes the future schema shape required to implement
the Transpiration Response dryback recalculation queue. It supersedes
nothing. It does not authorize a migration. It captures the schema
contract that must be approved before any of the stop-ship defects in
`docs/defect-report-dryback-queue-stop-ship.md` can be fixed in code.

Related authoritative documents:

- `docs/spec-transpiration-response-calculation-rules.md`
- `docs/decision-record-dryback-queue-implementation.md`
- `docs/defect-report-dryback-queue-stop-ship.md`
- `src/lib/transpirationResponseRules.ts` (canonical pure rules)
- `fixtures/transpiration-response/golden-windows.json` (golden fixtures)

---

## 1. Existing source tables (expected, must be verified)

These tables are expected to already exist in the project and to be the
**read-only** inputs for any future dryback calculation. Column-level
assumptions are flagged; nothing here should be treated as confirmed
until a schema audit verifies the columns at migration time.

- `public.sensor_readings`
  - Expected role: load-cell / weight readings as the primary,
    high-confidence dryback weight source.
  - Expected fields the dryback path will rely on:
    `tent_id`, `plant_id` (nullable), `captured_at`, `source`
    (`live | manual | csv | demo | stale | invalid`), `raw_payload`,
    plus a metric value column.
  - **Not yet confirmed:** that a load-cell weight metric key exists.
    See §2 for the proposed metric contract.
- Quick Log / diary / grow event tables (for example `diary_entries`,
  `grow_events`, `watering_events`, `feeding_events`)
  - Expected role: user-confirmed irrigation/watering/feed boundaries
    that define the start and end of a dryback window.
  - **Not yet confirmed:** that a single canonical event type exists
    for "irrigation boundary." See §3.
- Identity tables: `grows`, `tents`, `plants`
  - Expected role: ownership and scoping. RLS for any new dryback
    table must descend from these.

Forbidden assumption (explicit, per defect report D4):
**do not** assume `irrigation_events.weight_before_kg` or
`irrigation_events.weight_after_kg` exist. There is no
`irrigation_events` table in this branch, and the dryback feature must
not invent one without product approval.

---

## 2. Weight source proposal

### Primary (high-confidence): load-cell readings in `sensor_readings`

Expected metric contract (to be confirmed against the live schema):

- Metric key: `plant_weight_kg` **or** `container_weight_kg`
  (one canonical key; the other becomes a documented alias).
- Required fields per reading:
  - `captured_at` (timestamptz)
  - `source` (must be `live` for high confidence; `csv` and `manual`
    downgrade per the rules in `transpirationResponseRules.ts`)
  - `tent_id`
  - `plant_id` when attributable (nullable for tent-scoped scales)
  - quality / confidence indicator when the source provides one
  - `raw_payload` preserved (never rendered in UI by default)

### Medium-confidence fallback: manual weight entries

- Source: Quick Log / diary entries with an explicit "manual weight"
  field.
- Treated as `weightSource = 'manual'` in the rules contract.
- Never promoted to `high` confidence even with a clear boundary and
  adequate VPD coverage.

### Explicitly excluded from this proposal

- Soil-moisture-proxy as a weight substitute. The rules module already
  returns `insufficient` for `weightSource = 'soil_moisture_proxy'`;
  the schema must not paper over that.
- Any inferred weight from environmental deltas.

---

## 3. Irrigation boundary proposal

Open decision (must be confirmed with product / cultivation):

- **Option A — reuse existing event types.** Quick Log
  watering/feed/irrigation entries already carry `occurred_at`,
  `tent_id`, `plant_id`, and source. A future view can project them as
  dryback boundaries without a new table.
- **Option B — add a typed `irrigation_boundary_event`.** Cleaner
  semantics, easier indexing, but adds a new write surface.

Recommendation: **start with Option A.** Only introduce a new typed
event if Option A cannot disambiguate watering-vs-feed-vs-manual-reset
boundaries reliably.

Required boundary fields (regardless of option), surfaced to the
calculator as `BoundarySource = 'diary_event' | 'manual_baseline'`:

- `event_id`
- `grow_id`
- `tent_id`
- `plant_id` (optional)
- `occurred_at` (timestamptz)
- `event_type`: `watering | feed | irrigation | manual_reset`
- `source`: `manual | live | csv | demo`
- `notes` / `details`
- optional `post_irrigation_settled_weight_g` reference, **only if**
  a load-cell or manual weight is captured at the same boundary.
  Never invented from telemetry.

`weight_jump_only` and `unknown` boundary sources must continue to
short-circuit to `insufficient` per the rules module.

---

## 4. Candidate dryback window shape (derived / cached)

Purpose: cache the output of `evaluateTranspirationWindow` for fast
reads. Source readings remain immutable; cached results are always
replaceable by recomputation.

Proposed shape (table or materialized view — TBD at migration time):

- `window_id` (uuid, pk)
- `grow_id`, `tent_id`, `plant_id` (plant optional for tent-scope)
- `stage` (matches `TranspirationStage`)
- `start_event_id`, `end_event_id` (nullable for open windows)
- `start_time`, `end_time` (timestamptz)
- `start_weight_g`, `end_weight_g` (numeric, nullable)
- `average_vpd_kpa` (numeric, nullable)
- `size_basis` (`plant_weight_kg | approved_proxy | none`)
- `size_proxy_value` (numeric, nullable; never defaulted to 1)
- `status` (`valid | invalid | stale | insufficient`)
- `confidence` (`high | medium | low | insufficient`)
- `warnings` (text[], sorted, matches rules output)
- `confidence_reasons` (text[], sorted)
- `source_summary` (text[], sorted)
- `calculated_at` (timestamptz)
- `rules_version` (text — pins which calculator version produced this row)
- `raw_calculation_metadata` (jsonb — internal, not surfaced to UI by default)

Rules:

- Derived strictly from source records via the canonical TS calculator.
- Never authored by clients.
- Always recomputable from `sensor_readings` + boundary events.
- Reads scoped by ownership via RLS descending from `grows`/`tents`/`plants`.

---

## 5. Dryback recalculation queue table proposal

Purpose: durable, coalescing work queue for dryback recompute requests.
Replaces all ad-hoc SQL-draining functions; the Edge Function is the
sole drainer (see decision record).

Proposed fields:

- `id` (uuid, pk)
- `grow_id`, `tent_id` (required scope)
- `plant_id` (optional)
- `container_id` (optional; for multi-container tents)
- `status`: `pending | processing | completed | failed`
- `reason` (enum/text — e.g. `new_weight_reading`, `new_boundary_event`,
  `manual_request`, `backfill`)
- `last_requested_at` (timestamptz)
- `request_count` (int, default 1)
- `needs_reprocess` (bool, default false)
- `next_retry_at` (timestamptz, nullable)
- `attempt_count` (int, default 0)
- `max_attempts` (int, default 5)
- `processing_started_at` (timestamptz, nullable)
- `locked_by` (text, nullable — Edge Function invocation id)
- `error_code` (text, nullable)
- `error_message` (text, nullable)
- `metadata` (jsonb, nullable)
- `created_at`, `updated_at` (timestamptz)

Active-row invariant: at most one row per `(grow_id, container_id)`
with status in (`pending`, `processing`).

Queue rules (each one fixes a stop-ship defect):

- **No `ON CONFLICT DO NOTHING`** on the user-facing enqueue path.
  Fresh requests must never be silently dropped (defect D2).
- Explicit coalescing model:
  - Fresh request while `pending` → `UPDATE` row, bump
    `last_requested_at`, increment `request_count`, leave status.
  - Fresh request while `processing` → `UPDATE` row, set
    `needs_reprocess = true`, bump `last_requested_at`, increment
    `request_count`.
  - Completion with `needs_reprocess = true` → reset to `pending`,
    clear processing lock, clear `needs_reprocess`. **Do not** mark
    completed.
  - Completion with no new request → mark `completed`.
  - Fresh request against a `failed` row → reopen as `pending` with
    fresh metadata (attempt_count reset, next_retry_at cleared).
- Claim queries must filter
  `(next_retry_at IS NULL OR next_retry_at <= now())` (defect D6).
- Visibility-timeout reaper recovers `processing` rows older than the
  configured timeout (defect D7). Default provisional: 10 minutes.
- `max_attempts` reached → `failed` with `error_code`/`error_message`,
  not silently retried (defect D7).
- Jitter bound on retry: **±20%**, asserted by tests (defect D8).

---

## 6. RLS and security notes

Required posture for any table introduced under this proposal:

- Ownership descends from `grows` → `tents` → `plants`. The queue and
  window tables must enforce RLS such that the authenticated user can
  only read rows scoped to grows they own.
- **No client-supplied `user_id` is trusted.** Server uses `auth.uid()`
  or a verified JWT user only.
- Writes to the queue and the cached window table happen through
  trusted server paths (RPC or Edge Function with `service_role`),
  never directly from the browser.
- `service_role` key never appears in client code, never in any file
  under `src/`.
- Bridge tokens never appear in UI or client logs.
- `raw_payload` from `sensor_readings` and `raw_calculation_metadata`
  from cached windows must not be rendered in the default UI surface.
- All four required GRANTs must accompany every new `public` table per
  the project's grant policy: `CREATE TABLE`, `GRANT`, `ENABLE RLS`,
  `CREATE POLICY` — in that order, in the same migration.

---

## 7. Confidence contract

- **Canonical confidence derivation lives in TypeScript**, in
  `evaluateTranspirationWindow` (`src/lib/transpirationResponseRules.ts`).
- The cached window table stores only the derived `confidence` value.
- **SQL must never hardcode `confidence = 'high'`** (defect D5). This
  applies to triggers, RPCs, views, and Edge Functions.
- If a future performance need forces SQL-side confidence derivation,
  it must:
  - exactly mirror the TS contract, and
  - be covered by parity tests that run the same inputs through both
    the SQL path and `golden-windows.json` and assert equal outputs.
- Until parity tests exist, SQL paths that need a confidence value
  must store the **conservative floor** (`low` or `insufficient`),
  never `high`.

---

## 8. Stop-ship schema conditions

Any future PR that introduces this schema is automatically stop-ship
if **any** of the following are true:

1. Weight source is not defined or is silently inferred from non-weight
   telemetry.
2. Boundary event source is not defined, or weight-jump-only windows
   are allowed to produce non-`insufficient` results.
3. The enqueue path can silently drop a fresh recalculation request
   (e.g. `ON CONFLICT DO NOTHING` on the user-facing path).
4. RLS ownership plan is missing, weak, or trusts client-supplied
   `user_id`.
5. Any path defaults `confidence` to `high`.
6. Stale, invalid, missing, or unrealistic inputs can surface as
   healthy / high-confidence in the cached window table or any
   downstream read.
7. The same PR introduces alerts, Action Queue writes, AI Doctor calls,
   automation, or device control. Those are out of scope for the
   dryback queue and must land in separate, explicitly-approved work.

---

## 9. Future implementation phases

Staged, smallest-safe-step order. Each phase is gated by the previous
phase passing review and tests.

- **Phase 1 — Schema migration proposal + tests.**
  Author the actual migration matching this document, plus pgTAP /
  `supabase/tests/*.sql` coverage. No application code yet.
- **Phase 2 — Candidate window assembler.**
  Pure TS module that walks source readings + boundary events and
  produces `TranspirationWindowInput` records. Reuses
  `evaluateTranspirationWindow`. No DB writes.
- **Phase 3 — Queue table + coalescing enqueue RPC.**
  Implements the explicit coalescing model from §5. Backed by SQL
  tests for every coalescing branch.
- **Phase 4 — Edge Function drain / claim / retry.**
  Single execution model. Visibility timeout reaper. ±20% jitter.
  No SQL-draining function may coexist (defect D1).
- **Phase 5 — Read-only diagnostics UI.**
  Presentation-only surface over the cached window table. No writes,
  no alerts, no Action Queue integration, no device control.

---

## 10. Files changed

- **Created:** `docs/schema-proposal-transpiration-dryback.md` (this file)

No code, schema, migration, RLS, Edge Function, RPC, UI, alert, Action
Queue, AI Doctor, or device-control changes were made.

---

## 11. Safety verdict

**SAFE.** Documentation-only. No runtime impact. Implementation
remains BLOCKED on product approval of §2 (weight source), §3
(boundary source), and the provisional retry/visibility values in §5.

## 12. Remaining open questions

1. Confirm load-cell metric key — `plant_weight_kg` vs.
   `container_weight_kg` vs. both?
2. Confirm Option A (reuse Quick Log) vs. Option B (typed
   `irrigation_boundary_event`) for §3.
3. Product approval of provisional defaults: `max_attempts = 5`,
   visibility timeout = 10 minutes, jitter = ±20%.
4. Confirm cached window storage shape — table vs. materialized view —
   based on expected recompute frequency.
5. Confirm whether `container_id` is needed in scope keys now, or
   deferred until multi-container tents are modeled.

## 13. Rollback notes

Single Markdown file. Rollback = `rm docs/schema-proposal-transpiration-dryback.md`.
No runtime impact.
