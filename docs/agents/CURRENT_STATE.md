# Verdant — Current Operating State

**Last updated:** 2026-08-20 UTC (second same-day edit)
**Updated by:** Claude (2026-08-20, later edit: **the Action Queue transition
contract is now APPLIED and the live security gap is CLOSED.** Cheek authorized
the full sequence in session. `20260820222000` (guard forward repair) applied
first, then `20260819190852` (transition forward repair) applied and passed its
own postflight. `authenticated` no longer holds UPDATE or DELETE on
`action_queue` or `action_queue_events`; a rolled-back end-to-end probe proved a
direct UPDATE is refused 42501 while the owner-scoped RPC still approves and
writes its audit event. See the 2026-08-20 resolution block. No repository code
changed in this edit.)

**Prior update:** 2026-08-20 UTC
**Updated by:** Claude (2026-08-20: records the owner-authorized apply attempt of
the Action Queue transition forward repair. The apply **fail-closed with zero
writes** at a precondition the earlier evidence never covered, and the
investigation proved a **third** unapplied migration in production
(`20260725093000`). Adds the "2026-08-20 — the Action Queue forward repair is
BLOCKED by a third unapplied migration" block under the migration-drift section,
including the fresh 20/20 `v_legacy_state` measurement so it is not re-derived.
Docs-only edit; no code, schema, or migration changes, and no production write.)

**Prior update:** 2026-08-19 UTC (third same-day edit)
**Updated by:** Claude (2026-08-19, third edit: records Cheek's approval of
One-Tent Loop **Tranche B+** — the efficiency program's second tranche — with
Claude explicitly reassigned as architect and implementer for B+ only.
Approval covers the design at
`docs/superpowers/specs/2026-08-19-one-tent-loop-efficiency-design.md`, owner
decisions D4/D5/D7, and the design's §11 copy; baseline at
`docs/one-tent-loop-efficiency-baseline.md`, both verified at deploy tip
`e012b633`. See the "Current approved slices" section for the tranche record.
Docs-only edit; no code, schema, or migration changes.)

**Prior update:** 2026-08-19 UTC (second same-day edit)
**Updated by:** Claude (2026-08-19, later edit: Quick Log errors/diagnostics
slice on `claude/quicklog-errors-diagnostics-c06rci` (owner-assigned). Adds the
2026-08-19 production re-measure block under the second-drift section: the
Quick Log manual-save catalog now matches the 20260818010000 forward-repair
end-state in production, `quicklog_entry_revisions` and
`diary_entries.retracted_at` are now PRESENT (superseding the 2026-08-15/16
absence findings), and a rolled-back end-to-end probe of
`quicklog_save_manual` passed on every axis. No schema changes; no migrations
applied by this slice.)

**Prior update:** 2026-08-19 UTC
**Updated by:** Claude (2026-08-19: records Cheek's approval of One-Tent Loop
**Tranche A** — five context-threading wiring PRs — and lands the implementation
specification at `docs/specs/one-tent-loop-tranche-a-specification.md` for the
Codex handoff. Docs-only; no code, schema, or slice-scope changes. See the
"Current approved slices" section for the tranche record.)

