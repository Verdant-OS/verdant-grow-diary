# Grow / Tent Restore Verification

Read-only tooling to verify Verdant's grow/tent data integrity **before
and after** a Supabase backup/PITR restore of the grow/tent data-loss
incident. See also
[`database-integrity-incident-runbook.md`](./database-integrity-incident-runbook.md).

> ⚠️ This pack does **not** repair data. It only reports the current
> integrity state. Do not use its output to fabricate placeholder
> `grows`/`tents` rows — that is forbidden by the incident runbook.

## When to run

1. **Pre-restore** — capture the current loss state (counts at zero,
   orphan references that depend on the missing rows). Save the JSON
   report locally as the baseline.
2. **Post-restore** — re-run the same script after Supabase PITR /
   backup restore. Compare counts and orphan totals against the
   pre-restore baseline. `grows` and `tents` should be non-empty and
   orphan totals should drop to zero (or to a documented, explained
   number).

## What it checks

The script `scripts/run-grow-tent-restore-verification.ts` runs
SELECT-only queries built by `src/lib/growTentRestoreVerification.ts`
and emits a JSON report containing:

- `environment` — from `VERDANT_ENV` (default `unknown`).
- `generated_at` — ISO timestamp at run time.
- `counts` — row counts for `grows`, `tents`, `plants`,
  `diary_entries`, `sensor_readings`, `alerts`, `action_queue`.
- `grow_id_referencing_tables` — every table with a `grow_id` column.
- `tent_id_referencing_tables` — every table with a `tent_id` column.
- `orphan_grow_references` — per-table count of rows whose `grow_id`
  does not match any row in `public.grows`.
- `orphan_tent_references` — per-table count of rows whose `tent_id`
  does not match any row in `public.tents`.
- `total_orphan_grow_references` / `total_orphan_tent_references`.
- `grows_empty` / `tents_empty` booleans.
- `errors` — any per-table query that failed (does not include
  secrets).
- `verdict` — one of:
  - `ok` — counts populated, zero orphan references, no errors.
  - `blocked_empty_core_tables` — `grows` or `tents` is empty.
  - `blocked_orphans_found` — orphan grow/tent references exist.
  - `needs_review` — counts populated, no orphans, but per-table
    errors occurred.

## How to run

```bash
VERDANT_ENV=production bun run scripts/run-grow-tent-restore-verification.ts \
  > /tmp/verdant-restore-pre.json
```

After restore:

```bash
VERDANT_ENV=production bun run scripts/run-grow-tent-restore-verification.ts \
  > /tmp/verdant-restore-post.json
diff /tmp/verdant-restore-pre.json /tmp/verdant-restore-post.json
```

Requires the standard `PG*` env vars (`PGHOST`, `PGUSER`, `PGDATABASE`,
`PGPASSWORD`, `PGPORT`) that are already provided in the Lovable
sandbox. The script does not use service-role and does not print
secrets.

## Hard rules

- **Read-only.** No INSERT, UPDATE, DELETE, UPSERT, TRUNCATE, ALTER,
  DROP, CREATE POLICY, or service-role usage anywhere in this pack.
- **No fabricated rows.** Never use the report output as justification
  to insert placeholder/archived `grows` or `tents` rows. Real data
  must be recovered from Supabase backup/PITR only.
- **No public commits of row-level detail.** Reports include
  per-table counts only (no UUIDs, no user_ids, no payloads), but
  treat saved snapshots as operator-only artifacts and keep them out
  of public commits or screenshots.
- **Static guardrails enforced.** The build fails if anyone
  reintroduces mutation SQL in the verification script or docs (see
  `src/test/grow-tent-restore-verification-safety.test.ts`) or the
  archived-placeholder repair pattern (see
  `src/test/database-integrity-incident-guardrails.test.ts`).

## Comparing pre/post snapshots

A successful restore looks like:

- `counts.grows` and `counts.tents` both > 0 and match the last known
  good production numbers from backup metadata.
- `total_orphan_grow_references` = 0.
- `total_orphan_tent_references` = 0.
- `verdict` = `ok`.

Anything else means the restore is incomplete or another data issue
exists. Stop and investigate before continuing — do not patch.
