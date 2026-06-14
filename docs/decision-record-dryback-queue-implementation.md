# Decision Record — Dryback Recalculation Queue Implementation

**Status:** BLOCKED — documentation only. No queue table, no RPC, no Edge Function, no migration.
**Related docs:**
- `docs/defect-report-dryback-queue-stop-ship.md`
- `docs/spec-transpiration-response-calculation-rules.md`
- `src/lib/transpirationResponseRules.ts`

**Decision date:** 2026-06-14  
**Owner:** Engineering + Cultivation lead  
**Scope:** This document defines the intended implementation model for a future dryback recalculation queue. It does **not** create production code, schema, RLS, RPC, Edge Functions, UI, alerts, Action Queue, AI Doctor, or device-control wiring.

---

## 1. Weight source of truth

### Options considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. Load-cell readings from `sensor_readings` | High-cadence weight telemetry with `source = "live"` or `"manual"`. | Already exists; preserves sensor-truth rules (captured_at, raw_payload, confidence). | Requires stable tare; load cell may not be present for every grow. |
| B. Manual weight entries from Quick Log / diary | Grower-entered weight snapshots. | Works without hardware; diary-first philosophy. | Lower cadence; human error; no raw_payload. |
| C. Dedicated `irrigation_events.weight_before_kg` / `weight_after_kg` | Schema-native weight fields on an irrigation event table. | Tight coupling to irrigation boundary semantics. | **Does not exist today**; would require schema migration and cultivation sign-off. |
| D. Hybrid model | Load-cell primary, manual fallback, irrigation-event fields only if explicitly added later. | Flexible; matches mixed hardware reality. | More complex ingestion logic. |

### Recommended stance: **Option D — Hybrid, load-cell primary**

1. **Load-cell readings from `sensor_readings` are the primary high-confidence source.**
   - Must include `source`, `captured_at`, `tent_id`, `confidence`, and `raw_payload` per sensor-truth rules.
   - Allowed labels: `live`, `manual`, `csv`, `demo`, `stale`, `invalid`.
   - Never present `demo` or `stale` readings as live.

2. **Manual weight entries are acceptable as medium-confidence fallback.**
   - Must be clearly labeled `manual`.
   - Must include captured timestamp.
   - Cannot achieve `high` confidence per the calculation contract.

3. **Do not assume `irrigation_events.weight_before_kg` / `weight_after_kg` unless a future schema decision explicitly adds them.**
   - If cultivation/product later requests dedicated irrigation-event weight columns, that must become a separate decision record with its own migration, RLS, and test plan.
   - Until then, the queue must build candidate windows from `sensor_readings` + diary events, not from assumed columns.

---

## 2. Dryback window boundaries

### Options considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. Quick Log watering / feed events | Existing diary entries already represent grower-confirmed irrigation. | Diary-first; no new table. | Diary events are not currently typed as "irrigation boundary"; may need event-type labeling. |
| B. Dedicated `irrigation_events` table | Schema-native irrigation boundaries with explicit timestamps. | Strong semantics; purpose-built. | Table does not exist; new migration + RLS + test burden. |
| C. Inferred weight jumps | Algorithm detects sudden weight increases as proxy for irrigation. | Fully automatic. | Unreliable — weight jumps can also mean media disturbance, sensor re-tare, or equipment movement. |
| D. Hybrid — user-confirmed primary, weight-jump corroborating only | Diary/irrigation events define boundaries; weight jumps are sanity-checked but never sole authority. | Safe; grower stays in control. | Slightly more ingestion complexity. |

### Recommended stance: **Option D — Hybrid, user-confirmed primary**

1. **User-confirmed watering, feeding, or irrigation events are the primary boundary source.**
   - If an `irrigation_events` table is created later, its timestamps are authoritative.
   - Until then, Quick Log diary entries tagged as watering/feeding are the boundary source.

