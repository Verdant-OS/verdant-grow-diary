# Quick Log Corrections & Retractions v1 — operator handoff

**Issue:** #786 — Quick Log entries cannot be corrected or retracted from any surface.
**Status at authoring:** implemented on `claude/quick-log-corrections-retractions-757336`; migration NOT applied to production (see rollout).

## What shipped

Growers can now, from Timeline (`/timeline`, `/logs` alias) history panels and the
plant/tent-detail QuickLog memory cards:

- **Correct** a Quick Log entry — note text, event time, or plant re-target — via a
  chip-first dialog (reason required, explanation optional).
- **Retract** a Quick Log entry via an explicit confirmation dialog (reason required)
  stating the entry is removed from active history but retained in the audit trail.
- See a compact **edited** badge on corrected entries, and a collapsed
  **Retracted entries** disclosure (Timeline recent-lane) showing the original note and
  retraction metadata.

Identical for Free, Pro monthly, Pro annual, Craft, and Founder — there is no
entitlement gate anywhere on this path (statically fenced by
`src/test/quicklog-corrections-static-safety.test.ts`).

## Data model (append-only)

Migration: `supabase/migrations/20260811090000_quicklog_corrections_retractions.sql`

| Object                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.quicklog_entry_revisions`                      | Immutable ledger. One row per correction/retraction: root id, revision_no (unique per root), kind, reason_code, reason_note, previous_state snapshot, new_state, actor, timestamp. RLS: owner/operator SELECT only; **no client write policies**; anon revoked.                                                                                                                                      |
| `diary_entries.retracted_at` (new nullable column)     | Query-level retraction marker for the mirror rows; legacy rows stay NULL and behave exactly as before. Partial index for the audit disclosure.                                                                                                                                                                                                                                                       |
| `grow_events.is_deleted` / `deleted_at` (pre-existing) | Retraction reuses the existing tombstone convention that ~all spine readers already filter.                                                                                                                                                                                                                                                                                                          |
| `public.quicklog_retract_entry(...)` RPC               | SECURITY DEFINER, `auth.uid()` identity, FOR UPDATE root lock, appends ledger row, tombstones spine + same-transaction environment sibling (matched by exact `created_at` equality), marks mirror rows. One retraction per root (partial unique index).                                                                                                                                              |
| `public.quicklog_correct_entry(...)` RPC               | Same posture. `p_changes` jsonb allowlist (`note`, `occurred_at`, `target_type`+`target_id`). Target moves re-validate ownership + grow coherence exactly like `quicklog_save_manual`. Applies effective state to spine, environment siblings, and mirror rows in one transaction; original values preserved in the ledger row (and again in `diary_entry_audit_log` via the pre-existing triggers). |

Why materialized effective state instead of read-time revision resolution: there are
~30 ad-hoc `diary_entries` readers with **no** shared choke point (audited 2026-08-11),
including `head:true` exact counts that cannot be filtered in memory. Materializing the
effective row + an immutable ledger keeps every reader correct with a one-line
query-level filter, without a broad refactor.

## Reader reconciliation

`.is("retracted_at", null)` added at 24 query sites (Timeline, timeline memory — the
choke point for all five AI Doctor client context surfaces —, grouped timeline, plant
recent activity, log-day counts, manual snapshot/sensor history/trends, dashboard,
grow detail, roster activity, generic diary fetchers, diary-range report, reports-hub
counts + merge, post-grow learning report, one-tent activation evidence, pheno receipt
readers, and the `ai-coach` + `mcp` edge functions). `parsePhenoEvidenceReceiptRow`
also rejects retracted receipts (parse-level backstop for coverage counts).

Deliberately NOT filtered (audit/operator surfaces): `operatorAccountReadModels`,
`LocalDataHealthPanel`, `Diagnostics`, `PlantMergeDialog` (merges still move retracted
rows), `EcowittIngestAudit`, and `useRetractedQuickLogEntries` (the disclosure reader).

## Rollout / production follow-up checklist

1. Merge the PR; CI replays the migration in the Security DB Local lane.
2. **Apply the migration to production** (it is additive: one table, one nullable
   column, one index family, four functions — no rewrite of existing rows, no
   downtime expected). Pre-migration behavior if the client ships first: the UI
   controls fail calmly with "The change could not be saved"; the page-critical
   readers (Timeline core reads, timeline memory / AI Doctor context, grouped
   timeline) detect the missing `retracted_at` column (42703) via
   `selectWithRetractionCompat` and retry unfiltered, so those pages keep their
   previous behavior; the remaining filtered readers surface their normal
   error/empty states until the migration is applied. Apply-before-merge is still
   the recommended order.
3. Regenerate Supabase types when convenient (`supabase gen types`) — the committed
   `types.ts` was hand-extended with the new table/column/RPCs in the generated style.
4. Run the runtime harness against a real stack:
   `bun run scripts/run-quicklog-revisions-rls-harness.ts`
   (needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`; sandbox
   project is appropriate — it seeds and tears down its own users/rows).
5. Optional later slices (not in v1): correcting watering volume / feed details /
   action kind (workaround: retract + re-log, which the retraction copy supports),
   restore/un-retract, operator-facing revision browsing, wiring the badge into the
   TimelineMemorySection cards.

## Rollback

- Client/UI: revert the PR — readers fall back to showing all rows (including any
  already-retracted ones; the markers are inert without the filters).
- Database: do NOT edit the merged migration (immutability rule). If the feature must
  be disabled after production apply, ship a new migration revoking EXECUTE on the two
  RPCs from `authenticated`; the table and column are harmless at rest.
- Data written by the feature is recoverable by construction: every correction and
  retraction retains the prior values in `quicklog_entry_revisions.previous_state`
  (plus `diary_entry_audit_log`), and retraction is a marker, not a delete.

## Review-round hardening (2026-08-12, Codex review on PR #921)

- Time corrections rebase embedded `details.sensor_snapshot.captured_at` /
  `details.sensor.captured_at` to the corrected time **only when they exactly
  equal the previous event time** (writer-derived); genuinely distinct capture
  times are preserved as real provenance.
- The ledger's "at least one FK set" CHECK was removed: both FKs are
  `ON DELETE SET NULL`, and the pre-existing hard-delete path for diary rows
  must be able to null `diary_entry_id` on a diary-only revision. `root_id`
  (NOT NULL) carries provenance.
- `useRecentFeedingsForDefaults` (diary fallback) and
  `PlantSensorSourceBreakdownCard` also filter retracted rows now.
- Timeline threads `onEntryChanged` from the history panels back into its local
  `load()`, so corrections/retractions refresh the page state immediately.

## Known limitations

- Environment-sibling matching uses exact `created_at` equality (same transaction) —
  deterministic for RPC-written saves; hand-inserted rows at the exact same
  transaction timestamp would co-retract (not producible via the app).
- A grower with direct API access can still hard-delete their own `diary_entries`
  rows via the pre-existing owner DELETE policy (unchanged surface, out of scope).
- Legacy Quick Log rows lacking every discriminator (very old direct inserts) show no
  Correct/Retract controls; they keep their existing Edit/Remove behavior.
- The retracted-entries disclosure lists mirror rows only (spine-only saves without a
  mirror appear once retraction ledger rows exist, via the badge query, but not in the
  disclosure list).
