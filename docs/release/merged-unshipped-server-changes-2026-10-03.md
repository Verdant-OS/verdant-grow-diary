# Merged server changes not yet confirmed shipped (since 2026-09-26 00:00 CT = 2026-09-26 05:00 UTC)

Window cutoff: midnight Central time at the start of 2026-09-26, which is **2026-09-26 05:00 UTC**.
Every other time in this doc is UTC. Two server-changing merges landed on 2026-09-26 UTC but
before this cutoff; see "Edge of window" below.

Status: inventory only. No SQL, deploy, publish, secret or production query was run to
produce this. Applied/published state comes **only** from `docs/agents/CURRENT_STATE.md`
at deploy tip `cf929cf7baf0011045430e3a38b28b09632847c6`. Anything that file doesn't record
is `NOT_MEASURED`. Applying migrations and publishing edge functions remain Matthew's
decisions under the existing locks (production database knk, HOLD #1250).

Handoff item 3. Owner: Grok. Reviewer seat: Critical Mass.

## How this list was derived

From the deploy branch history, not from memory:

```bash
git fetch --shallow-since=2026-09-10 origin verdant-grow-diary
git log origin/verdant-grow-diary --since=2026-09-26T00:00:00-05:00 \
  --format='%H|%cI|%s' -- supabase/migrations supabase/functions
git diff --name-status <sha>^ <sha> -- supabase/
gh pr view <n> --json mergedAt,mergeCommit
```

The `--since` bound is midnight CT, i.e. 2026-09-26 05:00 UTC (not 00:00 UTC). With that
cutoff the query returns **8** squash commits touching `supabase/migrations/*` or
`supabase/functions/*` (it filters on commit date, which can differ from GitHub `mergedAt` by
up to ~30 minutes; that does not change the set here). Two more server-changing merges sit
just before the cutoff (between 00:00 and 05:00 UTC on 2026-09-26) and are listed separately
under "Edge of window". The handoff also named #1762, #1776, #1813, #1880 and #1783. Those
five merged in the window but change **no** file under `supabase/` (see "Named in the
handoff but not server changes" below).

## Inventory (merge order)

Times are merge times from GitHub (UTC). The window starts at 2026-09-26 05:00 UTC
(midnight CT); every row below merged after that.

| PR    | Merged (UTC)     | Merge SHA                                  | Kind                       | Files under `supabase/`                                                                                                                                                                                     |
| ----- | ---------------- | ------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1651 | 2026-09-29 21:55 | `a8fa40cce4ad562211994633e51b295cda0a562a` | Edge function              | `M functions/mcp/index.ts`                                                                                                                                                                                  |
| #1658 | 2026-09-30 19:35 | `5725477142fc507256f994f28f885e0f205a9465` | Edge shared lib            | `M functions/_shared/lib/.sync-manifest.json`, `M functions/_shared/lib/lib/sensorSnapshot.ts`                                                                                                              |
| #1655 | 2026-10-01 02:31 | `18730daf39a8eee77600e961a86247043537db4b` | Edge function              | `M functions/mcp/index.ts`                                                                                                                                                                                  |
| #1831 | 2026-10-01 04:02 | `46f0741dca73cc219f0fe79c994710811d29720a` | Migration ×3               | `A migrations/20260927002000_quicklog_manual_reuse_fence.sql`, `A migrations/20260927160000_quicklog_manual_plant_tent_lineage.sql`, `A migrations/20260928183000_quicklog_manual_replay_metadata_lock.sql` |
| #1741 | 2026-10-01 04:11 | `07f258ff6d8e348d99ec8131ae95b7eaeed98326` | Migration                  | `A migrations/20260927094000_linked_quicklog_diary_client_write_fence.sql`                                                                                                                                  |
| #1834 | 2026-10-01 13:45 | `7e4290d7dcf65261bab500d32f1ea75a9c90f501` | Migration                  | `A migrations/20260927012000_quicklog_event_replay_active_receipt.sql`                                                                                                                                      |
| #1836 | 2026-10-01 15:35 | `0107d9406fa1902a4d2cfe0e1d520ba87b8af05c` | Migration                  | `A migrations/20261001140000_quicklog_event_replay_mirrorless_legacy.sql`                                                                                                                                   |
| #1869 | 2026-10-03 23:56 | `cf929cf7baf0011045430e3a38b28b09632847c6` | Edge function + shared lib | `M functions/get-paddle-price/index.ts`, `M functions/_shared/unionEntitlementLookup.ts`                                                                                                                    |

### Edge functions each change reaches

Derived from the relative-import graph under `supabase/functions/` at `cf929cf7`
(transitive, through `_shared/`):

- **#1651, #1655** → `mcp`.
- **#1658** (`_shared/lib/lib/sensorSnapshot.ts`) → `ai-doctor-review`.
- **#1869** (`_shared/unionEntitlementLookup.ts`) → `ai-coach`, `ai-cultivar-qa`,
  `ai-doctor-review`, `ecowitt-ingest`, `environment-summary-report-entitlement`,
  `get-paddle-price`, `live-sensor-entitlement`, `mint-bridge-token`,
  `pi-ingest-readings`, `premium-export-entitlement`, `redeem-referral`,
  `sensor-ingest-webhook`. A shared-module change only reaches production when each
  consuming function is redeployed.

### Edge of window (merged 2026-09-26 UTC, before the midnight-CT cutoff)

Not in the 8-row inventory because they merged before 2026-09-26 05:00 UTC, but they are
server changes that are also not recorded as shipped, and they interact with this plan:

| PR    | Merged (UTC)     | Merge SHA                                  | Kind                      | Files under `supabase/`                                                                                                                                                                          |
| ----- | ---------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1703 | 2026-09-26 01:55 | `4ddb23225918ee1fdfb238ab84708a2e765adb43` | Migration                 | `A migrations/20260924120000_plants_health_unassessed_default.sql` (BUG-009)                                                                                                                     |
| #1683 | 2026-09-26 04:19 | `dccaf7324055b91cad0a5b51a40c449bb3b6bcf2` | Edge functions (16 files) | including `M functions/ai-doctor-review/index.ts`, `functions/_shared/lib/*` mirror, `auth-email-hook/index.ts`, `sensor-ingest-webhook/index.ts`, `operator-ggs-real-payload-commit/handler.ts` |

- **Applied/published state:** `CURRENT_STATE.md` :446-447 (written while #1683 still carried
  the migration) says only "Committed is not applied". Applied state of `20260924120000` and
  publish state of #1683's functions are **NOT_MEASURED**.
- **Redeploying `ai-doctor-review` ships #1683 too.** #1658 and #1869 both require an
  `ai-doctor-review` redeploy; that deploy is built from the deploy tip, so it also publishes
  #1683's `ai-doctor-review/index.ts` and shared-lib changes. Review #1683 as part of that
  deploy, not separately.
- **`20260924120000` sorts ahead of every migration in the table below.** If it is not yet
  applied, a version-ordered apply runs it first.

## Migrations in dependency order

Supabase applies by version (timestamp), not by merge order. The table is in **version
order only**, not merge order: #1834 (row 2) merged after #1741 (row 3) and after all three
#1831 files. In version order they are:

| #   | Version        | File                                       | PR    | Recorded prerequisite (from the file)                                                                                                |
| --- | -------------- | ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 20260927002000 | `quicklog_manual_reuse_fence`              | #1831 | replaces `public.quicklog_save_manual`                                                                                               |
| 2   | 20260927012000 | `quicklog_event_replay_active_receipt`     | #1834 | replaces `public.quicklog_save_event`                                                                                                |
| 3   | 20260927094000 | `linked_quicklog_diary_client_write_fence` | #1741 | policies + `BEFORE UPDATE` trigger on `public.diary_entries`                                                                         |
| 4   | 20260927160000 | `quicklog_manual_plant_tent_lineage`       | #1831 | preflight: "The replay fence parent must be present before replacing its delegate" (checks the wrapper body hash), so it requires #1 |
| 5   | 20260928183000 | `quicklog_manual_replay_metadata_lock`     | #1831 | "Forward repair only: accepted 20260927002000 bytes remain unchanged" (requires #1)                                                  |
| 6   | 20261001140000 | `quicklog_event_replay_mirrorless_legacy`  | #1836 | forward repair of #2. Preflight accepts either predecessor wrapper                                                                   |

**Strict-ordering hazard recorded in the files themselves.** #1834's version
`20260927012000` is **older** than versions that merged before it (`20260927094000`,
`20260927160000`, `20260928183000`). The header of `20261001140000` says a database
that already recorded those versions "does not pick it up as a normal forward migration".
`20261001140000` (#1836) carries the complete wrapper at a current version, and its
preflight accepts either state: `20260927012000` applied, or never applied. So the safe
order is:

1. #1831 `20260927002000`, then `20260927160000` and `20260928183000` (each preflights on #1's wrapper).
2. #1741 `20260927094000` (independent of the quicklog wrappers).
3. #1834 `20260927012000` **only if** the apply path accepts an out-of-order version.
   Otherwise skip it; #1836 covers the function. **A skip must be recorded.** A skipped
   `20260927012000` stays a pending local version in migration history. A later
   `supabase db push` then either refuses it as out of order or, with `--include-all`, runs
   it after #1836, where its preflight (which requires the pre-#1834 wrapper hash
   `0043154b…`) rejects #1836's wrapper and the push stops. The owner has to record the skip,
   e.g. `supabase migration repair --status applied 20260927012000`. Doc note only: this
   inventory never runs it, and nobody should run it without the owner's decision.
4. #1836 `20261001140000` last.

Each of the six files runs in a single transaction (`BEGIN`/`COMMIT`) with a preflight
check, so a failed preflight aborts the file instead of half-applying it. Five of the six
also take a transaction-scoped advisory lock; #1741's `20260927094000` takes none.

## Applied / published state (as recorded in CURRENT_STATE.md only)

| PR    | What `CURRENT_STATE.md` records                                                          | State used here                                                 |
| ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| #1651 | merge-from-base repairs and local test evidence only. No deploy record                   | Edge publish **NOT_MEASURED**                                   |
| #1658 | listed as "locked" in the locks lines. No deploy record                                  | Edge publish **NOT_MEASURED**                                   |
| #1655 | open-fix references only. No deploy record                                               | Edge publish **NOT_MEASURED**                                   |
| #1831 | no entry                                                                                 | Migrations applied **NOT_MEASURED**                             |
| #1741 | "#1741/#1745 retain database-approval holds" (written before it merged). No apply record | Applied **NOT_MEASURED**. Owner database-approval hold recorded |
| #1834 | no entry                                                                                 | Applied **NOT_MEASURED**                                        |
| #1836 | no entry                                                                                 | Applied **NOT_MEASURED**                                        |
| #1869 | no entry                                                                                 | Edge publish **NOT_MEASURED**                                   |

`CURRENT_STATE.md` also says that frontend identity (`/version.json`) "does not prove an
RPC, migration, deployment platform or signed-in product result". This inventory infers
nothing from the frontend stamp.

## Publish prerequisites

- **#1869 needs `PAYMENTS_ENVIRONMENT` set explicitly before publishing.** Its PR body
  says production's value is `NOT_MEASURED`. If the selector is unset when the functions
  are published, sandbox test-card subscriptions stop unlocking paid features and
  `get-paddle-price` returns `503 price_resolution_unavailable` (checkout stops). Confirm
  `PAYMENTS_ENVIRONMENT=live` in the Supabase function secrets first. The value must be
  confirmed by the owner, not inferred here.
- Redeploy every consumer listed above for #1869, not only `get-paddle-price`. Otherwise
  entitlement gates run mixed resolver versions.
- Migrations before edge functions is the conservative default. None of the edge changes
  listed here calls a function created by these migrations, so there's no recorded hard
  dependency between the two groups.

## Named in the handoff but not server changes

These merged inside the window and change no `supabase/` file
(`git diff --name-only <sha>^ <sha> | grep '^supabase/'` is empty):

| PR    | Merged (UTC)     | Merge SHA                                  | What it changes                                           |
| ----- | ---------------- | ------------------------------------------ | --------------------------------------------------------- |
| #1762 | 2026-09-28 23:04 | `6ca97026437ab556f7fbac752abfbe8085c1f271` | client `src/lib/quickLogRevisionService.ts` + tests       |
| #1776 | 2026-09-29 02:18 | `95464496a4dcc802710c2c08e303ffee15182a7d` | client Quick Log revision hook/rules + tests              |
| #1783 | 2026-09-30 19:23 | `6da0f7c4dc0fe7aea1040a76af93a4c0f0c904b3` | `tools/ecowitt-testbench/*`, docs, CI, one `src/lib` rule |
| #1813 | 2026-10-01 04:23 | `e8e28307607460f2e07b204b0f4362d4b685d8ca` | PG15 harness script + workflow + test                     |
| #1880 | 2026-10-03 04:18 | `b5aaae9f0604f1b0c9e04ec876662824e9fc5b26` | client Quick Log Water recovery stores/rules + tests      |

None of their `src/` diffs adds a new `.rpc(` call. They ship with the frontend
build, not with a migration apply or edge deploy.

## Rollback

Docs only. Revert this file. Nothing operational was changed.
