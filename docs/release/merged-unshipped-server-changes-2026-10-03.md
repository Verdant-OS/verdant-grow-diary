# Merged server changes not yet confirmed shipped (since 2026-09-26 00:00 CT = 2026-09-26 05:00 UTC)

Window cutoff: midnight Central time at the start of 2026-09-26, which is **2026-09-26 05:00 UTC**.
Every other time in this doc is UTC. Two server-changing merges landed on 2026-09-26 UTC but
before this cutoff; see "Edge of window" below.

Status: inventory only. No SQL, deploy, publish, secret or production query was run to
produce this. Applied/published state comes **only** from `docs/agents/CURRENT_STATE.md`
at the deploy tip. This inventory was built at `cf929cf7baf0011045430e3a38b28b09632847c6`; the tip
is now `5ea8f1f74209c3576afea0317a471370222fbae3`, and `cf929cf7..5ea8f1f7` touches neither
`supabase/` nor `CURRENT_STATE.md`, so nothing below changes. The later amendment (#1704's
`20260925090000` and the parked #1460/#1545 versions) re-read `supabase/migrations/`,
`CURRENT_STATE.md` and `CURRENT_STATE_ARCHIVE.md` at tip
`a980489ad5188e36eba89461117c2b60fc10f927`. Anything those files don't record is
`NOT_MEASURED`. Applying migrations and publishing edge functions remain Matthew's
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
`supabase/functions/*`. It filters on commit date, not GitHub `mergedAt`; the two can differ by
more than an hour (#1655: 66 min, #1683: 77 min). Every row was cross-checked against
`gh pr view --json mergedAt`, and the gap doesn't change the set here. Two more server-changing merges sit
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

- **Applied/published state:** `CURRENT_STATE.md` :448 (written while #1683 still carried
  the migration) says only "Committed is not applied". Applied state of `20260924120000` and
  publish state of #1683's functions are **NOT_MEASURED**.
- **Redeploying for #1658/#1869 ships #1683 too, in two functions.** Deploys are built from
  the deploy tip. #1658 and #1869 both require an `ai-doctor-review` redeploy, which also
  publishes #1683's `ai-doctor-review/index.ts` and shared-lib changes. #1869 also requires a
  `sensor-ingest-webhook` redeploy (one of its 12 consumers above), which publishes #1683's
  `sensor-ingest-webhook/index.ts` change. Review #1683 as part of those deploys, not
  separately.
- **#1683 also reaches `auth-email-hook` and `operator-ggs-real-payload-commit`.** Those
  changes ship whenever those functions are next deployed, even though neither is part of the
  #1658/#1869 redeploy set. Their publish state is **NOT_MEASURED**.
- **`20260924120000` sorts ahead of every migration in the table below**, but it is not the
  earliest version that may be pending. If it is not yet applied, a version-ordered apply
  runs it after any earlier pending version (including the parked `20260916111000` and
  `20260917183000`, next section) and before `20260925090000` (#1704) and the table below.

### Parked earlier migrations: `20260916111000` (#1460) and `20260917183000` (#1545)

`CURRENT_STATE_ARCHIVE.md` (section "Two committed migrations sit inside the lag window")
records `20260916111000_quicklog_revision_idempotent_replay.sql` (#1460, `c8194a3d`) and
`20260917183000_manual_sensor_correction_operations.sql` (#1545, `c00b2e29`) as "committed,
not applied", with production applied-migration state `NOT_MEASURED`. The live
`CURRENT_STATE.md` locks list still says "No Publish. No APPLY. `#1460` and `#1545` stay
parked." Both versions sort **before** `20260924120000`, `20260925090000` and every
migration in this doc. So if either is still pending in production, a version-ordered apply
(`supabase db push`) runs it **first** and applies a parked migration nobody approved.

**Before any version-ordered apply, the owner checks whether `20260916111000` and
`20260917183000` are recorded in production** (same check as below:
`supabase_migrations.schema_migrations` or the Remote column of `supabase migration list`).
If either is pending, a version-ordered apply must not run until Matthew decides how to
handle the park: lift it and apply in order, or keep it parked and use an apply path that
doesn't run them. Record the decision in the release receipt. Doc note only: this amendment
didn't read production.

### Also not recorded as shipped: `20260925090000` (#1704, merged 2026-09-25)

#1704 merged before both the window and the edge-of-window rows, so the 8-row inventory
query doesn't return it. Nothing above mentioned it until this amendment.

| PR    | Merged (UTC)     | Merge SHA                                  | Kind      | Files under `supabase/`                                             |
| ----- | ---------------- | ------------------------------------------ | --------- | ------------------------------------------------------------------- |
| #1704 | 2026-09-25 20:30 | `0f7b12dbf7a935bf6440beb77077e66a468d6b39` | Migration | `A migrations/20260925090000_user_roles_client_grant_hardening.sql` |

**What the file does** (from its header and body, not inferred):

- Changes privileges on one table, `public.user_roles`, and nothing else. It runs
  `REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC, anon, authenticated` and
  then `GRANT SELECT ON TABLE public.user_roles TO authenticated`.
- End state: `PUBLIC` and `anon` hold **no** privilege on `user_roles`, not even `SELECT`.
  `authenticated` holds `SELECT` only, and the existing "Users view own roles" policy still
  decides which rows it sees. The header records that, measured read-only on 2026-09-25,
  both browser roles held every table privilege (Supabase's default grants on new public
  tables).
- Every other grantee (`postgres`, `service_role`, platform roles) keeps its exact table
  and column privileges. Rows, policies, `has_role()`, triggers and ownership are untouched.
  The postcondition compares a hash of all non-browser grants and policies before and after,
  and aborts if they differ.
- Runs in one transaction (`BEGIN`/`COMMIT`) with `lock_timeout = '5s'`,
  `statement_timeout = '30s'` and a transaction-scoped advisory lock (`20260925, 90000`).
  It fails closed with SQLSTATE `55000`, changing nothing, if a prerequisite differs: the
  table is missing or isn't a plain table (`relkind = 'r'`), RLS is off, the owner isn't
  `postgres`, the migration role isn't a member of the owner role
  (`pg_has_role(current_user, owner, 'MEMBER')`), one of the four expected roles
  (`postgres`, `anon`, `authenticated`, `service_role`) is missing, or `anon`/`authenticated`
  has superuser, BYPASSRLS, CREATEROLE or CREATEDB. It
  also fails closed if a browser role would still hold a privilege afterwards, for example
  through membership in another role. Re-running it is a no-op.
- Client effect: a signed-in browser session can still read its roles, but no browser
  session can insert, update or delete `user_roles` rows. The header says that is intended,
  because roles come from the SECURITY DEFINER staff-grant trigger, `service_role` scripts
  and operators with database access. At the current deploy tip the only browser write
  path, `assignRole()` (`src/lib/db.ts`), is called only from `assignRoleAsOperator()`
  (`src/lib/permissions.ts`), which has no non-test caller. The client reads
  (`fetchUserRoles()`, `useMyEntitlements`) are `SELECT`s as `authenticated`, which stays
  granted.
- No other migration from `20260924120000` onward references `user_roles`, and this file
  doesn't depend on any of them.

**Applied state:** `CURRENT_STATE.md` has no entry for #1704 or `20260925090000`, so its
applied state is **NOT_MEASURED**.

**Before any version-ordered apply, the owner checks whether `20260925090000` is
recorded in production** (for example, a row with that version in
`supabase_migrations.schema_migrations`, or the Remote column of `supabase migration list`).
Doc note only: this amendment didn't read production, and the knk lock and migration hold
still stand.

- **Recorded:** confirm whether the migration executed or was only marked applied.
  Preserve any deliberate skip and its reason in the owner's release receipt. A
  migration-history row alone does not prove the grants changed; treat grant hardening
  as **NOT_MEASURED** until execution or the intended effective grants are confirmed.
- **Pending:** a version-ordered apply runs it after any earlier pending version (including
  #1460's `20260916111000` and #1545's `20260917183000` if still pending, which need the
  owner's call above), then #1703's `20260924120000` if pending, and before
  `20260927002000` (row 1 below) and every later version. If any later version
  is already recorded in production, it is an out-of-order pending version like
  `20260927012000` (step 3 below): `supabase db push` refuses it unless `--include-all` is
  used. Before applying:
  1. Review its effect on client grants (above). After it, `anon` can't read `user_roles` at
     all and no browser session can write it. Confirm nothing in production depends on
     either.
  2. The owner decides: apply it in version order, or record a deliberate skip. A skip
     means the broad browser grants stay in place, and `20260925090000` stays a pending
     local version until it is applied or marked with
     `supabase migration repair --status applied 20260925090000`. Marking it applied
     without running it leaves the grants unchanged. Doc note only: nobody runs that
     without the owner's decision.
  3. Record the decision (applied in order, or skipped and why) in the release receipt.

**Cross-doc gap.** #1895's `docs/release/go-live-checklist-after-402.md` (open at
`c380a439`) restates #1894's order without `20260925090000` or the parked
`20260916111000`/`20260917183000`, and says `20260924120000` "runs first". Whichever of
#1895 and this amendment merges second adds them there.

## Migrations in dependency order

Supabase applies by version (timestamp), not by merge order. Any pending earlier version
sorts ahead of row 1: the parked `20260916111000` (#1460) and `20260917183000` (#1545), then
`20260924120000` (#1703) and `20260925090000` (#1704); see the sections above.
The table is in **version order only**, not merge order: #1834 (row 2) merged after #1741
(row 3) and after all three #1831 files. In version order they are:

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
