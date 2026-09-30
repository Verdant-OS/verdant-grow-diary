# Full-suite consolidation proposal

Status: proposal only. This change deletes no workflow, disables no job and changes
no required context. It follows Matthew's 2026-09-28 operating update, Job B.4.

## Measured baseline

Source base: `6fb27c5aec715c14213dd79cdb5077351e40dea0`.

| Lane                            | Current selection                                                          | Execution                                                                                                             | Merge requirement                                                            |
| ------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ci.yml`                        | Resolved Vitest `src/**/*.{test,spec}.{ts,tsx}`                            | 32 named shards; eight sequential 1/256 processes per shard; isolated forks; one worker; 8 GB heap; 75-minute timeout | All 32 shard contexts, plus the other three CI contexts, are pinned          |
| `vitest-full-suite-pr-gate.yml` | Legacy runner scans `.test.ts(x)` under `src/test` and `src/lib/__tests__` | 16 round-robin batches; one-file chunks; isolated forks; 4 GB heap; 30-minute timeout                                 | Not in the 35-context pinned ruleset; Vercel check selection is NOT_MEASURED |

Read-only file discovery at this base used:

```powershell
bun x vitest list --filesOnly --json=<receipt>
```

PASS: resolved Vitest discovery returned **3,153 files**. Applying the legacy
runner's exact roots/suffix rule returned **3,127 files**, all in the configured
set. **26 configured files are absent from the legacy runner**; no extra legacy
files were found. These are file counts, not executed test totals. Discovery
executed zero tests.

Examples outside the legacy roots include
`src/components/ManualSensorSnapshotReviewPanel.test.tsx`,
`src/components/QuickLog.test.tsx` and `src/hooks/useGrowData.meta.test.ts`.
The repository already has #1757 for this discovery gap, so consolidation must
preserve that work rather than introduce another discovery implementation.

NOT_MEASURED: hosted execution parity, aggregate runtime, peak memory, cancellation
latency and Vercel's selected Deployment Checks. Do not call the current lanes
exact duplicates until their discovery sets are equal at the measured SHA.

## Recommended end state

Keep the existing **32 required shard contexts** in `ci.yml` and its resolved
Vitest discovery as the single automatic full-suite lane. Keep lint/typecheck/build,
edge preflight, legal SEO and all other required/security coverage. Preserve the
exact 35-context names in `config/required-status-checks.json` and the live ruleset.

After parity and hosted runtime are proven, keep the 16-batch runner as a manual
diagnostic lane, without a second automatic full-suite execution on the same PR,
merge-group or deploy SHA. Changing those triggers is a later implementation, not
part of this docs-only proposal. Confirm Vercel no longer waits for the retired
automatic 16-batch contexts before changing their triggers.

On a ready PR this would reduce full-suite matrix jobs from 48 to 32, a theoretical
16-job reduction. It is not a measured 33% wall-clock or cost improvement. Draft
skip behavior in #1782 is separate and already preserves the required 32 shards.

## Evidence required before implementation

1. Land or reconcile #1757, then generate sorted discovery manifests for the
   configured suite and the diagnostic runner at one exact SHA. Require equal
   sets, no duplicates and no hidden out-of-root/spec exclusions.
2. Record terminal outcomes, executed file/test counts, skips and partition
   coverage for both lanes at that SHA. Count overlapping executions separately;
   never sum them as unique tests.
3. Compare hosted shard durations and failure/timeout/OOM outcomes. Preserve the
   eight-process memory reset, one worker, isolated forks and existing timeout
   until a separately measured change justifies altering them.
4. Verify every required context actually reports success on a PR and merge-group
   head. Preserve security-regression and applicable `mustBeGreen` contexts. A
   skipped required check is not success.
5. Matthew confirms the native Vercel Deployment Checks selection and removes only
   contexts being intentionally retired. Do not enable a second promotion writer.
6. Publish the exact before/after workflow-job count and queue measurements. The
   organization capacity of 20 jobs is owner-supplied context, not measured by the
   workflow-run queue API.

## Future closed file plan

- `.github/workflows/ci.yml`, only if inventory/evidence steps are needed within
  existing jobs; retain all required context names and execution safeguards.
- `.github/workflows/vitest-full-suite-pr-gate.yml`, only the approved automatic
  trigger retirement and manual diagnostic inputs after the evidence above.
- Focused resolved-YAML/file-discovery contracts and this proposal's receipts.
- `scripts/run-vitest-batches.mjs` only through the existing #1757 ownership path;
  do not fork its implementation or touch its dependency/lockfile state.

No SQL, `supabase/`, auth/RLS, production database, device or Action Queue changes.
HOLD #1250 files and branches are excluded.

## Rollback and acceptance

Until evidence is complete, keep both existing automatic ready-PR lanes. If the
later retirement loses a file, context or reliable execution, restore its original
automatic triggers and re-run the exact failing head; do not hide failures or
shrink the suite. Restoring workflow coverage does not promote production.

This document is PASS as a scoped proposal with measured file discovery. The
consolidation itself is NOT_MEASURED and not implemented. Hosted required checks
must pass at the proposal's exact head before any eligible Phase 1 integration.
