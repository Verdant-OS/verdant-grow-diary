# Irrigation Evidence Ledger V1 — Implementation Plan

**Branch:** `claude/irrigation-evidence-ledger-v1`
**Deploy base:** `b724db11c4918fc179f452116b9f32ee6ce0e062` (origin/verdant-grow-diary tip, #379). Fresh worktree; NOT stacked on PR #377 / genetics.
**Author:** Claude (Opus 4.8), 2026-07-20. Draft PR target: `verdant-grow-diary`. **Do not merge / deploy / db push / touch production data.**

---

## 0. Scope refinement from the audit (IMPORTANT — read first)

The mission premise "the existing V2 Water UI records only volume; extend the canonical payload" is **outdated**. The structured watering path already exists live, end-to-end:
- `src/lib/writeQuickLogWateringTypedEvent.ts` → calls canonical `quicklog_save_event` with `p_water` = `{volume_ml, ph, ec_ms_cm, runoff_ml, runoff_ph, runoff_ec, water_temp_c}`.
- `src/lib/quickLogWateringFormViewModel.ts`, `src/lib/quickLogWateringReviewViewModel.ts`, `src/components/QuickLogWateringForm.tsx`.
- The v2 RPC already whitelists those keys and stores them in `public.watering_events`. Review labels EC "Input EC (mS/cm)" / "Runoff EC (mS/cm)" — never µS/cm.

**Every field the mission lists for Slice 3 already flows through the canonical path.** Therefore:
- Slice 3 is **compose the existing pure VMs + the existing canonical writer into a standalone `<StructuredWateringEntry>` drop-in** — reuse, not a new payload. Reviving the *dead* `src/lib/writeWateringTypedEvent.ts` (→ a hypothetical `create_watering_event` RPC) is the exact forbidden second write path and is avoided.
- The genuinely-new, high-value work is: **Slice 2** (fix the untented-plant boundary defect + tighten payload + add request-hash idempotency), **Slice 4** (deterministic keyset-paginated tent ledger — no such thing exists in the repo), and **Slice 5** (runtime proof).

This is surfaced in the PR and to the user; the mission's core value is intact and delivered.

---

## 1. Audit findings

### 1.1 The confirmed defect (Slice 2 core)
`public.quicklog_save_event` latest = `supabase/migrations/20260707220000_quicklog_save_event_atomic_idempotency_v2.sql` (12-arg, `CREATE OR REPLACE`, `SECURITY DEFINER`, `SET search_path TO 'public','pg_temp'`). Boundary check (line 143):
```sql
IF p_tent_id IS NOT NULL AND v_plant_tent IS NOT NULL AND v_plant_tent <> p_tent_id THEN … 'plant_not_in_tent'
```
The `v_plant_tent IS NOT NULL` conjunct means an **untented plant** (`plants.tent_id IS NULL`) + an arbitrary owned/same-grow `p_tent_id` **passes**. Fix (NULL-correct, fail-closed):
```sql
IF p_plant_id IS NOT NULL AND p_tent_id IS DISTINCT FROM v_plant_tent THEN … 'plant_not_in_tent'
```
`IS DISTINCT FROM` gives exact equality including NULL: untented+NULL passes; untented+tent rejects; tented+same passes; tented+different or +NULL rejects.

### 1.2 Idempotency
Ledger `public.quicklog_idempotency` PK `(user_id, idempotency_key)`, stores only `grow_event_id`. **No request/payload hash** → same key + different payload silently replays the original and drops the new payload. Fix: `ALTER TABLE … ADD COLUMN IF NOT EXISTS request_hash text` (nullable, backward-compatible; the sibling `quicklog_save_manual` leaves it NULL). In `quicklog_save_event`: compute a canonical request hash; on replay, if the stored hash is non-null and differs → `idempotency_key_conflict` (fail safely); otherwise replay. New rows always carry a hash.

### 1.3 RLS / write-path (audit item — do NOT revoke here)
`grow_events`/`watering_events`/`feeding_events` have RLS + client INSERT/UPDATE/DELETE policies. **No live client depends on them** — the only structural dependents are two *dead* `SECURITY INVOKER` RPCs (`create_watering_event`, `create_feeding_event`: zero runtime call sites; three tests assert non-use). The active write path is the two `SECURITY DEFINER` RPCs (`quicklog_save_event`, `quicklog_save_manual`), which bypass RLS. Per the mission's "do not revoke until every active writer is proven migrated," revocation is **deferred** (revoking would require dropping those INVOKER RPCs + their contract tests — out of this slice's safe scope). Recommended as a follow-up. No policy is revoked in this branch.