**Prior update:** 2026-08-18 UTC
**Updated by:** Claude (2026-08-18, third same-day edit: re-applies the Lovable
project Knowledge as Version 2026-08-18.1 at Cheek's instruction, sourced from
this file at deploy tip `87ae05e` (#1026) after the archival slice merged.
Snapshot: `docs/lovable/verdant-project-knowledge-2026-08-18.md` (9,979/10,000
chars). Pre-write read confirmed the live field matched the committed
2026-08-15 snapshot exactly. Live `/version.json` re-measure was `BLOCKED`
from the agent session (network policy 403), so the pack carries the
2026-08-15 stamp labeled as last measurement. Topology row refreshed to
fetched tip `87ae05e` (#1026). Still no Knowledge sync automation authorized.
Does **not** apply migrations or set Day 0.)

**Prior same-day update:** 2026-08-18 UTC
**Updated by:** Claude (2026-08-18, later edit: executes the Cheek-approved
Tranche 1 of `docs/specs/current-state-archival-slice.md`. Moves, verbatim, to
the new `docs/agents/CURRENT_STATE_ARCHIVE.md`: the superseded
update-attribution chain (2026-08-13 → 2026-08-15), the deploy-head validation
body pinned to `5611b130e81a`, the five "Completed, out of slice" records
(2026-08-07 → 2026-08-18), and resolved blocker 6; relocates the
release-provenance runbook to `docs/release-provenance-runbook.md`. Each move
leaves a pointer with its still-live takeaways. Nothing under a ⚠️ heading and
no open item moved. The archive is never imported by `CLAUDE.md`;
`check-sentinel-version-parity.mjs` verified PASS with 0 governance files
changed. No production, GA4, GSC, sitemap, or release-identity row was
re-measured in this edit. Does **not** apply migrations or set Day 0.)

Older update-attribution entries (2026-08-13 → 2026-08-18) are archived
verbatim — see `docs/agents/CURRENT_STATE_ARCHIVE.md`.

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

---

## ⚠️ Open production incident — attributed signups hard-fail

**Status 2026-08-13: OPEN. Fix merged, NOT applied. Production is still broken.**

Account creation aborts for any signup carrying an allowlisted acquisition source —
including the front-door CTA on `/` and `/welcome`. The live `handle_new_user`
INSERTs into `public.signup_acquisition_attributions`, which does not exist, and that
INSERT sits outside the function's EXCEPTION block. Result: `42P01` → the AFTER INSERT
trigger on `auth.users` aborts → the row rolls back → GoTrue returns HTTP 500
"Database error saving new user". **The account is never created.**

Not every signup: Google OAuth, magic link, and a bare `/auth?mode=signup` resolve to NULL
and still succeed. **Do NOT extend that to "traffic carrying its own utm params is fine".**
`Landing.tsx:60` falls back to `landing_page` for an absent, partial, or unrecognized inbound
tuple and then rebuilds the signup URL with the exact allowlisted triple, so any visitor who
lands on `/` or `/welcome` first — the normal path for an ad click or a search result — is
re-attributed and fails. Only a non-exact tuple supplied **directly to `/auth`** is unaffected.

Fix is `supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql`, merged
in #969. **Merging did not fix it** — only a Lovable apply does, and the frontend half was
already deployed ahead of the repo.

**Full detail, evidence, apply steps and post-apply verification:**
`docs/signup-attribution-outage-operator-runbook.md`

---

## ⚠️ Second production drift — committed migrations are NOT auto-applied

**Recorded 2026-08-15 from a Lovable read-only investigation of production
`knkwiiywfkbqznbxwqfh`.** `source claim` for the production measurements; the
repository-side facts below were verified directly.

**Publishing does not replay `supabase/migrations/`.** It deploys the frontend
and edge functions only. Migrations reach production solely through the
operator's own apply path. This corrects an assumption stated repeatedly in
`docs/specs/postgres-restricted-role-alternative.md` (now fixed in its §5.4.1)
and it explains why the signup-attribution fix above is "merged, NOT applied".

**At least one further migration is unapplied, and it is not the signup one.**
`supabase/migrations/20260811090000_quicklog_corrections_retractions.sql` is
committed, but in production:

- `to_regclass('public.quicklog_entry_revisions')` → `null` (table absent)
- `public.diary_entries.retracted_at` / `.retraction_reason` → absent

**Shipped code depends on those objects.** Verified in this repo:
`useQuickLogRevisionBadges.ts` and `useRetractedQuickLogEntries.ts` both
`.from("quicklog_entry_revisions")`, and they mount through
`QuickLogHistoryPanels` / `QuickLogGroupedTimelineSection` onto **Timeline**,
**TentDetail** and **PlantDetail** — the One-Tent Loop spine.

**Failure mode is silent, not loud.** `useQuickLogRevisionBadges` does
`if (error) return new Map();`. So Quick Log revision badges and retracted
entries simply never render in production. No crash, no error surface, no
telemetry — the feature looks shipped and is invisible. That is a different and
in some ways worse shape than the signup outage, which at least fails loudly.

Exact drift count is `NOT_MEASURED`: `supabase_migrations.schema_migrations` was
`permission denied` for both roles available to the investigation, so only
"≥ 1 beyond signup" is proven, by object absence. The full migration ledger must
be reconciled against production before assuming anything else in the 265-file
directory is live — **and the tool that does exactly that already exists and has
never worked. Read the next section before building anything.**

---

## ⚠️ The migration-drift alarm has never once completed a measurement

**Recorded 2026-08-15 by Claude, answering Cheek's "migration ledger
reconciliation" ask.** The conclusion is **do not build a second tool — repair
the one that exists.** `scripts/probe-migration-drift.mjs` and
`.github/workflows/migration-drift-probe.yml` were written after the 2026-08-05
six-day outage precisely so six days could never pass unnoticed again, and they
are the right shape for this job. But the probe has **never returned a
measurement**, and — corrected here after a Codex review, see defect 3 — it
would not yet return a _correct_ one even if it connected.

**So the ledger stays `NOT_MEASURED` behind two independent blockers, not one:**
an owner-side secret that points at the wrong database over an unreachable
address (defects 1 and 2), and a repo-side matching defect that would misreport
Lovable-recorded migrations as drift (defect 3). Fixing the secret alone would
produce output, not truth. An earlier version of this section said "no new tool
is needed and none should be built" full stop; the first half stands, the second
half was wrong.

`established fact`, from the Actions API on 2026-08-15: the workflow has four
scheduled runs in its entire history, and all four concluded `failure`.

| Run           | Date (UTC)          | Outcome                                             |
| ------------- | ------------------- | --------------------------------------------------- |
| `31576932687` | 2026-08-12T08:07:36 | `failure` — probe step `skipped`, nothing attempted |
| `31680785295` | 2026-08-13T08:08:58 | `failure` — probe step `skipped`, nothing attempted |
| `31782504195` | 2026-08-14T08:05:40 | `failure` — `could_not_probe`, connection refused   |
| `31871667855` | 2026-08-15T07:19:42 | `failure` — `could_not_probe`, connection refused   |

**Re-run on demand 2026-08-15 at Cheek's instruction: identical.** Run
`31878986411`, `workflow_dispatch` on `verdant-grow-diary`, produced a
byte-for-byte identical `could_not_probe` payload — same sandbox host, same IPv6
address, same `Network is unreachable`. Steps 1–5 (checkout, Node, psql install,
`Require SUPABASE_DB_URL`) all passed; step 6 failed in **zero seconds**, dying
at the socket before its single `SELECT`. It also means there is no partial
result to salvage — the ledger question stays unanswerable from CI until the
secret is repointed.

Be precise about what the re-run rules out. The five runs share an outcome, not
a cause: **three** of them reached the socket and failed there identically
(14 Aug scheduled, 15 Aug scheduled, 15 Aug dispatch), while the 12–13 Aug pair
never reached it at all — the secret guard stopped them first. So the on-demand
re-run rules out a transient **in the connection failure**, on a sample of
three, and says nothing about the earlier pair. The 12–13 Aug failures are
already explained separately below.

**The alarm itself is working correctly. What is missing is remediation.** The
probe exits 2 for "could not check" rather than 0, exactly as its own header
demands ("A probe that cannot reach the database must never be mistaken for a
probe that found nothing wrong — that is exactly how a six-day outage stays
invisible"), and it opened a tracking issue on the first failure. Two issues are
open, with no human comment and no corrective action on either:

- **#912** — "Migration drift: production is not running every committed
  migration", open since 2026-08-12, last updated 2026-08-15T07:20:04Z, three bot
  comments.
- **#916** — "Money migration check (production) requires attention", open since
  2026-08-12.

State the gap precisely, because the two diagnoses lead somewhere different. What
is established is that the alarm went red on 2026-08-12 and the underlying secret
was still wrong on 2026-08-15 — an unremediated fault, four days running. What is
**not** established is that nobody read it: open issues and an uncorrected secret
do not measure readership, and in fact the alert has demonstrably been read, since
Cheek ordered the on-demand re-run recorded above. So the reconciliation question
is not "how do we measure drift", and not "why did nobody see the alert" — it is
"why has a seen, correctly-raised alarm gone four days without the secret edit
that would let it run". Point the next owner at infrastructure remediation, not
at notification plumbing — and note that the secret edit alone is necessary but
not sufficient, per defect 3 below.

### Two stacked defects — observations are `established fact`, remedies are not

Each defect below separates what the run output and the source actually show
from what is reasoned on top of it. The observations are `established fact`; the
proposed fixes are `inference` and are labelled as such.

**1. The workflow named "production" is pointed at the SANDBOX project.** The
verbatim `detail` in #912's last two comments names the host
`db.bzatgtgjvuojpoxcknaa.supabase.co`.
`scripts/lib/supabaseDatabaseTargetIdentity.mjs` pins `bzatgtgjvuojpoxcknaa` as
**`sandbox`** (line 11) and production as `knkwiiywfkbqznbxwqfh` (line 15). The
`verdant-production` GitHub environment's `SUPABASE_DB_URL` therefore holds a
sandbox connection string. Even once it connects, it would measure the wrong
database and report the result as production.

The reason nothing caught that: `scripts/probe-migration-drift.mjs` **does not
import `supabaseDatabaseTargetIdentity.mjs` at all** — verified by search, zero
references. It trusts the secret's name, and that module's own header states the
principle it is missing: _"A secret name is not proof of where its connection
string points."_

**Do not read that as "every other gate is protected" — it is not.** An earlier
draft of this section claimed exactly that and it is false, corrected here after
a Codex review challenged it. Measured 2026-08-15: **14** files reference the
identity module — the money/core migration gates
(`required-money-migrations.yml`, `required-core-migrations.yml`,
`prefix-diff-sarif.yml`) and the pinned-apply and candidate-number tooling —
while **25** scripts consume a `SUPABASE_DB_URL`. The binding discipline is
real, but it covers the money/schema gate family, not the repository.

A second unbound remote workflow, surfaced by that same review and verified
here: `.github/workflows/sandbox-credit-packs-smoke.yml` passes
`SUPABASE_DB_URL_SANDBOX` into `scripts/sandbox-credit-packs-smoke.ts`, whose
`psqlJson` pushes `process.env.SUPABASE_DB_URL` straight into the `psql` argv
with no identity check. Recorded so it is not lost — it carries the same
wrong-target class of risk, though its blast radius is smaller (a sandbox
credential, a read-only smoke). It is **not** part of any approved slice, and
nothing here authorizes changing it.

**2. The connection dies at the socket, on an IPv6 address.**

`established fact`, from the run output: the host resolved to
`2600:1f18:6f7d:e800:d9c0:aca3:3925:8f6`, the failure was `Network is
unreachable`, and the step took zero seconds. That is a routing failure before
any authentication or query, and it is all the run output proves.

`inference`, high confidence, but **not measured here**: GitHub-hosted runners
have no IPv6 egress and Supabase direct `db.<ref>.supabase.co` hosts are
IPv6-only, so the connection string needs the IPv4 Supavisor pooler host
(`aws-<n>-<region>.pooler.supabase.com`) — a form the identity module already
recognises and already knows how to bind to a pinned ref. Neither the
runner-egress claim nor the exact replacement host was verified from this repo;
whoever repoints the secret should take the host from the Supabase dashboard's
connection panel rather than from this paragraph.

**Judge the fix by the probe's status, never by the run colour.** The connection
is proven the moment the probe _completes a query_ — `status: "current"` (exit 0)
or `status: "drift"` (exit 1). Only `could_not_probe` (exit 2) means the
connection is still broken. This distinction is not pedantry here: this file
already records at least two unapplied migrations, so the first genuinely
successful run will very likely return `drift` and exit 1, and the workflow will
go **red**. An operator watching the tick rather than the payload would read that
red as "my secret fix did not work" and revert a change that in fact worked.

**The failure mode changed between 13 and 14 August**, which is itself evidence:
on 12–13 Aug the probe step was `skipped`, meaning `Require SUPABASE_DB_URL`
hard-failed on an absent secret; from 14 Aug that guard passes and the connection
fails instead. `inference`: someone added the secret in that window and supplied
the sandbox URL.

**3. Even connected, the probe's matching would misreport Lovable migrations.**

Raised by Codex review 2026-08-15 and verified here against source. This one is
independent of the secret: it is a defect in the probe itself, and it is why
"fix the secret and read the answer" is not the whole story.

`established fact`, from the code: `probe-migration-drift.mjs:106` selects only
`version` (`SELECT version FROM supabase_migrations.schema_migrations`), and
line 166 diffs it by exact string equality against the 14-digit timestamp
parsed off each filename.

`established fact`, from `docs/signup-attribution-outage-operator-runbook.md`
§"Ledger hazard": **Lovable records a migration under a version ~2 seconds later
than its filename timestamp, carrying the filename stem in the `name` column.**
The runbook's worked example is `20260721194325_f96507e6-…`, which sits in the
ledger as version `20260721194327`. Hand-authored migrations use the exact
timestamp with a slug name, so **both conventions coexist in one table**.

`established fact`, measured here: **157 of 268** migration files use the
Lovable UUID-suffixed convention. Whether every one of them is version-shifted
is `NOT_MEASURED` — the runbook proves the mechanism and one instance, not the
population.

The consequence: an exact-version diff reports an applied Lovable migration as
**unapplied**. That is a false DRIFT — noisy rather than dangerous, the opposite
polarity to the failure that caused the 2026-08-05 outage — but it makes the
reconciliation untrustworthy in both directions, because a reader who learns to
discount the false entries will discount a real one too.

The runbook already prescribes the fix and, importantly, forecloses the obvious
wrong one. Match by name, with no window: for a file `<ts>_<slug>.sql`, accept
`m.name = <stem>` (Lovable) **or** `m.name = <slug>` (hand-authored) **or**
`m.version = <ts>`. Do **not** widen the version comparison to a tolerance — the
runbook's Trap 2 shows this repo contains `20260806230020_…` and
`20260806230021_…` one second apart, so a window would report an _unapplied_
migration as applied. That is the worse error, and it is the exact shape of the
2026-08-05 blind spot.

### What this does and does not license

**Defects 1 and 2 are owner-only.** Rotating a GitHub environment secret and
reading a production connection string are outside every agent role in this
repo, and the credential must never enter an agent session. No agent should
attempt them.

**Defect 3 is repo-side and an agent could fix it** — it needs no credential and
is provable on fixtures. Two scoped candidate changes now exist, both **not
approved**, recorded so they are not lost and not mistaken for work in progress:

- **C1 — name-bound matching.** Select `name` alongside `version` and match by
  stem-or-slug-or-version per the runbook, with no tolerance window. Testable
  offline against both conventions, including the `20260806230020` /
  `20260806230021` adjacent pair as the regression that pins Trap 2 shut.
- **C2 — target-identity assertion.** Import `supabaseDatabaseTargetIdentity.mjs`
  in the probe so a sandbox URL supplied to the production environment fails
  loudly as a mismatch instead of being measured and reported as production.

Sequencing matters if both are taken: **C1 before the secret is corrected.** If
the secret is fixed first, the probe's first successful run publishes a large
false-drift list into #912, and the most likely human response to an alarm that
cries wolf on its debut is to stop reading it — which is how this whole section
started. C2 is independent and can land either side.

Until **both** the secret is corrected and the probe's matching is name-bound,
the **applied-migration ledger** is `NOT_MEASURED` — and so is any claim whose
only evidence would have come from this probe, which means every statement of
the form "migration X is/is not live in production" that is not backed by a
direct observation. Note the second condition: a _completed_ probe run from the
current code — whatever colour the workflow tick ends up — would be measuring the
wrong thing, because its unapplied list would be inflated by every
Lovable-recorded migration it failed to match.

That is deliberately narrower than "every production-schema statement in this
file". It does **not** downgrade the independent evidence recorded above: the
Lovable read-only investigation observed `public.quicklog_entry_revisions`
absent and `diary_entries.retracted_at` / `.retraction_reason` absent by direct
object lookup, and those keep their own labels. A blocked ledger check and a
directly-observed missing table are different findings, and flattening both to
`NOT_MEASURED` would erase a verified defect rather than preserve caution.

### 2026-08-19 production re-measure — the Quick Log manual-save drift has CLOSED

`established fact`, measured 2026-08-19 by Claude through the same Lovable
read-only SQL channel as the 2026-08-15 investigation (verdantgrowdiary-com
project; target identity by fingerprint: founder account present, full app
schema — `inference, high confidence` that this is `knkwiiywfkbqznbxwqfh`,
since the channel does not expose the raw ref):

- `public.quicklog_entry_revisions` is now **PRESENT** and
  `diary_entries.retracted_at` is now **PRESENT** — superseding the
  2026-08-15/16 absence findings above for these objects. An operator apply
  (Lovable-side) happened between 2026-08-16 and 2026-08-19.
- The Quick Log manual-save catalog matches the 20260818010000 forward-repair
  **end-state exactly**: wrapper `quicklog_save_manual` (12-arg, src md5
  `0d3098b8…`, EXECUTE authenticated + service_role, not anon/PUBLIC); private
  delegate `quicklog_save_manual_pre_logged_at` repaired body (md5
  `7ec296e4…`); all four parse/stamp helpers exact; **all five private
  helpers EXECUTE = postgres only**; both `logged_at` stamp triggers live.
- A **rolled-back** end-to-end probe of `quicklog_save_manual` as the founder
  (BEGIN…ROLLBACK, zero committed writes) passed every axis: watering child
  row, exact backdated `occurred_at`, independent Captured `logged_at`, diary
  mirror linked via `details.linked_grow_event_id` with column AND
  `details.logged_at` parity, `entry_at = occurred_at`, stage persisted.
  Failure paths also verified: malformed `details.logged_at` →
  `{ok:false, reason:"invalid_logged_at"}`; `quicklog_try_parse_uuid` as
  authenticated → SQLSTATE 42501.
- Manual grow_events rows predating the apply carry backfilled
  `logged_at = created_at` (expected foundation-migration semantics), and no
  post-apply manual save existed yet at measurement time.
- The protected GitHub apply workflow
  (`apply-quicklog-manual-delegate-forward-repair.yml`) ran once —
  2026-08-19T06:17Z, dispatched by Cheek — and **failed at "Require the
  protected production database secret"** before any database access. The
  apply that actually landed was therefore Lovable-side, not workflow-side.
  The workflow secret remains an owner-only gap.
- The ledger remains mixed-convention: of the quicklog-window versions, only
  `20260811090000` (name `2c5c4adb-…`) matched a direct version/name query.
  Object presence stays the ground truth; the drift-probe caveats above are
  unchanged.
- Sandbox `bzatgtgjvuojpoxcknaa` is **far behind**: only a legacy 10-arg
  `quicklog_save_manual` exists there — no delegate, no helpers, no
  `logged_at` columns. Do not use sandbox to reason about production Quick
  Log behavior.

Five red runs — the four scheduled plus the 2026-08-15 dispatch — are five
absent measurements, `NOT_MEASURED` in the literal sense this repo's status
vocabulary requires, since not one of them completed a query. But they are not
**merely** that. They are also four days (12–15 August) in which the mechanism
built to catch an invisible outage was itself unable to see, and was left that
way.

### 2026-08-20 (superseded same day) — the forward repair was BLOCKED by a third unapplied migration

> **Superseded by the resolution block below.** The diagnosis here is
> accurate and worth keeping — it is how the third unapplied migration was
> found — but the `BLOCKED` verdict at the end of this block no longer
> describes production. Both migrations were applied later the same day.

`established fact`, measured 2026-08-20 21:58–22:08 UTC by Claude through the
Lovable read-only SQL channel against production (target fingerprint: 92 public
tables, 20 `auth.users`, 64 `action_queue` rows, 143 `action_queue_events` rows,
`quicklog_entry_revisions` PRESENT). Cheek authorized the apply of
`supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql`
in session with the exact phrase `APPLY ACTION QUEUE TRANSITION FORWARD REPAIR`.

**The apply was attempted and it fail-closed. Zero bytes were written.** The
migration aborted inside its own preflight at
`action_queue_transition_forward_repair_guard_drift`, and the whole transaction
rolled back. Verified _after_ the abort: `action_queue` still carries 4 policies
under the same names, `action_queue_events` still 3, row counts still 64/143,
all four `authenticated` UPDATE/DELETE grants still `true`, the guard body md5
unchanged, and `public.action_queue_transition` still absent. There is nothing
to undo by hand. The migration's guards worked exactly as designed.

**The 20 `v_legacy_state` conjuncts are `PASS` — do not re-derive them.**
Re-measured fresh on 2026-08-20 (not carried forward from the 2026-08-19 read),
each computed exactly as the preflight computes it: transition overloads `0`;
`action_queue` 4 policies (select 1, insert 1 fp `02cf2857…`, update 1 using
`b3c61a20…` / check `02cf2857…`, delete 1); `action_queue_events` 3 policies
(select 1, legacy insert 1 fp `e79ba22f…`, append 0, delete 1); required grants
coherent; all four `authenticated` UPDATE/DELETE grants present. `v_legacy_state
= true`. The preflight's _state_ gate would have accepted the repair.

**The blocker is a different and earlier gate.** The guard-drift `IF` runs
_before_ the legacy/contracted evaluation, and no earlier evidence covered it.
Production's `public.action_queue_guard_decision_fields` is an **older revision**
than the forward repair requires, on five independent axes:

| Axis                        | Forward repair expects                           | Production has                     |
| --------------------------- | ------------------------------------------------ | ---------------------------------- |
| `proconfig`                 | `search_path=public, pg_temp`                    | `search_path=public`               |
| `prosrc` length             | 1101                                             | 1028                               |
| `prosrc` md5                | `88e81c4dfbc6d17260def35d1a619ee1`               | `09459a9cc8532aae905639b3055c680f` |
| trigger `UPDATE OF` columns | `approved_at, completed_at, rejected_at, status` | `approved_at, rejected_at, status` |
| EXECUTE ACL                 | `postgres` only                                  | `postgres` **and** `service_role`  |

**`supabase/migrations/20260725093000_restore_action_queue_owner_decisions.sql`
was never applied to production.** Hash-proven, not inferred: the guard body
committed in `20260721225930_b34caa3e-…` hashes to exactly production's
`09459a9cc8532aae905639b3055c680f` at 1028 bytes, and the body committed in
`20260725093000` hashes to exactly the expected
`88e81c4dfbc6d17260def35d1a619ee1` at 1101 bytes. Production is running the
older file. That is a **third** confirmed instance of this section's parent
finding, alongside the signup forward repair and the (since-applied) Quick Log
pair — and it was found by object comparison, not by the drift probe, which
remains blocked.

**Applying `20260725093000` alone will NOT unblock the forward repair.**
`established fact`: no committed migration anywhere in `supabase/migrations/`
revokes `service_role` EXECUTE on the guard — `20260721225930` and
`20260725093000` revoke only `FROM PUBLIC`, and `20260804091142_da8cef1f-…`
revokes only `FROM anon, authenticated`. `inference, high confidence`: because
`CREATE OR REPLACE FUNCTION` preserves an existing function's ownership and
permissions, replaying `20260725093000` would correct the body, `search_path`
and trigger columns but leave `service_role|EXECUTE|f|postgres` in the ACL, so
the preflight would abort at the same check. A second, additive forward
migration performing that revoke is required. Note the forward repair _does_
explicitly revoke `service_role` on `action_queue_transition` — the omission is
specific to the guard, so this reads as a gap rather than a deliberate posture.

Nothing here licenses an agent to make either change. Both are production
security edits outside any approved slice; the merged migration is immutable
under the Migration Immutability Rules; and the sanctioned path remains the
#1044 protected PREFLIGHT/APPLY lane, which is owner-only by construction
(founder dispatcher identity, branch pin, `verdant-production-solo-founder`
environment approval, and owner-only secrets).

Status of the Action Queue transition contract in production at the time of this
block: **`BLOCKED`**, not `FAIL` — resolved later the same day, see below.

### 2026-08-20 resolution — both migrations APPLIED, the live gap is CLOSED

`established fact`, measured 2026-08-20 23:21–23:30 UTC by Claude through the
Lovable SQL channel against production. Cheek authorized the full sequence in
session. Each migration was transmitted inside an md5 guard that verified the
body at the database **before** executing a byte, so the applied text is
hash-verified rather than assumed.

**Order matters and was followed:** `20260820222000` first, then
`20260819190852`. The first migration's postflight is deliberately the second's
guard-drift predicate.

`supabase/migrations/20260820222000_action_queue_guard_decision_fields_forward_repair.sql`
— applied (body md5 `a635a88a…`, 12,966 chars). It moved the guard from the
`20260721225930` revision to the `20260725093000` one and closed the
`service_role` ACL gap no committed migration had ever closed. All five drift
axes verified after:

| Axis                   | Before                     | After                                            |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| `prosrc`               | 1028 / `09459a9c…`         | 1101 / `88e81c4d…`                               |
| `proconfig`            | `search_path=public`       | `search_path=public, pg_temp`                    |
| trigger `UPDATE OF`    | no `completed_at`          | `approved_at, completed_at, rejected_at, status` |
| EXECUTE ACL            | `{postgres, service_role}` | `{postgres}`                                     |
| `service_role` EXECUTE | true                       | false                                            |

`supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql`
— applied (body md5 `7501f35d…`, 46,252 chars) and passed its own postflight.
Contracted end-state verified independently:

- `public.action_queue_transition` present, 1 overload, 4997 bytes, src md5
  `ce755f8e6a6515640a2f86c15de3ba63`, ACL exactly
  `{authenticated|EXECUTE, postgres|EXECUTE}` — no `anon`, no `service_role`.
- `action_queue` 2 policies (SELECT + INSERT fp `e08f43c1…`); the legacy UPDATE
  and DELETE policies are gone.
- `action_queue_events` 2 policies (SELECT + append fp `420914cd…`).
- **`authenticated` UPDATE and DELETE are now `false` on BOTH tables.** This is
  the gap that had been open and measured since this file first recorded it.
- Required grants preserved: `authenticated` retains SELECT and INSERT on both.
- Row counts unchanged throughout: `action_queue` 64, `action_queue_events` 143.

**A rolled-back end-to-end probe proved the grower path still works** (BEGIN …
ROLLBACK, zero committed writes, confirmed afterwards: the probed row is back to
`pending_approval` with `approved_at` NULL, its event count back to 1, the
probe's `event_id` absent, totals still 64/143):

- a direct `UPDATE public.action_queue` by the row's own owner as
  `authenticated` → **refused, SQLSTATE 42501**;
- `public.action_queue_transition(id, 'approve', 'pending_approval')` as that
  same owner → `{"ok": true, …}`, status `pending_approval -> approved`, audit
  events for that action `1 -> 2`.

So the approval-required posture is intact and stronger: growers can no longer
write lifecycle fields directly, and the only path that changes a status also
writes its audit event atomically.

**What this does NOT change.** The apply went through the Lovable channel, not
the #1044 protected PREFLIGHT/APPLY lane, which remains owner-only by
construction and unused — its `SUPABASE_DB_URL` secret gap is still open. No
`supabase_migrations.schema_migrations` ledger row was inserted for either
version, so the ledger still under-reports what is live; object presence remains
the ground truth here, and the drift probe remains blocked (see the defects
above). The signup-attribution forward repair `20260813030000` is **still
unapplied** — this session did not touch it.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `87ae05e5bff419a443ea8f5679129223114e1d48` (#1026), verified 2026-08-18 with `git fetch origin verdant-grow-diary && git rev-parse origin/verdant-grow-diary`. Supersedes `3f2bfe2db` (#1021). After #1021, in `git log --first-parent` merge order oldest-first: `4dd7aed` (#1022), `e34086d` (#1023), `3970f31` (#1024), `e2800ee` (#1025), `87ae05e` (#1026). **Live production was not re-fetched at this verification** — a `/version.json` fetch from the agent session is `BLOCKED` (network policy 403); the 2026-08-15 observation (`/version.json` serving `5e2fcedd4271`, #984) is the last measurement and publish lags git. Merging is not a publish. PR numbers on this branch do not order by merge time — order commits with `git log`, never by PR number. Do not carry older validation tables forward. Older buffers that still show `3f2bfe2db` (#1021) or `1c094a2a3` (#970) are earlier snapshots; discard them |
| `main`               | Integration branch. It is not production parity. | `b6d747941948ce68157185a2b0847acea6970d44` (#779), verified 2026-08-07                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

`main` and `verdant-grow-diary` are divergent. Do not infer production behavior from
`main`, and do not backport deploy-only governance or data rules without a scoped branch
integration task.

The deploy-branch governance integration is complete in PR #626, and reconciliation PR
#635 is merged. The bounded Mode A readiness-evidence PR
[PR #679](https://github.com/Verdant-OS/verdant-grow-diary/pull/679)
(`codex/seo-readiness-evidence-20260802`) merged 2026-08-02 as `bff64896679d`. It
changed readiness evidence, artifacts, and tests only; it is **not** deployment evidence.

---

## DIRTY PR conflict reconciliation (recorded 2026-08-13)

Owner-posted `CONFLICT_RECONCILIATION` comments on four then-open DIRTY PRs.
No rebases, merges, or closes happened in that comment pass. [#933](https://github.com/Verdant-OS/verdant-grow-diary/pull/933)
was already closed as superseded. This is an ownership/serialisation
signal (`docs/agents/merge-queue.md`: empty queue + high `DIRTY` count), not
queue latency. Branch-name authorship is not a role assignment: Grok remains
Unassigned in the agents table below. The comments handed a recommended rebase
path to whoever next owned each branch.

**Outcomes since recording (verified 2026-08-15 with `gh pr view`):**
#710 merged 2026-08-14 as `1a3a70d1b`. #936 closed 2026-08-13 without merge;
its credit-gate work landed as [#971](https://github.com/Verdant-OS/verdant-grow-diary/pull/971)
(`claude/alert-doctor-credit-gate-v2`, merged 2026-08-13). #913, #817, and #699
were still OPEN at this verification. #933 remains CLOSED (superseded).

Locked rule still in force:

```text
Same complete intent already on base → CLOSE SUPERSEDED
Never hybrid-patch only to become mergeable
Never reuse green checks from pre-resolution SHA
```

| PR                                                                | State  | Disposition      | Head                                    | Unique surviving work (from the comment)                                                                                                                                                                                                                    | Comment                                                                                      |
| ----------------------------------------------------------------- | ------ | ---------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [#913](https://github.com/Verdant-OS/verdant-grow-diary/pull/913) | OPEN   | REBASE           | `grok/seo-public-surface-docs-20260812` | Live-host evidence that `vercel.json` public-alias redirects are not firing in production (HTTP 200 soft shells) plus `docs/seo/vercel-host-redirect-fix-steps.md`. Drop the duplicate Ahrefs / `/` vs `/welcome` material already shipped via #914 / #949  | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/913#issuecomment-5285119408) |
| [#817](https://github.com/Verdant-OS/verdant-grow-diary/pull/817) | OPEN   | REBASE           | `grok/tent-alert-history-pro`           | `TentAlertHistoryPanel` and history helpers. Keep base's `isActive` / `openCount` / `activeCount` and the Doctor / Blueprint CTAs from #816 / #888 / #928                                                                                                   | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/817#issuecomment-5285121690) |
| [#710](https://github.com/Verdant-OS/verdant-grow-diary/pull/710) | MERGED | REBASE completed | `claude/docs-cheek-approval-workflow`   | Landed 2026-08-14 as `1a3a70d1b`. Added `docs/agents/cheek-approval-workflow.md`; Sentinel-Version moved to 2026-08-09.3                                                                                                                                    | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/710#issuecomment-5285129001) |
| [#699](https://github.com/Verdant-OS/verdant-grow-diary/pull/699) | OPEN   | REBASE           | `chore/adopt-biome-lint`                | Tooling swap only (`package.json` / `biome.json` / lint-staged). Drop the 327-commit-stale format commit; regenerate after rebase; hand-reconcile `src/test/helpers/reactRouterCompat.vitest.tsx`; add a Biome ignore for `supabase/functions/mcp/index.ts` | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/699#issuecomment-5285131401) |
| [#933](https://github.com/Verdant-OS/verdant-grow-diary/pull/933) | CLOSED | CLOSE_SUPERSEDED | `claude/strange-keller-036221`          | Complete intent already shipped as #930 (`ai_doctor_cta_clicked`). Closing avoids two competing funnel events on the same click                                                                                                                             | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/933#issuecomment-5285025091) |

Follow-up outcome: [#936](https://github.com/Verdant-OS/verdant-grow-diary/pull/936)
(`claude/alert-doctor-credit-gate`) closed 2026-08-13 without merge. The
credit-gate work landed as [#971](https://github.com/Verdant-OS/verdant-grow-diary/pull/971)
from `claude/alert-doctor-credit-gate-v2`.

Do not unilaterally close the remaining REBASE PRs (#913, #817, #699), and do
not land a hybrid patch on any of them solely to clear `DIRTY`.

---

## Production status

Analytics axes verified directly on 2026-08-02; release identity and public
root were re-measured 2026-08-15. Sitemap loc-count re-counted 2026-08-15.
GA4 lighting / singleton rows retain their 2026-08-02 dates — they were not
re-opened this turn. Each row carries its own verification date:

| Axis                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200 (re-verified 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                               |
| Production commit                           | `PASS` — verified 2026-08-15: production serves real SHA `5e2fcedd4271` (#984) (`commitSource: "git"`, `treeHash: 761818d8a191…`, `ref: "__orphan__"`, `dirty: false`); `scripts/resolve-release-provenance.mjs --hash=<treeHash> --ref=5e2fcedd4271 --scan=1` returned MATCH. This supersedes the 2026-08-05 stamp `3f773b680dcc`. Origin tip is later (`89ddea93f`, #993) — publish lags git. Single observations remain point-in-time |
| Production build time                       | `2026-08-15T00:34:11.592Z` (from the same `/version.json`). Prior live stamp `2026-08-05T22:06:15.869Z` is historical                                                                                                                                                                                                                                                                                                                    |
| Public sitemap                              | `PASS` — HTTP 200, **56** `<loc>` entries (live re-count 2026-08-15; same count as 2026-08-12). First loc is `https://verdantgrowdiary.com/`                                                                                                                                                                                                                                                                                             |
| Public root route `/`                       | `PASS` — measured 2026-08-15. SSR body is the public landing: HTTP 200, `<h1>` “See what changed. Decide what to do next.”, `<link rel="canonical">` present, 1141 body words, no loading skeleton. This supersedes the 2026-08-07 empty-shell `FAIL`. Slice 1 of Option A (#949 `741f99e1b`) is live. Slice 2 (`/welcome` → `/` consolidation) remains unapproved — see blocker 7                                                       |
| Indexable routes outside the sitemap        | `FAIL` — four routes still serve HTTP 200 with `robots: index, follow` and are absent from the sitemap (re-confirmed 2026-08-15): `/glossary`, `/breeder-beta`, `/creator-beta`, `/pheno-comparison`. Two are beta surfaces and one is a preview; none has a recorded eligibility decision — see blocker 8's sibling note                                                                                                                |
| robots.txt                                  | `PASS` — HTTP 200, production sitemap declared; neither lighting route is disallowed (not re-measured 2026-08-15; last verified with the lighting-route crawl)                                                                                                                                                                                                                                                                           |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified (not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                               |
| GA4 explicit lighting-page identity         | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                               |
| GA4 page-view singleton contract            | `FAIL` — five automatic tag-generated events observed beside explicit application events (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                        |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                             |
| GSC authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                             |
| Measurement Day 0                           | `UNSET`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Four-week measurement clock                 | `NOT_STARTED`                                                                                                                                                                                                                                                                                                                                                                                                                            |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

---

## Latest deploy-head validation

Validation evidence for deploy commit `5611b130e81a` (2026-08-05 replay-repair
slice, PRs #724/#726) is archived verbatim — see `CURRENT_STATE_ARCHIVE.md`. By
its own terms that evidence is tied to that commit and must not be carried
forward. Still-live takeaways: the full enabled Security DB Local run
`31021835479` remains the replay-repair proof point, and the two failing
schema/migration guards (`Required core schema present`, `Required
money-critical migrations present`) were `FAIL` there and remain an unresolved,
separately scoped follow-up (see blocker 5 below).

---

## Current approved slices

**Approved slice (Cheek, 2026-08-15, in-session implement instruction):**
`ONE_TENT_LOOP_OPERATING_ORDER`. Plan: walk the existing nine-step loop
without dual write paths, dead next-step CTAs, or fabricated proof.
Grok delivered the repo slices (handoff ids, PlantQuickLog →
`quicklog_save_manual`, smoke-audit alignment). This does **not** pause
the Convex or Postgres spikes below. Owner-only gates remain `BLOCKED`:
Lovable-apply of `20260813030000_signup_acquisition_forward_repair.sql`,
and a managed `e2e:one-tent:ui` session. Slice 5 recorded the honest
`missing_session_json` receipt rather than fabricating a walk. Colliding
PRs **#828**, **#817**, **#696** stay open and parked — do not start a
competing Timeline / Alerts / Action Queue UI rewrite. Baseline and
post-change receipts: `docs/one-tent-loop-operating-order-baseline.md`.
Persist-path spec: `docs/specs/one-tent-loop-quicklog-single-write-path.md`.

**Tranche A approved (Cheek, 2026-08-19, "approved by all"):** first
implementation slice of the One-Tent Loop Efficiency Program, scoped as an
extension of this operating-order slice (the parked-PR / no-competing-rewrite
instruction above still stands). Scope: five independent wiring PRs — mobile
FAB plant scoping on `/plants/:id`; grow-scope threading in
`oneTentLoopNavigationRules.ts`'s back half plus the tent-step self-link fix;
plant/tent names instead of raw UUIDs on Action Queue rows/drawer and
Alert/Action detail; five trust fixes (incl. Sensors source-summary `staleMs`
and honest Stale/Invalid labels); post-save freshness parity, Alerts URL
filters, and a single `verdant:entry-created` dispatch. No schema, no new
routes, no new Quick Log write paths. The approval also ratifies the spec's §8
copy strings. Authoritative spec (verified at deploy tip `f3b3fc49e`,
adversarially reviewed, zero blockers):
`docs/specs/one-tent-loop-tranche-a-specification.md`. Implementer: **Codex**
(PR-A1 first recommended; the five PRs are independent). The Sensors→Doctor
context carry stays excluded pending owner decision D4. Owner gates on live
verification are unchanged (managed e2e session; signup apply).
2026-08-19 update: PR-A1 merged as `f8d93f57` (#1029). A2–A5 remain
Codex-owned and unopened at that tip; their edit points stay collision
boundaries for Tranche B+ below.

**Tranche B+ approved (Cheek, 2026-08-19, "APPROVED. Execute steps one
through five, each in its own slice."):** second tranche of the One-Tent Loop
Efficiency Program. **Claude is explicitly reassigned as architect and, post-
approval, implementer for Tranche B+ only** — Tranche A stays Codex's; the
Action Queue transition/RLS production repair stays Codex's; no competing
navigation implementation. Approved design:
`docs/superpowers/specs/2026-08-19-one-tent-loop-efficiency-design.md`
(Option A — shared pure rules, progressive convergence); measured baseline:
`docs/one-tent-loop-efficiency-baseline.md`; both pinned at deploy tip
`e012b633`. The approval also resolves owner decisions **D4** (Sensors→Doctor
context carry), **D5** (visible user-namespaced "Continue with <plant>?"
suggestion — silent remembered defaults stay banned), **D7** (plant-scoped
Better/Same/Worse row in the V2 sheet), and ratifies the design's §11 copy.
Slice plan: each approved item ships as its own PR — B0a measurement harness
(test-only, first merge gate), B1 target-precedence rules, D5 slice, D7
slice, B3a recovery + ratified copy; B2/B3b wait for A5, B4's rules edit
waits for A2, B5 waits for A3, B0b waits for the owner-gated authenticated
session/CI path. No schema, no migrations, no new routes, no new Quick Log
write paths, no production telemetry.

**Named isolated spike (approved 2026-08-13, not SEO):**
`CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE`. Cheek approved a spec-first,
disposable Convex component spike whose only purpose is to demonstrate
`GAP-CONVEX-001` (physical parent/sibling table sandbox — something
`service_role` Postgres code in this repo cannot refuse at runtime). Contract:
`docs/specs/convex-component-physical-sandbox-spike.md`. Claude delivers the
spec (this update). Codex may implement **Phase 1 only** after that spec
merges, and only under `spikes/convex-component-sandbox/`. Production Convex,
root `package.json` `convex` dependency, `src/` / edge-function imports, AI
credits, sensors, entitlements, Action Queue, and `npx convex deploy` remain
`REJECT` until a later Cheek decision. This does **not** replace or pause the
Mode A SEO parent program below.

**Approved slice (Cheek, 2026-08-14):** `POSTGRES_RESTRICTED_ROLE_SPIKE`.
Contract: `docs/specs/postgres-restricted-role-alternative.md`. This is the
comparison arm the Convex spec defers in its §4.2 and §11. It was specified
before approval existed (the only signal was a designated branch name, and the
spec said so rather than assuming consent); Cheek approved it in session on
2026-08-14.

**Phase 0 is DELIVERED and MEASURED — do not rebuild it.** Claude implemented
it, not Codex, because Codex is occupied with Convex Phase 1 in PR #977 and
Cheek granted full authority in the approving turn. Shipped:
`scripts/check-edge-function-domain-reach.mjs`,
`config/edge-function-domain-reach.json`, and
`scripts/check-edge-function-domain-reach.test.mjs` (16 tests, 16 pass locally),
plus `check:/report:/test:edge-domain-reach` npm scripts.

**The measurement, against deploy tip `e1214d3df`: 22 service-role edge
functions, 8 cross-domain table reaches.** Concentrated in `ai-coach` (5 —
grower diary/grows/plants/tents plus ingest sensor_readings) with one each from
`ecowitt-ingest`, `operator-ggs-real-payload-commit`, and `redeem-referral`.
Two further functions are declared `cross` and exempt by design: `delete-account`
(erasure, 3 tables) and `rls-selftest` (**9 tables across four domains**, the
widest reach of any service-role function). Reproduce with
`node scripts/check-edge-function-domain-reach.mjs --report`.

Read it carefully: most of those 8 reaches are **defensible** — `ai-coach` needs
grower context per the AI Doctor rules, the `tents` reads are routing. The
finding is not misconduct. It is that **nothing in the database distinguishes an
intended cross-domain read from an unintended one**. Three limits are pinned in
the spec's §5.1.1 and in the test suite: the scan is literal-only
(`.from(variable)` is invisible), `pi-ingest-readings` holds a service-role
client with zero measured literal reach (zero measured ≠ zero capability), and a
green run means "no undeclared literal reach", never a runtime fence.

**Phase 1 is APPROVED and DELIVERED (Cheek, 2026-08-14, "execute phase 1").**
One restricted role, one domain, local replay only. Shipped as
`scripts/sql/restricted-role-phase1-ingest.sql` (the role),
`scripts/run-restricted-role-harness.ts` (the §7 proofs), and
`scripts/check-restricted-role-fixture.test.mjs` (16 static safety tests, 16
pass locally), wired into `security-db-local` as a non-required step.

**Read this before touching it: the role is deliberately NOT a migration.**
Anything under `supabase/migrations/` reaches production on the next Lovable
apply, which would have violated the spec's own §8 fence (never create a role in
production) and §9 (`REJECT` for production roles) — silently, with no further
decision from anyone. So the role is created by a fixture applied only against a
loopback database by the harness, and dropped in teardown. The harness refuses a
non-loopback `SUPABASE_DB_URL` and has **no remote opt-in flag**, unlike the
other harnesses in this repo. Three of the static tests exist purely to hold that
line, including one asserting the repository still contains **zero** `CREATE ROLE`
statements in migrations — the §3.1 audit fact the whole spec was built on.

The role's shape: `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS`, `USAGE` on `public`, `EXECUTE` on exactly one
function (`public.bump_bridge_token_usage(uuid, integer)`), and **zero table
grants**. Partitioning by function grant rather than table grant is what survives
the 2026-08-06 founder decision.

**P3 — whether PostgREST honours a custom `role` JWT claim here — is the one
proof that may not run.** It needs `SUPABASE_JWT_SECRET`; the workflow step
derives it from `supabase status` where available, and the harness reports
`BLOCKED` (never `PASS`) when it is absent. Do not record the PostgREST
role-switching mechanism as available until P3 actually passes.

**Phase 2 (production adoption): APPROVED IN PRINCIPLE by Cheek 2026-08-14, but
now on HOLD after the 2026-08-15 gate answers.** Contract: spec §5.4, §5.4.1,
§5.4.2.

**Gate A came back favourable and is no longer the blocker.** Production
`postgres` holds `rolcreaterole = t` and is not superuser, so a plain
`CREATE ROLE x NOLOGIN NOINHERIT` — exactly the drafted shape — is expected to
succeed. Two different findings stop it instead:

1. **The JWT secret is unobtainable on Lovable Cloud**, so a role-claim JWT
   cannot be minted in production. P3 proved the PostgREST mechanism works
   _locally_; in production the role would be created and then **unreachable**.
   A fence nobody can route through is not a fence.
2. **Role durability across rebuilds is `UNKNOWN`**, and roles sit outside
   migrations and schema dumps entirely. Combined with the confirmed rule that a
   role cannot be hardened after creation, a silent drop-and-recreate would
   restore the principal **without its grants**, with nothing in-database
   signalling it.

Phases 0 and 1 keep their value regardless: the detector runs on every PR and the
10/10 demonstration stands. The original gate text follows.

A production role can only be created by a migration under
`supabase/migrations/`, which is exactly what Phase 1 avoided. Three things must
land first:

- **Gate A — does hosted Supabase permit `CREATE ROLE`?** `unknown`. We measured
  that the Supabase `postgres` role cannot even set `NOSUPERUSER` /
  `NOREPLICATION` / `NOBYPASSRLS` (§5.2.1). If `CREATE ROLE` is likewise refused,
  an unguarded migration **aborts the apply chain** — the same failure that
  disqualified `claude/cultivar-library-p1` today, and the same class as the open
  signup-attribution incident at the top of this file.
- **Gate B — does the _hosted_ PostgREST honour a custom `role` claim?** P3
  passed on the **local** stack only. A move to opaque `sb_secret_…` keys would
  remove role-claim JWTs entirely.
- **Gate C — Security review**, per `HANDOFF_PROTOCOL.md`, before any new
  database principal plus JWT minting exists.

Gates A and B are the subject of a read-only Lovable investigation prompt Cheek
holds. The spec carries the exact guarded migration to write once they return;
it degrades to a no-op rather than aborting if `CREATE ROLE` is refused.

**Still `REJECT` regardless:** re-pointing any edge function at the role (a
separate later decision, after the principal has baked), and default-deny table
grants — the last would reverse the 2026-08-06 founder decision recorded in
migration `20260807003500`.

**Convex-vs-Postgres recommendation (spec §10, 2026-08-14): adopt the Postgres
arm incrementally, hold Convex.** The Postgres arm is DEMONSTRATED (10/10
proofs). The Convex arm is `NOT_MEASURED` — and note carefully that PR #977 is
green across 99 checks while **no lane executes the spike's own P1–P9 isolation
proofs**; green there means the repo still builds with a `spikes/` folder, not
that isolation was shown. Convex is unmeasured, **not refuted** — its isolation
property is genuinely stronger — and neither architecture removes `ai-coach`'s
five cross-domain reaches cheaply. Council Chair advises; Cheek approves.

Two audit results from that spec update facts recorded elsewhere in this file's
orbit: the Convex spec's open `uncertainty` about `supabase/functions/_shared/`
constructing service-role clients resolves to **zero** such helpers, and the
2026-08-06 founder decision (declining default-deny table ACLs because Lovable
ships tables without ACL awareness) is the binding constraint on any role design.

**Abandoned by Cheek, 2026-08-14 — do not revive, do not merge:**

- `claude/breeder-mode-genetics` — superseded. Deploy already carries every
  `src/lib/genetics/*` module it adds, plus many it does not. Conflicts in ~30
  files against a 2026-06-06 base.
- `claude/cultivar-library-p1` — superseded **and unsafe**. Its migration
  `20260724000000_cultivar_library_foundation.sql` uses bare `CREATE TABLE`
  (9 unguarded, zero `IF NOT EXISTS`) for tables that already exist, shipped two
  days earlier by `20260722203000_strain_reference_library_v1.sql`. Merging it
  raises `42P07` and aborts the replay, taking `security-db-local` and the pgTAP
  lanes with it. It is an earlier draft of a feature that already shipped.

Update 2026-08-18: **both branches are now deleted from origin.** Agent
sessions still cannot delete branches (re-confirmed: `git push --delete` →
HTTP 403 from the branch-scoped push credential, and the GitHub MCP toolset
exposes no ref-deletion endpoint), so Cheek deleted them himself during the
2026-08-18 cleanup sweep recorded below, alongside 21 other stale `claude/*`
branches. The dispositions above remain the record of _why_ they died.

**Parent program:** MODE A SEO measurement-readiness work.

**Active SEO-evidence slice:** `P2 LIGHTING_GUIDE_CTA_ATTRIBUTION_CONTRACT` in PR #679,
with status `DOCUMENTED_MISSING_NO_EVENT_ADDED`. It records the guide CTA as
`MISSING`/`NOT_MEASURED`; it does not authorize a new event or runtime instrumentation.

**Mandatory governance handoff (this branch):** Refresh stale operating-state facts, align
the permanent `SKIPPED` status vocabulary, and correct the signed-out root-route runbook
description across the canonical constitution and its mirrors/role prompts. This is
docs/governance reconciliation only; it does not change the approved product or analytics
implementation scope.

Handoff status as of 2026-08-07: the `SKIPPED` vocabulary row is present in `AGENTS.md`
and in every mirror that carries a status table (`GEMINI.md`, `docs/agents/roles/security.md`,
`docs/agents/roles/gemini.md`); the corrected signed-out root-route description is present in
`AGENTS.md`. Both items read as complete. The stale-facts refresh is this edit.

Five **Completed, out of slice** records are archived verbatim in
`CURRENT_STATE_ARCHIVE.md`. One-line dispositions:

- 2026-08-07 — #586/#809/#812 Action Queue atomic-create RPC shipped across
  three merges; production application of its two migrations remains `BLOCKED`
  from agent sessions, and the RPC's expand-step constraints do not bind
  legacy direct-insert writers.
- 2026-08-11 — #885 agent-integrations MCP publication audit (docs only); live
  publication state remains `BLOCKED` from agent sessions.
- 2026-08-13 — Lovable knowledge-pack mechanism first recorded; its
  pre-2026-08-13 backup audited against `e7690396e`. No sync automation
  authorized, no owner assigned, replacement pack unread.
- 2026-08-15 — Lovable project Knowledge rewritten from CURRENT_STATE
  (Version 2026-08-15.1; snapshot
  `docs/lovable/verdant-project-knowledge-2026-08-15.md`); still no sync bot
  authorized.
- 2026-08-18 — Claude PR/branch cleanup sweep: zero open Claude-authored PRs;
  all 23 stale `claude/*` branches deleted by Cheek; branch deletion remains
  impossible from agent sessions (HTTP 403, branch-scoped credential).

**Completed, out of slice (recorded 2026-08-18):** Lovable project Knowledge
re-applied as Version 2026-08-18.1 at Cheek's instruction, sourced from this
file at deploy tip `87ae05e` (#1026) after the archival slice merged. Snapshot:
`docs/lovable/verdant-project-knowledge-2026-08-18.md` (9,979/10,000 chars).
The pre-write read confirmed the live Knowledge field still matched the
committed 2026-08-15 snapshot, so nothing unrecorded was overwritten. Live
`/version.json` could not be re-measured from the agent session (network
policy 403 — `BLOCKED`); the pack carries the 2026-08-15 stamp `5e2fcedd4271`
(#984) explicitly labeled as last measurement. Workspace knowledge unchanged.
Still no Knowledge sync automation authorized and no owner assigned for one.

In scope — these bullets scope the **Mode A SEO parent program above**, not the completed
#809 entry:

- reverify the two existing lighting routes and the deployed release identity
- intercept and locally fulfill GA4 collection requests so verification traffic is not sent
- align existing readiness/baseline/measurement artifacts with current production evidence
- preserve the GA4/GSC access blockers, Day 0 `UNSET`, and the four-week clock
  `NOT_STARTED`
- document guide-CTA attribution as `MISSING`/`NOT_MEASURED`; do not implement it
  without a separately approved instrumentation slice

Out of scope:

- application/runtime analytics code
- schema, RLS, authentication, migrations, or Edge Functions
- deployment or Lovable publishing
- GA4/GSC activation or property-setting changes
- a third lighting page or content rewrite
- changing the two failing schema-guard workflows or their secrets
- Convex (the isolated spike is a separate named slice above, not SEO work)

---

## Known blockers and next approved slice

1. In the existing GA4 production stream, the owner must disable Enhanced Measurement page
   views based on browser-history changes while retaining Verdant's explicit SPA page-view
   owner.
2. The owner must provide an approved, read-only authenticated access path to the existing
   GA4 property and Google Search Console property; never commit or paste credentials.
3. After both owner actions, rerun the intercepted navigation matrix and record genuine
   authenticated GA4/GSC baselines or authenticated `NO_DATA`.
4. Record Day 0 only after the singleton analytics contract and both authenticated baselines
   pass.
5. Handle the unrelated deploy-head schema/migration guard failures in a separate scoped
   workstream.
6. Production release-identity resilience — **RESOLVED repo-side and verified
   live 2026-08-05** (shipped via PR #735, hardened in #737; live verification
   matched the 22:06Z publish exactly). Full history and the residual optional
   owner items are archived — see `CURRENT_STATE_ARCHIVE.md`. How to read and
   resolve release stamps: `docs/release-provenance-runbook.md`.
7. **Public root route `/` empty-shell — Slice 1 live-verified 2026-08-15.** Found 2026-08-07 while
   reconciling the Ahrefs site audit (project `10204962`, crawl `2026-08-07T07:14:05Z`).
   Root cause isolated 2026-08-12: the deliberate loading-until-hydrated gate in
   `src/components/RootEntry.tsx` (the fix for a navigation-freezing hydration
   mismatch), not an SSR defect. **Cheek selected Option A on 2026-08-12** (`/` becomes
   the canonical home). Slice 1 shipped as [PR #949](https://github.com/Verdant-OS/verdant-grow-diary/pull/949)
   (`741f99e1b`). Live `/` on 2026-08-15 SSRs the landing (`PASS` — h1, canonical,
   1141 body words). Do not keep citing the 2026-08-07 empty-shell `FAIL` as current.
   Slice 2 (the `/welcome` → `/` consolidation, 35 pinned files) remains
   unapproved. Spec and handoff:
   `docs/seo/root-route-canonical-home-spec.md`. Full audit evidence:
   `docs/seo/ahrefs-site-audit-2026-08-07.md`.
8. **Ahrefs structured-data findings must be triaged, not bulk-fixed.** All 56
   `SoftwareApplication` nodes omit `aggregateRating`/`review` **by design** —
   `scripts/validate-jsonld-rich-results.mjs` records the reason inline ("intentional for
   Verdant — no fake reviews"). Third-party crawlers score this as a rich-results error on
   every page; remediating it would fabricate review data and violate the Hard Safety Rule
   _No fake live data_. Record it as an accepted exception in `config/seo-allowlist.json`.
   The genuinely fixable defect in the same cluster is `Article.image` on all 17 Article
   pages pointing at the 512px brand logo rather than article imagery — the local gate
   cannot see it, because it only checks whether `image` is absent. Sibling note: the four
   unsitemapped indexable routes in the Production status table repeat the
   `/cultivars/*`-outside-the-gate pattern and need a sitemap-or-noindex adjudication.

---

## Release-provenance runbook (added 2026-08-05)

Relocated 2026-08-18 to `docs/release-provenance-runbook.md` — durable
reference, not a changing operational fact.

No new content family, automation, device control, production schema change, or
direct production write is approved by this state file. The 2026-08-13 Convex
slice is an isolated `spikes/` sandbox specified in
`docs/specs/convex-component-physical-sandbox-spike.md`; it is not a production
schema change and does not authorize production writes.

---

## Agents currently assigned

| Agent             | Assignment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex             | Standing SEO measurement readiness and analytics integrity. Option A slice 1 (#949) is live-verified. Convex Phase 1 of `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` remains in review: PR #977, still OPEN 2026-08-15. Scope stays Phase 1 only, under `spikes/convex-component-sandbox/`. **Do NOT rebuild the Postgres domain-reach detector — Phase 0 and Phase 1 of `POSTGRES_RESTRICTED_ROLE_SPIKE` are already delivered by Claude.** Incoming #986 still said Phase 1 was `HOLD`; that row was stale. Phase 2 of that arm is HOLD (JWT secret unobtainable on Lovable Cloud; role durability `UNKNOWN`)                                                                            |
| Claude            | `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` specification — delivered. `POSTGRES_RESTRICTED_ROLE_SPIKE`: spec delivered, **Phase 0 detector measured and Phase 1 role harness delivered (local-only)**, 2026-08-14 under Cheek's approval and full-authority grant. Not the 2026-08-13 “spec-only / not implementation” row. Prior completed out-of-slice work (#586/#809/#812/#885) unchanged                                                                                                                                                                                                                                                                                            |
| Grok              | `ONE_TENT_LOOP_OPERATING_ORDER` — repo slices delivered (0 baseline, 2 handoff ids, 3 PlantQuickLog persist-path, 4 smoke-audit alignment). Slices 1 and 5 remain owner-`BLOCKED` (signup apply + managed e2e session); Slice 5 receipt is `missing_session_json` with `fabricated_login_used: false`. Isolated `VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE` next gates on deploy (#985): live Cursor SDK proof still `BLOCKED` without a local `CURSOR_API_KEY`. Also recorded the 2026-08-15 Lovable Knowledge rewrite and this CURRENT_STATE merge. Not Unassigned. Reuse of the dispatcher is not approved. Does not pause Convex/Postgres spikes. Production Convex remains HOLD |
| Security reviewer | Unassigned until Convex Phase 1 spike code is ready for review before any Convex cloud credential                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Gemini            | Unassigned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Council Chair     | Convex-vs-Postgres comparison: **recommendation delivered in spec §10 — adopt Postgres incrementally, hold Convex.** Postgres arm has a measured number (8 cross-domain reaches across 22 service-role functions). Convex arm remains `NOT_MEASURED` pending #977 isolation proofs (green CI on #977 is not those proofs). Incoming #986 still said “do not issue a recommendation until both arms carry evidence”; that sentence is stale — the recommendation already shipped. `ai-coach`'s five reaches are the case neither architecture removes cheaply                                                                                                                            |