2. **Weight jumps are corroborating only.**
   - A weight jump can *suggest* an irrigation event, but it cannot define a window by itself.
   - Any window whose boundary source is `weight_jump_only` must be rejected by the rules contract (`evaluateTranspirationWindow` returns `insufficient`).

3. **Weight-jump-only windows are insufficient.**
   - The pure rules skeleton already enforces this: `boundarySource === "weight_jump_only"` → `status: "insufficient"`.
   - A future queue must never synthesize a valid window from weight jumps alone.

---

## 3. Confidence derivation

### Options considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. TypeScript only (`evaluateTranspirationWindow`) | Canonical confidence logic lives in the pure rules module. SQL/RPC stores the result. | Single source of truth; testable; no SQL duplication. | Requires the queue worker to call TypeScript (e.g., Edge Function). |
| B. SQL-only reimplementation | Confidence derived entirely inside Postgres RPC. | No cross-boundary call. | Duplicates the contract; hard to keep in sync; easy to accidentally hardcode `high`. |
| C. Hybrid — SQL assembles candidate, TypeScript evaluates, SQL stores | SQL finds windows and VPD; TypeScript computes metrics and confidence; SQL writes result. | Clean separation; SQL stays simple. | Slightly more RPC/Edge Function surface. |

### Recommended stance: **Option C — Hybrid, canonical confidence stays in TypeScript**

1. **Canonical confidence stays in TypeScript via `evaluateTranspirationWindow`.**
   - The existing pure rules module is the single source of truth for:
     - `high` — load-cell + qualified size proxy + clear boundary + adequate VPD.
     - `medium` — manual weight + qualified size proxy + clear boundary + adequate VPD.
     - `low` — size-unnormalized fallback or sparse VPD coverage.
     - `insufficient` — missing / stale / invalid / unrealistic inputs.

2. **SQL / RPC may assemble candidate windows later, but must not hardcode `high`.**
   - If an RPC assembles inputs (weight, VPD, stage) into a candidate window, it must pass that window to `evaluateTranspirationWindow` or store only the derived result.
   - **Never** write a literal `'high'` confidence from SQL, RPC, or Edge Function.
   - If a faithful derivation cannot be expressed at the SQL/RPC layer yet, store `low` or `insufficient` and document the gap.

3. **Avoid duplicating the confidence contract in SQL unless absolutely necessary.**
   - If performance demands push confidence logic into SQL, the SQL must be kept in sync with the TypeScript contract via golden-fixture regression tests.
   - Until then, prefer calling `evaluateTranspirationWindow` from the Edge Function worker.

---

## 4. Queue execution model

### Decision

| Rule | Value |
|------|-------|
| Draining agent | **Edge Function** claims and processes queue items. |
| SQL looping | **Forbidden.** No SQL function loops over or drains the queue. |
| RPC scope | Any RPC must process **one explicit grow / container / window scope only**. |
| Overloaded names | **Forbidden.** No two functions with the same name and different queue behavior. |

### Rationale

- Edge Functions run outside the database transaction, avoiding long-lived Postgres locks and giving visibility-timeout recovery for free if the function crashes.
- A single per-scope RPC is easier to test, audit, and retry than a batch SQL drainer.
- Overloaded function names (e.g., two `process_dryback_recalculation_queue` definitions) create silent PostgREST resolution bugs.

---

## 5. Queue coalescing model

### Decision

**Do not use `ON CONFLICT DO NOTHING` for new recalculation requests.**

Use explicit coalescing fields:

| Field | Purpose |
|-------|---------|
| `last_requested_at` | Timestamp of the most recent user or trigger request for this scope. |
| `request_count` | Monotonically increasing counter of how many times this scope was requested while already active. |
| `needs_reprocess` | Boolean. Set to `true` when a new request arrives while the item is `processing`. |
| `next_retry_at` | Timestamp after which a failed or timed-out item may be claimed again. |
| `attempt_count` | How many times the worker has tried to process this item. |
| `processing_started_at` | When the current claim began; used for visibility-timeout reaper. |
| `locked_by` | Optional worker instance ID for observability. |

