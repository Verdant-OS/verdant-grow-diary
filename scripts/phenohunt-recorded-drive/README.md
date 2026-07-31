# Phenohunt recorded drive

A comprehensive, credential-free browser test of the whole phenohunt feature,
driven as one continuous Chromium session and recorded to video. It walks the
full first-time-user lifecycle:

1. Signed-in Pro user opens an empty `/pheno-hunts` index.
2. Creates a hunt through all six onboarding wizard steps
   (basics → candidates → goals → packet preview → checklist → confirmation).
3. Exercises every workspace function: setup completion, candidate-number
   assignment, trait scoring, keeper decisions + append-only log, sex reveal
   with the hermaphrodite → Action Queue arc, staged round scoring, smoke
   test, lab/COA results, decision history, breeding objective, stress
   observation record/edit/delete, product sampling, documentation, filters,
   and CSV export.
4. Verifies comparison readiness flips only from server truth (reload), then
   drives cohort selection into `/pheno-hunts/:id/compare`.
5. Completes the lifecycle on `/pheno-hunts/:id/keepers`: names a keeper,
   records clone insurance, logs two stability grow-outs, marks a reversal,
   and records a self (S1) cross.
6. Ends on the hunt showcase and the now-populated index.

## How it works

- `mockdb.mjs` — a stateful in-memory PostgREST stand-in: table rows,
  eq/neq/in/is/like/ilike/not/gte/lte filters (PostgREST `*` wildcard
  included), `or=(...)` clauses, embedded-resource filters
  (`plants.is_archived=eq.false` narrows the embed, never the parent),
  multi-column `order` with nulls handling, and DB-default columns on insert
  (`observed_at`, `decided_at`, …). Writes mutate the store so reloads see
  persisted state — required because the workspace trusts the server-loaded
  comparison summary over optimistic local state.
- `drive.mjs` — the Playwright driver. Routes `/auth/v1/*` and `/rest/v1/*`
  (with per-function RPC dispatch that fails loud on anything unmocked),
  seeds a session in `sessionStorage`, records video, and logs every console
  error, page error, failed request, and soft-assertion miss into
  `report.json` without aborting the run.

No real Supabase traffic occurs; the seeded user carries an active
`founder_lifetime` subscription row so the Pheno Tracker gate opens.

## Run it

```bash
# 1. dev server (IPv4 explicitly; see .claude/skills/run-verdant-grow-diary)
bun run dev -- --host 127.0.0.1 --port 8080

# 2. the drive (writes video/, shots/, report.json into OUT_DIR)
BASE_URL=http://127.0.0.1:8080 OUT_DIR=/tmp/pheno-drive node scripts/phenohunt-recorded-drive/drive.mjs
```

Environment knobs: `CHROMIUM` (browser binary), `BEAT_MS` (pacing between
visible actions, default 420ms — raise it for a slower, more watchable
recording).

The exit report prints one line per step plus every finding; a defect-free
run ends with `findings: 0 (excluding info)`.