### 1.4 Heavy source-scan pins (Slice-2 hazard)
`src/test/quicklog-save-event-rpc-trust-boundary.test.ts` reads the latest migration defining `quicklog_save_event`, isolates the `$function$…$function$` body, and pins dozens of literals (search_path, `uid uuid := auth.uid()`, the 4 ownership reason codes present *before* the first grow_events insert, event whitelist, sensor validation, idempotency literals, the single atomic `BEGIN…EXCEPTION` block, audit reason regex, grants, and no `SQLERRM`/`RAISE;`/alerts/action_queue/AI/device tokens). **One pin (`v_plant_tent … <> p_tent_id`) encodes the defect** — fixing the bug requires updating that specific assertion (the test is not frozen). My migration preserves every other pin. The `quicklog-typed-payloads-migration-safety.test.ts` `findMigration()` keys on specific markers and targets `20260701013256`; my migration must not accidentally become its "newest match" (verified against its selection logic before writing).

### 1.5 History reads (Slice-4 basis)
`useRootZoneObservations` reads `grow_events` + typed children via embedded PostgREST join `ROOT_ZONE_GROW_EVENT_SELECT`, scope union includes `tent`, `.order("occurred_at", desc).limit(cap)`. No keyset/cursor pagination exists anywhere for these tables; the only precedent (`Timeline.loadOlder` over `diary_entries`) uses single-column `.lt("entry_at", cursor)` that **skips rows at equal timestamps** — insufficient. `grow_events.source` CHECK allows `manual|voice|import|ai`; `normalizeRootZoneSource` maps `import→csv`, `voice`/`ai`→`unknown`. Indexes: `idx_grow_events_tent_time (tent_id, occurred_at DESC)`. No `tds` column on child tables.