### Expected behavior

1. **New request while `pending`** → `UPDATE` the existing row:
   - `last_requested_at = now()`
   - `request_count = request_count + 1`
   - Status stays `pending`.

2. **New request while `processing`** → `UPDATE` the existing row:
   - `needs_reprocess = true`
   - `last_requested_at = now()`
   - `request_count = request_count + 1`
   - Status stays `processing` (worker will handle it on completion).

3. **Completion with `needs_reprocess = true`** → Requeue:
   - `status = 'pending'`
   - Clear `needs_reprocess`
   - Clear processing lock (`locked_by`, `processing_started_at`)
   - Preserve `attempt_count` and `request_count`.

4. **Completion with `needs_reprocess = false`** → Mark completed.

5. **Failed item (`max_attempts` reached or permanent error)** → `status = 'failed'` with `last_error` metadata.
   - A fresh request for the same scope reopens it as `pending` with reset `attempt_count`.

6. **Fresh recalculation requests must never be silently dropped.**
   - `ON CONFLICT DO NOTHING` on the enqueue path is a stop-ship defect.

---

## 6. Retry / visibility timeout defaults

These values are **provisional** and must be approved by product before implementation.

| Parameter | Proposed default | Rationale |
|-----------|------------------|-----------|
| `max_attempts` | **5** | Enough for transient failures (network, cold start) without infinite retry spam. |
| `base_retry_delay_seconds` | **30** | Fast enough for interactive dryback updates; slow enough to avoid thundering herd. |
| `max_retry_delay_seconds` | **900** (15 minutes) | Caps backoff so a stale grow isn't stuck for hours. |
| `jitter_percent` | **±20%** | Prevents synchronized retries. Code and docs must agree. |
| `visibility_timeout_seconds` | **600** (10 minutes) | Longer than expected window calculation; short enough to recover quickly from a crashed worker. |
| `stuck_processing_recovery` | Cron or in-fetch sweep resets `processing` rows older than visibility timeout back to `pending` with `attempt_count + 1` and `next_retry_at = now() + backoff + jitter`. | Prevents items stuck forever after an Edge Function crash. |

### Stop-ship if any of the following are missing

- `next_retry_at` filtering on claim queries.
- Visibility timeout / stuck-processing recovery.
- Jitter bound that matches documented value (±20%).
- `max_attempts` cap that safely marks items failed rather than retrying forever.

---

## 7. Stop-ship conditions

A future dryback queue implementation must **not ship** if any of the following remain true:

1. **Fresh recalculation requests can be silently dropped.**
   - Must use explicit coalescing (`UPDATE`, not `ON CONFLICT DO NOTHING`).

2. **Hardcoded `confidence = 'high'`.**
   - Confidence must be derived from `evaluateTranspirationWindow` or a provably equivalent contract.

3. **Duplicate queue execution models exist.**
   - Exactly one draining agent (Edge Function). Exactly one per-scope RPC. No overloaded names.

4. **Missing weight source schema.**
   - If the implementation assumes `irrigation_events.weight_before_kg` / `weight_after_kg`, those columns must exist with documented semantics and RLS.

5. **No `next_retry_at` filtering.**
   - Claim queries must respect `next_retry_at <= now()`.

6. **No stuck-processing recovery.**
   - `processing` rows older than the visibility timeout must be automatically recoverable.

7. **Missing or stale data can appear healthy.**
   - Stale weight, invalid VPD, or unknown source must never produce `high` confidence or a `valid` status.

8. **Any device control, Action Queue write, alert creation, or AI Doctor change is added by this queue.**
   - The dryback queue is a **calculation-only** pipeline. It may compute metrics and store results. It must not create alerts, write to Action Queue, call AI Doctor, or control devices.

