# Merged server changes not yet confirmed shipped (since 2026-09-26 00:00 CT = 2026-09-26 05:00 UTC)

Window cutoff: midnight Central time at the start of 2026-09-26, which is **2026-09-26 05:00 UTC**.
Every other time in this doc is UTC. Two server-changing merges landed on 2026-09-26 UTC but
before this cutoff; see "Edge of window" below.

Status: a repository inventory plus a dated production receipt. The inventory, which is
everything above "Production measurement and apply, 2026-10-16", was produced without SQL,
deploy, publish, secret or production query; its applied/published state came **only** from
`docs/agents/CURRENT_STATE.md` at the deploy tip. That final section is a separate,
owner-authorized production receipt (production was read and migrations were applied) and
supersedes the inventory's labels for the versions it names. This inventory was built at `cf929cf7baf0011045430e3a38b28b09632847c6`; the tip
is now `5ea8f1f74209c3576afea0317a471370222fbae3`, and `cf929cf7..5ea8f1f7` touches neither
`supabase/` nor `CURRENT_STATE.md`, so nothing below changes. The later amendment (#1704's
`20260925090000` and the parked #1460/#1545 versions) re-read `supabase/migrations/`,
`CURRENT_STATE.md` and `CURRENT_STATE_ARCHIVE.md` at tip
`a980489ad5188e36eba89461117c2b60fc10f927`. Anything those files don't record is
`NOT_MEASURED`. Applying migrations and publishing edge functions remain Matthew's
decisions under the existing locks (production database knk, HOLD #1250).

**Re-check, 2026-10-16 (tip `e136fa44f377cdbfa98c68289c2f05f7007a9a06`).** `CURRENT_STATE.md`
and `CURRENT_STATE_ARCHIVE.md` still have no entry for `20260925090000`, so its applied
state stays **NOT_MEASURED**. `CURRENT_STATE.md` still records #1460 and #1545 as parked.
Since `a980489a`, five migrations were added under `supabase/migrations/`
(`20261001160000`, `20261003010000`, `20261003020000`, `20261010120000`,
`20261013180000`). All sort after every version named here, so the order below is
unchanged. These versions are outside the ordering list above; their production states
are recorded in the 2026-10-16 receipt below.

**Re-check, 2026-10-28 (tip `4117514f826bdb114f553943e632e266bd991307`).** One more
migration has landed since `e136fa44`: `20261014210000_quicklog_correction_editable_values.sql`.
It sorts after every version named here, so the order below is unchanged. Neither the
2026-10-16 receipt below nor this document records its production state, so it is
**NOT_MEASURED**. The receipt is complete only for the versions it names.

**Production receipt, 2026-10-16 (supersedes the `NOT_MEASURED` labels below for the
versions it names).** See "Production measurement and apply, 2026-10-16" at the end. In
short: production was measured directly, the approved files were applied, the migration
history table records none of it, and **`supabase db push` must not be run** against
production.

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
  publish state of #1683's functions are **NOT_MEASURED**. _(Superseded 2026-10-16 for
  `20260924120000`: the receipt below measured it APPLIED, with no history row.)_
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
_(Superseded 2026-10-16 as operational guidance: the receipt below measured both versions
and forbids `supabase db push` on production outright.)_

> **Production stop rule (2026-10-16 receipt).** Never run `supabase db push` (with or
> without `--include-all`) against production `knkwiiywfkbqznbxwqfh`: migration history
> records none of the versions in this doc, so a push would re-run applied files. Production
> applies go one owner-approved file at a time with a catalog readback, as in "Production
> measurement and apply, 2026-10-16" below. The version-ordered guidance in this section and
> in "Migrations in dependency order" is the pre-receipt inventory, kept as history.

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

**Correction, 2026-10-16.** The paragraph above was written while #1895 was open. #1895
merged on 2026-10-06 19:05:48 UTC as `be1d3c56c27c926136b3bccbb00ab1a1de530ab2` (from head
`c380a4397507b7cfb755af1df9a596232f245f36`), before this amendment. So "whichever merges
second" no longer applies, and this amendment does not edit the checklist. At tip
`e136fa44`, the merged checklist's "Restated from #1894" migration list still opens with
#1703 `20260924120000` as sorting "ahead of every migration below" and running first. It
still omits `20260925090000` and the parked `20260916111000`/`20260917183000`; the parked
pair sorts ahead of `20260924120000`. Until the checklist itself is corrected in a separate
change, use the order in this doc. That correction is not assigned yet.

## Migrations in dependency order

> **Production stop rule:** see the box above. Do not use this order with `supabase db push`
> on production; it documents version ordering and file prerequisites only.

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

## Production measurement and apply, 2026-10-16

Everything above this section was written from repository records only. This section is a
production receipt. Deploy tip throughout: `bfd2a85c48bf55c958757fe15793f8c90e5774c4`
(#2221). Every time is UTC.

**Authorization (`source claim`: Matthew's answers in the Claude close-out session; option
text quoted exactly, answers verbatim).**

- 2026-10-16 22:52:47, question "'Push to production': which production actions do you
  want me to do, beyond merging to verdant-grow-diary (the deploy branch)?". Options: "Apply
  migrations: Apply merged migrations to the production database (knk lock lifted).
  Irreversible schema/data change." and "Deploy Edge functions: Run the Supabase Edge
  function deploy for merged function changes (e.g. #2221 payments-webhook). This changes
  live payment handling immediately." Answer: "Merge only (Recommended),Deploy Edge
  functions,Apply migrations". Same prompt, holds question, answer: "Migration PRs" (#1740
  and HOLD #1250 not selected).
- 2026-10-16 23:09:57, the file list. Answer "Apply batch A (Recommended)" to "Apply these
  to production now, one file at a time in this order, with a stop on any failure:
  20260825233000 …, 20260826100000 …, 20260925090000 …, 20260927002000 …, 20260927094000 …,
  20260927160000 …, 20260928183000 … (#1831 chain steps 1–3), 20261003010000 …". Held files
  also selected: "20260827010000,20261003020000,20261010120000,20261013180000" (the last
  described as "only as step 4 of the guarded manual chain"). Edge: "Deploy after A
  (Recommended)", whose option text was "First I verify PAYMENTS_ENVIRONMENT=live and that
  GEMINI_API_KEY exists (deploy stops if either is missing). Then I publish via Lovable and
  record versions."
- 2026-10-16 23:53:08, after being told that the only deploy path was Lovable's agent and
  that its edits commit without review: "execute".

Scope this establishes: the knk lock was lifted to apply exactly the twelve files listed
here, and Edge deploys were authorized under the stop rule quoted above. It does not lift
the lock for any other write. The Edge update below records where the deploy departed from
that stop rule.

**Path and identity.** The Lovable connector `query_database` on Lovable project
`66255e7b-892c-4be5-8686-ab1cfc3666db`, which runs as `postgres`. The database names
itself as Supabase project `knkwiiywfkbqznbxwqfh` (`edge_function_metric_events.supabase_env`
and the hard-coded `process-email-queue` URL in `public.email_queue_dispatch`), matching
`supabase/config.toml`. `bzatgtgjvuojpoxcknaa` is not production and was not touched.

**Method.** Applied state was measured per migration from the catalog, not from migration
history: `md5(replace(prosrc, E'\r', ''))` of each function compared with the body between
the file's dollar-quote delimiters, plus the policies, grants, columns, triggers and
relations each file creates. Read-only measurement ran 22:55–23:10. The method reproduces
the delivery contract's fingerprints (`ccd841f1`, `1875cf01`, `f587dc46`).

**Migration history is not usable on this database.**
`supabase_migrations.schema_migrations` has 196 rows, maximum version `20260824233603`,
re-read at 23:42:50. It records none of the versions below, including ones that were
already applied before today. A version-ordered `supabase db push` would therefore try to
re-run applied files (for example #1545's plain `CREATE TABLE`) and must not be used.
Recording the versions below in history is the owner's call; nothing here ran
`supabase migration repair`.

### State before today's applies (measured 22:55–23:10)

| Version          | PR             | State                                     | Evidence                                                                                                                                                     |
| ---------------- | -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260914212330` | #1374          | Execution NOT_MEASURED; effect superseded | `20260915193000` replaces the same revoker and itself carries the `paddle_subscription_ref` logic, so the live body cannot show whether this file ever ran   |
| `20260915193000` | #1398          | APPLIED (body-equivalent)                 | Allocator md5 `c9c89539` equals the file. Revoker md5 `42bc7920` vs file `a8962dee`: one collapsed space (`int  :=` → `int :=`); whitespace-normalized match |
| `20260916111000` | #1460 (parked) | NOT_APPLIED                               | No `quicklog_revision_idempotency` table or `quicklog_revision_apply_once`                                                                                   |
| `20260917183000` | #1545 (parked) | Objects present                           | Table, sequence, policies, index, trigger and all four function bodies match. View ACL does not (below)                                                      |
| `20260924120000` | #1703          | APPLIED                                   | `validate_plant_row` md5 equals the file; `plants.health` default and comment match                                                                          |
| `20260925090000` | #1704          | NOT_APPLIED                               | `anon` and `authenticated` each held every table privilege on `user_roles`                                                                                   |
| `20260927002000` | #1831          | NOT_APPLIED                               | Wrapper md5 `0d3098b8` (predecessor)                                                                                                                         |
| `20260927012000` | #1834          | NOT_APPLIED                               | Event wrapper md5 `0043154b`                                                                                                                                 |
| `20260927094000` | #1741          | NOT_APPLIED                               | No restrictive policies, guard function or trigger                                                                                                           |
| `20260927160000` | #1831          | NOT_APPLIED                               | Delegate md5 `7ec296e4`                                                                                                                                      |
| `20260928183000` | #1831          | NOT_APPLIED                               | Wrapper not `1875cf01`                                                                                                                                       |
| `20261001140000` | #1836          | NOT_APPLIED                               | Event wrapper not `959d2add`                                                                                                                                 |

Both open P2s on this PR are answered by this table. `20260915193000` is applied
(body-equivalent, no history row), so it does not run "first" in a correct apply; it only
re-runs if someone uses `db push`. `20260924120000` is applied with no history row, which
confirms the 2026-10-15 owner receipt: the schema effect is measured and the history row is
missing.

### Applied today, in this order (23:10–23:23, each checked by readback before the next)

The four Quick Log manual files went only through the guarded chain in
`docs/quicklog-manual-delivery-order-contract.md`. Each step ran the contract's
`manual_delivery_gate` (predecessor wrapper and delegate hashes, owners, ACLs, runner role)
in the same transaction, with a readback of the expected hash before `COMMIT`.

| Order | Version          | PR    | Readback after apply                                                                                       |
| ----- | ---------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| 1     | `20260825233000` | #1134 | `pheno_hunts` INSERT/UPDATE policies include the grow/tent ownership check                                 |
| 2     | `20260826100000` | #1149 | `pheno_candidate_diary_entries_top_n(uuid[],integer)` exists; only `authenticated` executes it             |
| 3     | `20260827010000` | #1162 | "Users insert own readings" policy carries the operator-attestation exclusions                             |
| 4     | `20260925090000` | #1704 | Own pre/postconditions passed. `anon`: nothing on `user_roles`; `authenticated`: `SELECT` only             |
| 5     | `20260927002000` | #1831 | Guarded step 1. Wrapper `85e40fcd47d1e38dca8f057fee2d905a`                                                 |
| 6     | `20260927094000` | #1741 | 2 RESTRICTIVE policies on `diary_entries`, guard function and trigger present                              |
| 7     | `20260927160000` | #1831 | Guarded step 2. Delegate `ccd841f1af11a03bfca191cf9989c3fd`                                                |
| 8     | `20260928183000` | #1831 | Guarded step 3. Wrapper `1875cf01f7d1aa843d4b8ad080f9bcb2`                                                 |
| 9     | `20261003010000` | #1871 | `clawback_lovable_credit_pack` added; both pack functions `service_role`-only. Ran inside `BEGIN`/`COMMIT` |
| 10    | `20261003020000` | #1872 | `convert_referral` carries the monthly cap; `service_role`-only. Ran inside `BEGIN`/`COMMIT`               |
| 11    | `20261010120000` | #1961 | Two columns, two CHECKs, view gains `notes`, `unit_unconfirmed`. Ran with `SET LOCAL lock_timeout = '5s'`  |
| 12    | `20261013180000` | #1841 | Guarded step 4. Wrapper `f587dc4669f65580eed2d5097caac806`                                                 |

Each file ran once without error; nothing was retried or edited. Only some files carry their
own checks, and those that do passed: rows 4–8 and 12 define both a preflight and a
postcondition; rows 9 and 10 define a preflight only; rows 1, 2, 3 and 11 define neither (the
one `RAISE` in row 2 is a runtime argument check inside the function). For the files without
their own checks, the evidence is the external readback below, not file-defined validation.
Rows 9–11 were wrapped in a transaction because the files have none; the SQL itself is the
committed bytes. Readbacks at 23:42:50 (rows 2 and 4–12) and 23:43:38 (rows 1 and 3) confirmed the
end state of every row.

### Not applied, and why

- **`20260927012000` (#1834) and `20261001140000` (#1836): BLOCKED.** Production's
  `quicklog_save_event_pre_logged_at` md5 is `ef7bdf19` (the `20260721193923` body). Both
  preflights require `674f6b27` (the `20260723210000`/`20260725023000` body, which stamps
  `event_type` into the companion's details), so each would fail closed with no change.
  Open #1846 and #1885 require the same hash. This needs a new forward-repair migration;
  it is not an apply-time workaround. Skipping them also needs an owner record, or a later
  `db push --include-all` fails on them.
- **`20261001160000` (#1827): BLOCKED.** No `cultivars`, `cultivar_aliases` or `breeders`
  relation exists, so its prerequisite `20260722203000_strain_reference_library_v1.sql` is
  also unapplied. That foundation carries a replay-only compatibility patch in
  `config/local-supabase-replay-compatibility.json`, which is not authority to apply a
  patched copy to production.
- **`20260916111000` (#1460): parked, not applied.** Inference, not measured live: the
  frontend calls `quicklog_correct_entry` / `quicklog_retract_entry` with
  `p_idempotency_key`, an overload production lacks, so those calls likely fail today.
- **`20260917183000` (#1545): parked; objects present, not fully conformant.** The four
  function bodies, table, sequence, policies, index and trigger match the file. But
  `sensor_readings_effective` grants `authenticated` every privilege (`arwdDxtm`), the
  default-ACL shape, where the file does `REVOKE ALL` then `GRANT SELECT`. So the file's
  intended grant end state is not present. How this ACL arose is **NOT_MEASURED**; the
  grant difference alone does not show the view was created or re-created outside the file.
  The view joins and computes
  columns, so it is not auto-updatable and those write privileges cannot change rows
  (inference). The hold stays; presence is not a release.
  `20261010120000`'s `CREATE OR REPLACE VIEW` keeps existing privileges and did not create
  this ACL.

### Edge functions

**Not deployed under this receipt.** Deployed Edge versions are **NOT_MEASURED**: the
functions expose no build identifier, `deploy_version` telemetry stops at 2026-07-27, and
there is no read-only path to production's function list or secrets from these tools.
From the import graph at the tip (inference), 23 functions changed since 2026-09-26:
`payments-webhook`; `ai-coach`, `ai-doctor-review`; `mcp`; the other #1869 consumers
listed above; `auth-email-hook`, `delete-account`, `ecowitt-real-ingest`,
`edge-metrics-alert-check`, `paddle-portal-session`, `paddle-webhook`,
`preview-transactional-email`, `send-transactional-email` (#1848); and
`operator-ggs-real-payload-commit` (#1683). Preconditions before any deploy:
`PAYMENTS_ENVIRONMENT=live` (#1869) and `GEMINI_API_KEY` present (#1982; AI Doctor and
Coach fail closed without it). The `payments-webhook` ordering precondition is now met,
because `20261003010000` is applied.

**Update, 2026-10-16 (partial deployment; Lovable's message log shows the deploy request
accepted at 23:56:29 and the agent's completion report at 23:58:04).** The statement above
stays true for the receipt as written. Afterwards, Matthew's "execute" (23:53:08) authorized
deploying through the Lovable project agent's `supabase--deploy_edge_functions` tool, built
from the Lovable project's code. **Departure from the approved stop rule:** that rule said
the deploy "stops if either is missing". `GEMINI_API_KEY` was missing and the
`PAYMENTS_ENVIRONMENT` value could not be read. Claude still deployed the functions that read
neither setting, judging that within the rule's purpose. That judgement is recorded here for
Matthew to ratify or reverse; it is not covered by the quoted approval. That code was
not the deploy tip byte-for-byte, but its diff from `bfd2a85c` touched no file under
`supabase/functions/`. Preconditions, read through the agent (secret names only, never
values): `PAYMENTS_ENVIRONMENT` exists, its value is **NOT_MEASURED**, and `GEMINI_API_KEY`
**does not exist**. So only the 10 functions that read neither setting (traced through their
relative imports) were attempted. The other 13 were held: `ai-coach` and `ai-doctor-review`
for the missing key; `get-paddle-price`, `paddle-webhook` and the other nine
`unionEntitlementLookup` consumers for the unverified payments setting. Recent production
payment events are sandbox only, so a `sandbox` value is plausible (inference).

- **Tool reported deployed (7):** `mcp`, `auth-email-hook`, `ecowitt-real-ingest`,
  `edge-metrics-alert-check`, `preview-transactional-email`, `send-transactional-email`,
  `operator-ggs-real-payload-commit`. The tool returned source SHA-256s but no version or
  timestamp. An unauthenticated GET to each returned its expected 401/405 refusal rather than
  a boot error. That shows each responds, not which version runs: deployed versions remain
  **NOT_MEASURED**.
- **Failed to bundle (3), not deployed:** `payments-webhook`, `delete-account`,
  `paddle-portal-session`. Error: module not found
  `supabase/functions/paddle-webhook/verifyPaddleSignature.ts`, imported at
  `_shared/paddle.ts:14` from a sibling function folder (present since #826). The previous
  versions keep running, so #2221's raw-payload normalization and the webhook's clawback
  call are **not live** (the clawback RPC itself is applied). The repair, moving the verifier
  into `_shared/` with a compatibility export, is pending a protected-file/test approval.
- **Lovable commits during the read-only check (not the deploy).** All authored by
  `gpt-engineer-app[bot]` while the agent's read-only turn ran (request accepted 23:53:26,
  reply 23:54:14): `60a07bdf` "Work in progress" at 23:53:41, an automatic save with the
  `.env.production` checkout token `test_` → `live_` and a regenerated
  `src/integrations/supabase/types.ts`; `9385c4fa` "Changes" at 23:54:13
  (`.lovable/mcp/manifest.json`); and `4bb26176` "Update plan", merging those into
  `bfd2a85c`. They sit on the side branch `lovable-sync-1792194870`, not on the deploy branch,
  and nothing from it is merged. Which Lovable process triggered the automatic save is
  **NOT_MEASURED**; the deploy turn itself made no commit.

### Other production facts recorded for the access review (not changed)

`sandbox_exec` is a LOGIN role with `BYPASSRLS`. It holds SELECT on the `auth.*` tables,
INSERT and SELECT on every `public` table, and default ACLs extending that to future
tables. Its `auth` schema USAGE is **NOT_MEASURED**. The repo treats it as a trusted
platform grantee (`20260820235900`), while the local harness creates it `NOLOGIN`. That
gap is an owner access-review question, with Lovable's documentation as the first source.
No change was made or proposed here.

## Rollback

Docs only. Revert this file. Nothing operational was changed by this file; the production
applies it records are permanent and are not rolled back by reverting it.