### 1.6 Harness + scanners
Gate template = `scripts/run-ai-doctor-sessions-rls-harness.ts` (opt-in env + `--confirm-local-security-lane` + production-ref `knkwiiywfkbqznbxwqfh` refusal + loopback guard). Migration static scanner flags `SEARCH_PATH_MUTABLE` / `PERMISSIVE_POLICY` / `TABLE_WITHOUT_RLS` (baseline `config/supabase-migration-safety-baseline.json`). `quicklog-rpc-harness-static-safety.test.ts` scans a hardcoded harness list (won't scan mine) — I add my own harness static test. Security static scan (`scripts/security/*`) scans `src/` for secret patterns only. Playwright: `chromium-mocked` project + `readOverflowMetrics`/`expectNoOverflow` (in `e2e/dashboard-mobile-overflow.spec.ts`) + Supabase route mocking. **`e2e/ui-overhaul-responsive.spec.ts` does not exist in this worktree** — nothing to freeze; I will not create it.

### 1.7 Environment reality
No Docker/Supabase CLI locally → the runtime RLS harness cannot execute here (authored + gated, run in CI). Local `bunx vite` fails (`@resvg/resvg-js` absent) → Playwright can't run locally (authored, CI-run). Typecheck baseline = 1 pre-existing local-only error (`@lovable.dev/cloud-auth-js`). All reported honestly.

---

## 2. Slice plan (TDD; failing test → smallest change → tests → commit)

**Slice 2 — server boundary hardening** (`supabase/migrations/<ts>_quicklog_save_event_irrigation_boundary_hardening.sql`)
- `ALTER TABLE public.quicklog_idempotency ADD COLUMN IF NOT EXISTS request_hash text` (+ RLS unchanged).
- `CREATE OR REPLACE FUNCTION public.quicklog_save_event(...)` copied from v2, surgically changed: (a) NULL-correct plant/tent boundary; (b) request-hash idempotency (pre-check + race handler compare hash → `idempotency_key_conflict`); (c) stricter `p_water`/`p_feed` validation under `invalid_typed_payload` — reject non-object, unexpected keys, non-finite/out-of-range numbers (pH 0–14, EC 0–10 mS/cm, volume/runoff 0–1e6, temp −10..60), product array >12 / non-object products / oversized, oversized note (>500) / serialized details (>20 KB) / secret-bearing details. Preserve null (blank≠0). Keep atomicity + all pins + grants + `NOTIFY pgrst`.
- Tests: extend `quicklog-save-event-rpc-trust-boundary.test.ts` (update the defect pin, add fix + hash pins); new `irrigation-boundary-hardening-migration-safety.test.ts`; migration-version-uniqueness stays green.

**Slice 3 — `<StructuredWateringEntry plantId tentId growId onSaved />`** (`src/components/irrigation/StructuredWateringEntry.tsx` + a thin container VM if needed) — composes `quickLogWateringFormViewModel` + `quickLogWateringReviewViewModel` + `writeQuickLogWateringTypedEvent` (canonical). Owns its own idempotency key (stable across retries), review step, save states. 44px controls, overflow-safe, source=manual, EC in mS/cm. Pure-rules + presenter tests. Not mounted anywhere.

**Slice 4 — tent irrigation ledger** — `src/lib/irrigationLedgerRules.ts` (pure: unify grow/water/feed rows → one honest chronological ledger row; deterministic `occurred_at DESC, id DESC`; unknown stays unknown; source labeled), `src/hooks/useTentIrrigationLedger.ts` (keyset cursor `occurred_at DESC, id DESC` via `.or("occurred_at.lt.X,and(occurred_at.eq.X,id.lt.Y)")` + both `.order`s, bounded page size, react-query with distinct loading/error/empty states, retry:false), presenters `src/components/irrigation/TentIrrigationHistoryPanel.tsx` + `PlantIrrigationHistoryLink.tsx`. Failed query never renders empty. Unit tests + presenter tests + a Playwright overflow spec (chromium-mocked, widths 320/375/390/768/1440).

**Slice 5 — runtime harness + validation + PR** — `scripts/run-irrigation-evidence-rls-harness.ts` (gated, proves the full matrix incl. untented-plant fix, request-hash conflict, atomic rollback, no cross-tenant leak), `test:irrigation-evidence-rls`(+`:local-lane`) aliases (NOT in `test:security-db-local`), a harness static-safety test, full validation, push, draft PR.

## 3. Acceptance gates (I1–I15) — mapping
I1 untented fix (Slice 2 + harness) · I2 cross-tenant matrix (harness) · I3 zero partial rows (atomic block + harness) · I4/I5 idempotency replay-once / diff-request-reject (request hash + harness) · I6 one allowlisted contract (reuse canonical `p_water`/`p_feed`) · I7 explicit units (mS/cm labels) · I8 blank≠zero (existing null-preserving path) · I9 deterministic keyset (Slice 4) · I10 failed≠empty (Slice 4 states) · I11 overflow/44px (Slice 3/4 + Playwright) · I12 static scans clean (own static tests) · I13 existing quicklog green (preserve pins) · I14 no frozen file changes · I15 harness refuses prod + zero leftovers.

## 3a. Design revisions from adversarial review

**Idempotency hash (Slice 2)**
- R1. Hash over the **RAW** request params exactly as received — never the resolved `v_occurred`/`now()`. `p_occurred_at`'s NULL is hashed as NULL, so two no-timestamp retries under one key replay (not conflict).
- R2. Hash includes **every** request-distinguishing param: `p_grow_id, p_event_type, p_tent_id, p_plant_id, p_note, p_photo_url, p_occurred_at, p_sensor_snapshot, p_details, p_water, p_feed` — one `jsonb_build_object(...)::text` → `md5`. (The pre-check runs before grow-ownership, so grow_id/photo_url MUST be in the hash.)
- R3. The `WHEN unique_violation` race handler re-reads `grow_event_id, request_hash` and applies the same null-or-equal rule (flat `IF … THEN RETURN … 'idempotency_key_conflict'; END IF;` — no nested BEGIN/END, no RAISE, no SQLERRM).
- R4. **Legacy/cross-function keys** (NULL hash from pre-migration rows or `quicklog_save_manual`) replay permissively (unverifiable) — documented as best-effort; every NEW `quicklog_save_event` row carries a hash so the conflict guarantee is enforced going forward. Random per-submission keys make cross-function collision negligible.

**Boundary (Slice 2)** — strict per the mission wording: `IF p_plant_id IS NOT NULL AND p_tent_id IS DISTINCT FROM v_plant_tent THEN reject 'plant_not_in_tent'` (exact equality incl. null; a plant logged without its tent must supply the plant's tent — documented in the Codex seam; the live path already derives it).

**Pin-preserving RPC surgery (Slice 2)** — `CREATE OR REPLACE` with **no `DROP FUNCTION`** (avoids hijacking `quicklog-typed-payloads-migration-safety.test.ts`); keep `$function$` quoting + `SET search_path TO 'public','pg_temp'` verbatim; keep the pinned 3-column idempotency INSERT and set the hash via a **follow-on `UPDATE` inside the atomic block**; add the pre-check conflict guard as `IF FOUND AND …` (not `IF FOUND THEN`, to respect the `{0,300}` proximity pin); emit only `invalid_typed_payload` + `idempotency_key_conflict` as new reason codes; keep validation prose free of banned vocab (no dose/pump/valve/live/synced/connected). Update only the single defect-pin assertion (`v_plant_tent <> p_tent_id` → `p_tent_id IS DISTINCT FROM v_plant_tent`).

**Keyset pagination + evidence truth (Slice 4)**
- R5. The cursor is the **raw** `occurred_at` string from the DB row (+ `id`), carried separately from the display-normalized value — never a `Date→toISOString` round-trip (microsecond truncation drops boundary rows). The value is double-quoted inside `.or("occurred_at.lt.\"<iso>\",and(occurred_at.eq.\"<iso>\",id.lt.\"<id>\"))"`.
- R6. `hasMore` + next cursor are derived from the **raw** result set (fetch `pageSize+1`, `hasMore = raw > pageSize`, cursor from the last raw row) — never from the null-dropping projection.
- R7. The ledger renders **one row per non-deleted watering/feeding event** regardless of whether numeric metrics survive (a note-only watering is "Logged — no measurements," never omitted). Do NOT reuse the `hasEvidence` null-drop gate.
- R8. Distinct **"could not load older entries"** partial state: a subsequent-page error keeps loaded rows, keeps a retry, and shows an inline error — a truncated ledger never reads as complete.
- R9. The ledger has its **own** source normalization preserving `voice`→"Voice log" and `ai`→"AI-generated" as first-class labels; unavailable/unknown only for genuinely absent/unrecognized source (never mislabels known provenance; never shows manual/stale as live/healthy).

## 4. Rollback
All changes additive except the `CREATE OR REPLACE` of `quicklog_save_event` (reversible by re-applying the v2 body) and one nullable column add (`request_hash`, droppable). New UI/hooks/harness are isolated and unmounted. No production data touched.