---

## 8. Tests required before future implementation

Before the queue goes to production, the following tests must pass:

### Migration & schema
1. Migration compiles cleanly against a real database.
2. Schema assertion: required queue table columns exist (`last_requested_at`, `request_count`, `needs_reprocess`, `next_retry_at`, `attempt_count`, `processing_started_at`).
3. Schema assertion: `irrigation_events.weight_before_kg` and `weight_after_kg` exist **only if** the implementation depends on them.

### Queue behavior
4. Enqueue creates a queue request for a `(grow, container)` scope.
5. Fresh request while same scope is `pending` → coalesces via `UPDATE`, not dropped.
6. Fresh request while same scope is `processing` → sets `needs_reprocess = true`.
7. Completion with `needs_reprocess = true` → requeues as `pending`, does not mark `completed`.
8. Completion with no new request → marks `completed`.
9. Failed item reopened by a fresh request.
10. Fetch path only returns due items (`next_retry_at <= now()`).
11. Not-due items are skipped.
12. Stuck `processing` row older than visibility timeout is recovered.
13. `max_attempts` reached → `failed` with `last_error` metadata.

### Confidence & rules contract
14. Missing / invalid weight, VPD, or size → confidence is **never** `high`.
15. Assert against `transpirationResponseRules` golden fixtures for expected confidence values.
16. Grep / static assertion: no `confidence = 'high'` literal in RPC or Edge Function.

### Static safety
17. No device-control imports.
18. No Action Queue writes.
19. No alert creation.
20. No AI Doctor calls.
21. No `service_role` in client code.
22. No RLS weakening.

---

## 9. Parked items

These topics are intentionally out of scope for the queue implementation and will be addressed in future decision records:

- **Mixed-stage windows:** How to split or downgrade confidence when a plant changes stage inside a dryback window.
- **Soil moisture proxy un-parking:** If/when `moistureResponseProxy` becomes a real metric, its confidence rules and labeling must be defined separately.
- **Real-time streaming dryback:** Continuous weight telemetry that updates a live dashboard. The queue is batch/recalculation only.
- **Automated irrigation trigger feedback loop:** The queue must never close the loop from dryback calculation → irrigation command.

---

## 10. Safety verdict

**SAFE to document.** This file is Markdown only. No production code, schema, RLS, RPC, Edge Function, UI, alert, Action Queue, AI Doctor, or device-control wiring was created.

**BLOCKED for implementation** until:
- Cultivation/product confirms the weight source of truth (load-cell `sensor_readings` vs. manual vs. dedicated irrigation-event columns).
- Product approves the provisional retry / visibility timeout defaults.
- A migration exists that satisfies the schema preconditions in `docs/defect-report-dryback-queue-stop-ship.md` (D4).

---

## 11. Remaining open questions

1. **Weight source of truth confirmation:** Does cultivation prefer load-cell `sensor_readings` as the primary source, or do they want dedicated `irrigation_events` weight columns?
2. **Diary event typing:** Do Quick Log watering/feed entries need an explicit "irrigation boundary" event type, or is the existing diary schema sufficient?
3. **Product-approved timeouts:** Are the provisional defaults (`max_attempts = 5`, `visibility_timeout = 10 minutes`, `jitter = ±20%`) acceptable?
4. **Confidence derivation location:** If performance demands push some logic to SQL, how do we keep the SQL contract in sync with the TypeScript golden fixtures?
5. **Stuck-processing reaper cadence:** Should recovery run as a Supabase cron job, a second Edge Function, or an in-fetch sweep inside the primary worker?

---

## Document control

| Field | Value |
|-------|-------|
| Document | Decision Record — Dryback Recalculation Queue Implementation |
| Feature ID | transpiration-response-dashboard |
| Version | 1.0 |
| Created | 2026-06-14 |
| Owner | Engineering + Cultivation lead |
