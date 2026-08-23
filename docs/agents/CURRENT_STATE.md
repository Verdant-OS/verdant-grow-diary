# Verdant — Current Operating State

**Last updated:** 2026-08-23 UTC (02:09 UTC)
**Updated by:** Claude (2026-08-22, review round: **the payments-token severity was
INVERTED and is corrected.** An earlier revision said production "is running **live**
payments". It is not. At the served SHA a `live_` token resolves to `unavailable`
(`src/lib/paddleEnvironment.ts`; confirmed in the shipped bundle's minified resolver),
so checkout is **disabled** — a checkout-blocking configuration and provenance defect,
not an unnoticed live billing surface. The publish risk flips with it: a live → test
swap **restores** sandbox checkout rather than breaking anything. Raised by Copilot,
verified in source and bundle before conceding.

Also withdrawn the same round, after a further P2: **"the shipped bundle came from
neither `.env.production` file"** — both files were read AFTER deployment, so a
workspace file carrying a `live_` value at build time and restored afterwards is
excluded by nothing measured. Two build-time candidates are now recorded, with a
direction not to discard the second.

**Sixth review finding of the round, and the sixth correct one.** #1092 merged at
17:55:57 UTC from head `fcf400ec7` while a fix for it was queue-locked (`GH006`), so
this follow-up carries it: the over-claim "the file demonstrably is not what produced
the current bundle" **survived the earlier correction in a second sentence of the same
section**, contradicting candidate 2 that the section itself says not to discard. That
is the failure mode named two corrections earlier — fixing the pointed-at instance
rather than the class — so this pass swept the whole file, and the only remaining
occurrences are inside withdrawal notes quoting the withdrawn text.

Tip and lag re-measured 2026-08-23 02:09 UTC: tip `a3ae36765` (#1105), publish lag
**12**; production still serves `faea6e9c59ad`, **unchanged since 2026-08-22 16:16
UTC — nearly ten hours with no republish**, while the tip advanced seven times in the
same span. Read which half moved before drawing any conclusion from the widening
number.

Same round, from Codex and Copilot findings: the hand-maintained publish count
(four → **five**), the #1076 gate row (**re-queried**, not carried forward), the
`/version.json` row's own date (was 2026-08-21 while neighbouring rows quoted
2026-08-22 readings of the same endpoint), and a malformed markdown quotation.
Prior header follows.)

**Prior update:** 2026-08-22 UTC (17:10 UTC)
**Updated by:** Claude (2026-08-22, later edit: records the **#1092 owner/reviewer
pairing** in the architecture-audit section, per `HANDOFF_PROTOCOL.md:25` — Cheek
named **Grok (GDP)** as independent peer reviewer on the PR at 17:09 UTC and marked
it ready for review in the same minute. No agent performed either transition, and a
_named_ seat is not a _discharged_ one. Also flags that the MACAE row lower in this
file names Grok for a **different** slice; do not collapse the two.

Re-measured at 17:09–17:10 UTC because the base moved again while this was open:
tip is now `fd2d3e3f7553` (#1100) and publish lag is **7** — production still serves
`faea6e9c59ad`, unchanged since the 16:16 UTC reading. Prior header follows.)

**Prior update:** 2026-08-22 UTC (16:16 UTC)
**Updated by:** Claude (2026-08-22: **docs-only re-measurement.** Production
republished overnight and the deploy tip moved six commits, so every perishable
release row this file carries was stale in the same direction. Re-read first-hand at
16:16 UTC: tip `93d8ea23ff58` (#1097); production serves `faea6e9c59ad` (#1087),
`buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`,
`treeHash 7d9cc8a12898`; ancestor of tip; publish lag **6**.

**The post-#1090 provenance test finally had a build to run against, and it returned
no information — which is the correct reading, not a disappointment.** `faea6e9c59ad`
contains #1090, and its recomputed tree `436eede41e4b` still mismatches the stamped
`7d9cc8a12898`. The record's own one-directional rule says persistence neither
confirms nor refutes the #1090 candidate, because a workspace already dirtied stays
dirty until reset. Do not report this as a refutation. The publisher's build log
remains the only route that settles it, and stays owner-gated.

**The live-class payments token survives the republish — and it FAILS CLOSED.**
Severity corrected 2026-08-22 after review: a `live_` token resolves to
`unavailable` in the served code, so production is taking **no** payments rather
than live ones, and checkout is disabled. See the severity-correction block in the
payments-token section. Re-measured against the new
bundle `/assets/index-C-R0_Bat.js` (the path changed from `index-aTS7aKMk.js`, so
this is a rebuild, not a cache): still `live_` class, body length 27, one distinct
value, two occurrences — while the Lovable project `.env.production`, re-read in the
same window per the owner's standing pre-publish instruction, still says `test_`. A
build cycle did not reconcile them. **Publishing remains stopped by owner order**,
and reading the env file is not a clearance: it said `test_` yesterday too, while
production shipped `live_`.

Touches this file only. Does **not** publish, does **not** apply
`20260813030000` (the hard stop below is unchanged), does **not** re-measure
GA4/GSC, Day 0, or migration state, and invents no metric. Prior header follows.)

**Prior update:** 2026-08-21 UTC (~15:23 UTC / 10:23 AM CT)
**Updated by:** Grok (2026-08-21: **docs-only correction** — #1077 pinned
production at `1400a7e77eff` and leftover Action Queue prose still said
`20260813030000` was unapplied; both are now false on a fresh point-in-time
re-measure. Host `/version.json` re-fetched just now serves
`39935889fe02` (#1080), **not** #1077 (`999b6da`) and **not** #1083
(`1400a7e`). Identity vs provenance recorded separately: identity
`39935889fe022efd441dc5ab86bfbf636d284739`; provenance remains
`dirty: true` / `ref: "__orphan__"` / `commitSource: "git"` — **not** upgraded
to provenance `PASS`. Cause of dirty/orphan `NOT_MEASURED`. Do **not**
compare `treeHash` to `git rev-parse ^{tree}` (different hash functions;
#1077 already corrected that false corroboration).

Production signup objects re-checked the same window via Lovable
`query_database` on project `66255e7b-892c-4be5-8686-ab1cfc3666db`
(production, not sandbox): table + helpers + failure-safe `handle_new_user`
(`md5 34405b3ee446340a55ad4f25e2193c9a`, `RAISE LOG` guard present from
`20260821150000_signup_acquisition_failure_safe_attribution.sql` via Lovable
SQL — **not** via the GitHub apply-signup workflow, which still shows only
the failed PREFLIGHT) + readiness RPC. Ledger **name-rows** for
`20260813030000` and `20260821150000` are present (founder backfill marker
`ledger-only;objects-already-applied;no-rerun`, `created_by`
`founder-ledger-backfill`); `20260821064300` is still **not** in the ledger.
**Hard stop:** do **not** GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql` — that file would
re-issue an unguarded `handle_new_user` and overwrite the live `RAISE LOG`
guard. Touches this file only. Does **not** re-measure GA4/GSC, Day 0,
parked #828/#817/#696, or invent metrics.)

**Prior update:** 2026-08-21 UTC (post-publish Production status rows, #1077)
**Updated by:** Claude (2026-08-21: applies the measured post-publish production
rows. The 2026-08-20 sitemap adjudication PUBLISHED, so five Production status
rows plus the branch-topology row were stale in the direction that matters —
they described a fix as pending that had already shipped. Re-measured over live
HTTPS, most recently at 2026-08-21T12:57 UTC: live sitemap is **61** `<loc>`
(was 56), and **"Indexable routes outside the sitemap" moves `FAIL` → `PASS`** —
five advertised and self-canonical, `/breeder-beta` correctly absent while
cross-canonicalising to `/creator-beta` and staying `index, follow`, verified
live rather than inferred from the merge. Closes blocker 8's sibling item.

**Read the Production commit row before quoting it.** At that 12:57 UTC
reading production served `1400a7e77eff` with **`dirty: true`** and provenance
**`NO_MATCH`**. **Superseded same day ~15:23 UTC** — host now serves
`39935889fe02` (#1080); see the Latest updated block and the Production
status table. Commit _identity_ remains separable from _provenance_; do not
smooth provenance into a `PASS`. Cause of dirty/orphan stays `NOT_MEASURED`.

These rows were specified in §8 of `docs/specs/current-state-refresh-2026-08-20.md`
(#1067) and routed to PR #1060, which owned this file; #1060 merged without
folding them in, and the collision that blocked a direct edit ended with it. The
values here were a FRESH measurement at write time, not a replay of §8 —
production moved `6cf3ffda0686` → `92a983b4832e` → `1400a7e77eff` across that
session, then later to `39935889fe02`, which is the whole argument for
re-measuring before writing, and the reason every row here carries its own
timestamp.

This edit changes no schema, migration, or governance file — it touches this file
only. The merge commit carrying it does inherit the deploy branch's own changes
(#1051's governance bump to `2026-09-01.2`, #1080's signup hardening migration);
those are inherited, not authored here. Does **not** measure indexation or
migration state, and does **not** set Day 0.

Ordering note: this edit and the signup-attribution resolution directly below
are independent same-day changes touching different sections of this file. The
order here reflects when each edit landed in this document, not when each
measurement was taken.)

**Prior update:** 2026-08-21 UTC (signup-attribution resolution, #1080)
**Updated by:** Claude (2026-08-21: **the signup-attribution forward repair is
now APPLIED and the live outage is CLOSED.** Acted on Cheek's in-session
"fix things I deliberately left for you" instruction, covering the three items
recorded at the end of the prior turn's work. Applied
`supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql` to
production verbatim through the same Lovable SQL channel as the Action Queue
repairs, guarded by an md5 transcription check against the runbook's pinned
SHA-256 identity so the applied bytes are verified, not assumed — the first
attempt caught a real transcription slip and aborted with zero writes before
the corrected retry succeeded. `public.signup_acquisition_attributions` and
all four functions now exist; a rolled-back end-to-end probe of the exact
allowlisted-source failure path passed. The merged migration never revokes
`service_role` (zero occurrences, confirmed by grep), so this project's legacy
default privileges would otherwise leave `service_role` holding unintended
access on all five objects — the same class of gap already recorded for the
Action Queue guard below. An ad-hoc supplemental `service_role` revoke was
applied through the same channel at apply time and is now captured as a new
additive migration, `20260821064300_signup_acquisition_service_role_hardening.sql`,
validated on a local PostgreSQL 16 replay, so a fresh provision or
disaster-recovery restore reaches the same hardened state rather than
silently reopening it. See the 2026-08-21 resolution block under the
signup-attribution section for full evidence. No `schema_migrations` ledger
row was written for either signup version, consistent with this file's own
"founder decision" framing for that class of write. No governance file
changed in this edit.)

**Prior update:** 2026-08-20 UTC (second same-day edit)
**Updated by:** Claude (2026-08-20, later edit: **the Action Queue transition
contract is now APPLIED and the live security gap is CLOSED.** Cheek authorized
the full sequence in session. `20260819190000` (guard forward repair) applied
first, then `20260819190852` (transition forward repair) applied and passed its
own postflight. `authenticated` no longer holds UPDATE or DELETE on
`action_queue` or `action_queue_events`; a rolled-back end-to-end probe proved a
direct UPDATE is refused 42501 while the owner-scoped RPC still approves and
writes its audit event. See the 2026-08-20 resolution block. No repository code
changed in this edit.)

**Prior update:** 2026-08-20 UTC
**Updated by:** Claude (2026-08-20: corrects a production-liveness false negative on
branch `claude/verdantgrowdiary-dns-issue-hag3co`. An agent reported
`verdantgrowdiary.com` **offline and unindexed** from a single sandboxed DNS
failure and recommended repointing production DNS; the site was live throughout.
Re-measures seven Production status rows over live HTTPS — release identity is now
`f09febc354a4` (#1049), build `2026-08-20T18:49:50.600Z`, provenance MATCH — and
refreshes the deploy-branch topology row to tip `9b644565` (#1042). Adds
`docs/agent-session-network-reachability.md`.

Second, executes Cheek's 2026-08-20 **SITEMAP** adjudication on the unsitemapped
indexable routes. The set measured **six**, not the four this file recorded; five
were added to `public/sitemap.xml` (56 → 61 `<loc>` in-repo). `/breeder-beta`, a
self-declared copy-only duplicate of `/creator-beta`, was held for an owner call
and then resolved the same day: Cheek chose canonicalisation, so it now points its
canonical at `/creator-beta`, stays `index, follow`, and stays out of the sitemap
by design. That adds a `canonicalPath` option to `usePageSeo` and a
`crossCanonicalDocument` build-time helper, pinned by
`src/test/breeder-beta-cross-canonical.test.ts` and
`src/test/use-page-seo-canonical-path.test.tsx`.

No schema, migration, or governance-file changes. Does **not** measure indexation
or migration state, does **not** move production — the live sitemap stays at 56
until the next publish — and does **not** set Day 0.)

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

## ✅ RESOLVED 2026-08-21 — attributed signups hard-fail

**Status 2026-08-21: RESOLVED. The forward repair is applied to production
and the outage is closed.** The block immediately below is preserved verbatim
for its diagnosis and evidence — it is still an accurate description of the
bug that was fixed — and the original 2026-08-13 status line is superseded.
See the dated resolution subsection at the end of this section for what
changed and what was verified.

**Status 2026-08-13 (superseded): OPEN. Fix merged, NOT applied. Production is still broken.**

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

### 2026-08-21 resolution — the forward repair is APPLIED, the live outage is CLOSED

`established fact`, applied 2026-08-21 by Claude through the same Lovable SQL
channel used for the Action Queue repairs above, at Cheek's authorization in
session to act on the three items left open at the end of that prior work.

`supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql` was
applied to production **verbatim** — transcription verified before any
statement executed, by wrapping the exact file bytes in an md5 guard and
checking them against the runbook's pinned identity (SHA-256 `6c002ab6…`,
17297 bytes) rather than trusting a copy-paste. The first attempt caught a
real one-character transcription slip (a stray leading newline from this
session's own dollar-quote formatting) and aborted with **zero writes** before
it could apply anything wrong; the corrected retry succeeded.
`public.signup_acquisition_attributions` and all four functions
(`handle_new_user`, `record_signup_acquisition_first_touch`,
`signup_acquisition_operator_snapshot`, `signup_to_paid_operator_snapshot`)
now exist in production.

**A rolled-back, zero-committed-write functional probe exercised the exact
failure path this section describes** — an allowlisted acquisition source
through `handle_new_user` — and passed all 8 assertions checked (BEGIN …
ROLLBACK throughout; the first attempt hit a permission-denied error writing
probe results while impersonating `authenticated` against an ungranted temp
table, was restructured so the role switch wraps only the privileged calls,
and then passed clean).

**The merged migration never revokes `service_role`** — zero occurrences of
the string anywhere in the 456-line file, confirmed by grep before relying on
it. On this hosted project's legacy default privileges (the same posture
`supabase/seed.sql`'s header documents for tables, now confirmed by direct
probe to extend to functions too), a freshly created table or function grants
`service_role` full access automatically with no explicit `GRANT` — the
identical class of gap this file already records for the Action Queue guard.
An ad-hoc supplemental `REVOKE ALL ... FROM service_role` on all five objects
was issued through the same channel immediately after the forward repair, so
production is not just fixed but hardened.

**That ad-hoc supplement is now captured in version control**, so it is not
left to silently drop out of a future replay the way the Action Queue's
initial state very nearly was:
`supabase/migrations/20260821064300_signup_acquisition_service_role_hardening.sql`
is a new additive migration (`20260813030000` itself is untouched, per
Migration Immutability Rules) that revokes `service_role` on the table and
all four functions, with a preflight that fails closed if the prerequisite
objects are absent and a postflight that asserts `service_role` holds nothing
while `authenticated`'s intended grants survive unchanged. Validated against a
local PostgreSQL 16 replay under a simulated permissive-default-privilege
regime reproducing this project's posture: applies cleanly after
`20260813030000`, hardens all five objects, is idempotent on re-run, and
fails closed with zero writes when the prerequisite objects are missing.
Static contract tests:
`src/test/signup-acquisition-service-role-hardening-migration.test.ts`
(7 tests), adversarially verified — a real injected
`GRANT ... TO service_role` statement was caught before the test was trusted.

**This new migration has not itself been re-applied to production**, and does
not need to be: production already carries the ad-hoc supplement's effect.
The migration exists so a fresh replay, CI reset, or disaster-recovery restore
reaches the same hardened end state instead of silently reopening the gap —
not to change production's current state, which is already correct. Applying
it to production anyway would be safe (`REVOKE` is idempotent and its
preflight would simply confirm the prerequisites it expects), but that is
deliberately left for a normal migration-apply pass rather than a second
ad-hoc production SQL session, in keeping with "fix things ... rather than
widening scope."

**Ledger name-rows (supersedes the same-day "no ledger row" claim above).**
At apply time #1080 recorded that no agent session wrote
`supabase_migrations.schema_migrations` for either signup version. A later
same-day **founder ledger backfill** (2026-08-21, marker
`ledger-only;objects-already-applied;no-rerun`, `created_by`
`founder-ledger-backfill`) inserted name-rows without re-running the files:
`20260813030000` / `signup_acquisition_forward_repair` and
`20260821150000` / `signup_acquisition_failure_safe_attribution`, plus seven
legacy name-rows (`20260515204616`, `20260515204637`, `20260515211702`,
`20260714231627`, `20260715002000`, `20260716215516`, `20260721107000`).
`20260721194325` was already present. **`20260821064300` is still not in the
ledger** — leave it unrecorded; ACLs on the objects it names already match
except the new readiness RPC (see next paragraph). Object presence remains
ground truth; the drift probe remains blocked for the two reasons already
recorded in the next section.

### 2026-08-21 ~15:23 UTC — failure-safe guard live; HARD STOP on GitHub APPLY

`practical observation` / point-in-time, measured 2026-08-21 ~15:23 UTC by
Grok via Lovable `query_database` on production project
`66255e7b-892c-4be5-8686-ab1cfc3666db` (not the sandbox):

- `public.signup_acquisition_attributions` exists
- three helper functions exist
- `handle_new_user` md5 `34405b3ee446340a55ad4f25e2193c9a` with **`RAISE LOG`
  guard text present** — applied from existing file
  `20260821150000_signup_acquisition_failure_safe_attribution.sql` via
  Lovable SQL; **not** via the GitHub apply-signup workflow
- `signup_acquisition_readiness_operator_snapshot` exists
- `handle_new_user` EXECUTE denied to `anon` / `authenticated`
- table has no `service_role` ACL; the original four functions have no
  `service_role`. Readiness RPC **does** have `service_role=X` (default
  privileges leftover)
- **Do not call the 42P01 table-missing outage still OPEN** — it is CLOSED

**Hard stop — do not GitHub-APPLY `20260813030000`.** That migration body
would re-issue an **unguarded** `handle_new_user` and overwrite the live
`RAISE LOG` guard. The GitHub apply-signup workflow still shows only the
failed PREFLIGHT; objects are already live through Lovable. Treating
"ledger name-row present" or leftover "still unapplied" prose as license to
APPLY that file is a production incident.

**What this does not change.** GA4/GSC baselines, Day 0, and the four-week
measurement clock are untouched. No schema beyond the table and functions
this migration and its predecessor define. No RLS, auth, or edge-function
change. The frontend attribution code (`Landing.tsx` and the signup URL
builder) was already deployed ahead of the repo per the original diagnosis
above, and was not touched by this repair.

---

## ⚠️ Second production drift — committed migrations are NOT auto-applied

**Recorded 2026-08-15 from a Lovable read-only investigation of production
`knkwiiywfkbqznbxwqfh`.** `source claim` for the production measurements; the
repository-side facts below were verified directly.

**Publishing does not replay `supabase/migrations/`.** It deploys the frontend
and edge functions only. Migrations reach production solely through the
operator's own apply path. This corrects an assumption stated repeatedly in
`docs/specs/postgres-restricted-role-alternative.md` (now fixed in its §5.4.1)
and it explains why the signup-attribution fix above was once "merged, NOT
applied" (historical as of 2026-08-15; the signup repair was applied
2026-08-21 — see the RESOLVED section. The publishing-vs-migration lesson
still stands).

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

**Order matters and was followed:** `20260819190000` first, then
`20260819190852`. The first migration's postflight is deliberately the second's
guard-drift predicate.

`supabase/migrations/20260819190000_action_queue_guard_decision_fields_forward_repair.sql`
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
above). **Superseded 2026-08-21:** the signup-attribution forward repair
`20260813030000` is **APPLIED** (see the RESOLVED signup section). This Action
Queue session did not touch it; a later same-day Lovable apply closed the
42P01 outage. **Hard stop:** do **not** GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql` — that file would
re-issue an unguarded `handle_new_user` and overwrite the live `RAISE LOG`
guard from `20260821150000_signup_acquisition_failure_safe_attribution.sql`.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | **`a3ae36765` (#1105), verified 2026-08-23 02:09 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 2026-08-22 16:16 UTC, so publish lag is now **`12`** and has widened seven times by the tip advancing, never by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `8181f5a60` (#1107), verified 2026-08-23 00:02 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 2026-08-22 16:16 UTC, so publish lag is now **`11`** and has widened six times by the tip advancing, never by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `70ba566cdb11` (#1092), verified 2026-08-22 18:22 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 16:16 UTC, so publish lag is now **`10`** and has widened five times today by the tip advancing, not by any republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `8e6750e87aff` (#1101), verified 2026-08-22 17:32 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 16:16 UTC, so publish lag is now **`8`** and has widened three times today by the tip advancing, not by any republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `fd2d3e3f7553` (#1100), verified 2026-08-22 17:09 UTC by direct fetch. Live production was re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged from the 16:16 UTC reading, so publish lag widened from `6` to **`7`** purely by the tip advancing, not by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `93d8ea23ff58` (#1097), verified 2026-08-22 16:16 UTC by direct fetch. Live production was re-fetched in the same window and now serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `commitTime 2026-08-21T20:43:26Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`), confirmed an ancestor of this tip — publish lag is `6` first-parent commits (#1095, #1096, #1098, #1091, #1099, then #1097). Production has republished since the 2026-08-21 readings; the previously-live `ea31fbdfb934` is historical. Every prior caution stands: this row moved three times inside one hour on 2026-08-21 and has moved again overnight. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `faea6e9c59ad` (#1087), verified 2026-08-21 21:05 UTC by direct fetch. Live production was re-fetched in the same window and still serves `ea31fbdfb934` (`buildTime 2026-08-21T15:53:46.096Z`, `dirty: true`, `ref: "__orphan__"`), confirmed an ancestor of this tip — publish lag is `2` first-parent commits (#1090, then #1087). This row moved three times inside one hour: `ea31fbdfb934`/lag `0` at 16:15Z, `9133a4c45b7f`/lag `1` at 20:43Z, this at 21:05Z. Each was correct when taken. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `ea31fbdfb934` (#1086), verified 2026-08-21 **16:15 UTC** by direct fetch. **Live production was fetched at the same moment and serves `ea31fbdfb934` too — publish lag was `0` first-parent commits at that reading, the first 0 recorded here.** Production republished at least four times on 2026-08-21; treat any lag figure as perishable and re-measure. Superseded, in order: `5a13d0b47cb7` (#1089, live 15:39:34Z), `39935889fe02` (#1080, live 15:23 UTC), `999b6da93` (#1077), `ac973ed9f` (#1074), `9b6445653` (#1042). Prior text for this row follows: `999b6da93` (#1077), verified 2026-08-21 ~15:23 UTC with `git fetch origin verdant-grow-diary && git rev-parse origin/verdant-grow-diary`. Supersedes `39935889f` (#1080) as tip and earlier buffers (`ac973ed9f` / #1074, `9b6445653` / #1042). **Live production WAS re-fetched at this verification** and serves `39935889fe02` (#1080), confirmed an ancestor of this tip (`git merge-base --is-ancestor`) — publish lags git by **1** first-parent commit (the #1077 docs-only CURRENT_STATE refresh). That lag figure is perishable: it read "four" on 2026-08-20, \*\*17\*\* / \*\*2\*\* earlier on 2026-08-21 under #1077's 12:57 UTC pin of live `1400a7e77eff`, and \*\*1\*\* now with live on `39935889fe02`. Re-measure it; never carry it forward. The 2026-08-18 note that a `/version.json` fetch from an agent session is `BLOCKED` (network policy 403) was session-specific and does not hold generally — see `docs/agent-session-network-reachability.md`. Merging is not a publish. PR numbers on this branch do not order by merge time — order commits with `git log`, never by PR number. Do not carry older validation tables forward. Older buffers showing live `1400a7e77eff`, tip `39935889f`, `9b6445653` (#1042), `87ae05e5b` (#1026), `3f2bfe2db` (#1021) or `1c094a2a3` (#970) are earlier snapshots; discard them |
| `main`               | Integration branch. It is not production parity. | `b6d747941948ce68157185a2b0847acea6970d44` (#779), verified 2026-08-07                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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
queue latency. Branch-name authorship is not a role assignment. At the time
those comments were posted, the agents table still framed Grok as research-
delivery on `ONE_TENT_LOOP_OPERATING_ORDER`; as of 2026-08-20 (refined) Grok is
**Product Intelligence, Adversarial Audit, and Implementation Lead** — peer with
Claude/Codex, no role rank (see Agents table and
`docs/agents/grok-peer-elevation-map-2026-08-20.md`). The comments handed a
recommended rebase path to whoever next owned each branch.

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

Analytics axes verified directly on 2026-08-02. Release identity and build time
were re-measured **2026-08-21 ~15:23 UTC** over live HTTPS (Grok). Sitemap and
the six previously-unsitemapped indexable routes keep their 2026-08-21T12:57 UTC
(#1077) readings — not re-opened this turn. Public root and robots.txt keep
their 2026-08-20 dates; GA4 lighting / singleton rows keep their 2026-08-02 dates.
**Latest release measurement is 2026-08-23 02:09 UTC** for tip and lag only
(tip `a3ae36765` / #1105; live `faea6e9c59ad` / #1087; lag **`12`**). The served
commit, build time, provenance flags and payments-bundle rows keep their **16:16 UTC**
readings — production has not republished between the two, and only the tip moved. That
16:16 UTC pass superseded the 2026-08-21 21:05 UTC and 16:15 UTC readings. Rows not
named keep their own earlier dates.
Each row carries its own verification date:

| Axis                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200, **re-verified first-hand 2026-08-22 17:09 UTC** (and at 16:16 UTC the same day). This row previously carried a 2026-08-21 date while rows beside it quoted 2026-08-22 readings fetched from this same endpoint — an internal contradiction in a file that promises each row carries its own date. Prior text: re-verified 2026-08-21 **16:15 UTC**, superseding the ~15:23 UTC reading. The 2026-08-18 `BLOCKED` (network policy 403) was a property of that session, not of this endpoint — re-test rather than carrying it forward                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Production commit                           | Identity `PASS`, provenance **not** `PASS` — **re-measured first-hand 2026-08-22 16:16 UTC.** Production serves `faea6e9c59adf42a3028a2f0d9eba2b8ac2ef688` / `faea6e9c59ad` (#1087), `buildTime 2026-08-21T20:51:46.584Z`, `commitTime 2026-08-21T20:43:26Z`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `commitSource: "git"`, `treeHash` short `7d9cc8a12898`, `version: "0.0.0+20260821.faea6e9c59ad-dirty"`. **This is the post-#1090 build the record said to watch for, and the mismatch PERSISTS:** `faea6e9c59ad` contains #1090 (verified by `git merge-base --is-ancestor`), and recomputing its tree with `scripts/lib/tree-hash.mjs` over a clean worktree gives `436eede41e4b` (5,856 files) against the stamped `7d9cc8a12898`. **Per the one-directional rule recorded below, persistence does NOT refute the #1090 candidate** — a workspace already dirtied by an earlier cycle stays dirty until something resets it — and it does not confirm it either. It returns the question to the owner-gated publisher's build log. That makes **five** OBSERVED publishes measured, all five mismatching, all five `dirty: true`. Still not a proven-consecutive run: whether other publishes fell between any two readings is `NOT_MEASURED`. **The `TREE_HASH_ROOTS` bound is UNCHANGED.** An earlier version of this row said it "is now narrower than it was" on the strength of the payments-token finding; that inference was **withdrawn 2026-08-22** after a review P2 — a platform env var overrides `.env.production` without altering the file, so it need not have drifted in the workspace and need not have contributed to this mismatch. Whether the workspace drift behind `treeHash` reached shipped bytes stays `NOT_MEASURED`. See the withdrawal in the payments-token section below. Do not upgrade provenance to `PASS`. Supersedes the 16:15 UTC pin `ea31fbdfb934` and every earlier same-day pin. Prior row text follows: re-measured first-hand 2026-08-21 16:15 UTC. Production serves `ea31fbdfb934b5a4e70b882dc62465b73c4a5f72` / `ea31fbdfb934` (#1086), `buildTime 2026-08-21T15:53:46.096Z`, `commitTime 2026-08-21T15:29:03Z`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `treeHash` short `831bd3b4f230`, `version: "0.0.0+20260821.ea31fbdfb934-dirty"`. **Provenance is now measured, not merely flagged, across four OBSERVED publishes — and all four mismatch.** They are four point-in-time `/version.json` readings, **not** a proven-consecutive run: whether other publishes fell between them is `NOT_MEASURED` without the publisher's history, and production republished repeatedly inside one hour. Recomputing each published commit's tree with `scripts/lib/tree-hash.mjs` against what the build stamped: `4b1c4867e685` stamped `8773f6b2c0ed` vs `1f0eb7b4e6cd`; `39935889fe02` stamped `1fe0606c134a` vs `8e117dc65711`; `5a13d0b47cb7` stamped `1fe0606c134a` vs `8e117dc65711`; `ea31fbdfb934` stamped `831bd3b4f230` vs `2cee190ff72b`. Note the middle pair differ only in `docs/agents/CURRENT_STATE.md` — outside `TREE_HASH_ROOTS` — and recompute identically, which is the mechanism working correctly. **The bound: `TREE_HASH_ROOTS` covers inputs that never ship, so this establishes build-workspace drift at stamp time; whether any shipped byte differs stays `NOT_MEASURED`.** Do not upgrade provenance to `PASS`. Supersedes the ~15:23 UTC pin `39935889fe02` and the earlier `1400a7e77eff` / `92a983b4832e`. Prior row text follows: re-measured 2026-08-21 ~15:23 UTC. Production serves real SHA `39935889fe022efd441dc5ab86bfbf636d284739` / short `39935889fe02` (#1080 merge), with `commitSource: "git"`, `treeHash: 1fe0606c134a0b8aa3887d17b966ef0b95e9876d72ee987ad8a601b42d1ef346`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `version: "0.0.0+20260821.39935889fe02-dirty"`. Record identity and provenance separately: identity is the #1080 SHA; provenance flags stay as measured — do **not** upgrade provenance to `PASS`. Cause of dirty/orphan remains `NOT_MEASURED`. Note for whoever checks this next: `treeHash` is Verdant's SHA-256 over the allowlisted `TREE_HASH_ROOTS` manifest (`scripts/lib/tree-hash.mjs`), **not** a Git tree object ID. Do not "confirm" a mismatch by diffing it against `git rev-parse <commit>^{tree}` — those are different hash functions over different inputs and never match, on healthy builds included (#1077 already removed that false corroboration). Supersedes the earlier same-day #1077 pin `1400a7e77eff` (#1083) and the still-earlier `92a983b4832e` (#1061). Publish lags git — see the branch topology row. Single observations remain point-in-time |
| Production build time                       | **`2026-08-21T20:51:46.584Z`** (fetched first-hand 2026-08-22 16:16 UTC, commit `faea6e9c59ad`). Note the shape: a build stamped 2026-08-21 evening was still the served build ~20 hours later, so the republish cadence that churned this row four times inside 2026-08-21 did **not** continue overnight. Do not read that as stability — re-measure. Prior row text follows: `2026-08-21T15:53:46.096Z` (fetched first-hand 16:15 UTC, commit `ea31fbdfb934`). Prior live stamps `2026-08-21T15:39:34.211Z` (`5a13d0b47cb7`) and `2026-08-21T12:53:03.024Z` (`39935889fe02`) are historical. Prior row text follows: `2026-08-21T12:53:03.024Z` (from the same ~15:23 UTC `/version.json`; the served commit was authored `2026-08-21T07:51:31-05:00`). Prior live stamps `2026-08-21T12:11:38.661Z` (`1400a7e77eff`), `2026-08-21T00:59:52.370Z` (`92a983b4832e`), `2026-08-21T00:27:10.316Z` and `2026-08-20T18:49:50.600Z` are historical. Production republished multiple times inside 2026-08-21 — treat any single reading here as perishable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Public sitemap                              | `PASS` — HTTP 200, **61** `<loc>` entries live (re-count 2026-08-21). **Live and in-repo now agree**: the 2026-08-20 adjudication published, moving live from 56 → 61. The earlier note that a 56 reading was "expected, not a regression" is spent — from 2026-08-21 a 56 reading would be a real regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Public root route `/`                       | `PASS` — re-measured 2026-08-20. HTTP 200; `<h1>` “See what changed. Decide what to do next.”; `<link rel="canonical" href="https://verdantgrowdiary.com/"/>`; `<meta name="robots" content="index, follow">`; one JSON-LD block; no loading skeleton. Visible body words measured **845–1034** depending on tokenization — the 2026-08-15 figure of 1141 recorded no method, so the two are **not comparable and this is not evidence of content loss**. `www.` host `302`s to the apex. Slice 2 (`/welcome` → `/` consolidation) remains unapproved — see blocker 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Indexable routes outside the sitemap        | `PASS` — **resolved live**, re-measured 2026-08-21. Was `FAIL` while the fix sat unpublished. Five of the six are now advertised in the live `sitemap.xml` (`/glossary`, `/docs/mcp-api`, `/pheno-expression-showcase`, `/pheno-comparison`, `/creator-beta`), each self-canonical. `/breeder-beta` is correctly absent **by design**: it serves `<link rel="canonical" href="https://verdantgrowdiary.com/creator-beta">` and stays `index, follow`, so advertising it would push a URL that disclaims itself. Verified live, not inferred from the merge — the cross-canonical survived hydration, which was the silent failure mode. Closes blocker 8’s sibling item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| robots.txt                                  | `PASS` — re-measured 2026-08-20: HTTP 200, declares `Sitemap: https://verdantgrowdiary.com/sitemap.xml`, and carries no global `Disallow: /`. Authenticated surfaces (`/dashboard`, `/tents`, `/plants`, `/sensors`, `/timeline`, `/doctor`, `/actions`, `/auth`, …) are disallowed as intended; neither lighting route is disallowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified (not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GA4 explicit lighting-page identity         | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GA4 page-view singleton contract            | `FAIL` — five automatic tag-generated events observed beside explicit application events (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GSC authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Measurement Day 0                           | `UNSET`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Four-week measurement clock                 | `NOT_STARTED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

### 2026-08-20 — a DNS false negative, and the reachability rule it produced

`established fact`, measured 2026-08-20: an agent reported this domain **offline and
not indexed** on the strength of a single `socket.gethostbyname` failure raised inside
a code-execution sandbox, and recommended repointing production DNS on that basis.
Every axis in the table above was re-measured the same day. The site was live
throughout, serving a build published hours earlier.

The error string is the tell. It was `EAI_AGAIN` (_Temporary failure in name
resolution_) — **the resolver did not answer**. It is not `NXDOMAIN`, which is what an
unregistered or unpointed domain returns. To a caller that only checks whether the call
threw, the two are indistinguishable, and they mean opposite things: one measures the
session, the other measures the domain. Acting on the wrong one would have applied DNS
surgery to working DNS.

Two durable consequences:

- **A resolver or socket error is `BLOCKED`, never `FAIL`.** It licenses no claim about
  deployment, DNS, or indexing. Only an HTTP response that was actually read is a
  measurement of the site.
- **`BLOCKED` is per-session, not a property of the target.** The `/version.json` fetch
  recorded `BLOCKED` (network policy 403) on 2026-08-18 returned `200` on 2026-08-20
  from a different session. Re-test before carrying a `BLOCKED` forward.

Procedure, the control-host pairing that separates the two cases, and the
output-reading traps (the proxy's `127.0.0.1` is not the origin IP; the landing HTML
carries NUL bytes that silence `grep`) are in
`docs/agent-session-network-reachability.md`.

**Indexation itself remains unmeasured.** Two pages surface in a third-party web index
with correct titles — a `practical observation` sufficient to refute "not indexed", and
nothing more. The Ahrefs endpoints that would measure it returned `Insufficient plan`,
and the GA4/GSC authenticated baselines stay `BLOCKED` (blockers 2 and 3). No
impression, click, position, or CTR claim is authorized by this section.

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
the Convex or Postgres spikes below. Owner-only gate remaining `BLOCKED`: a
managed `e2e:one-tent:ui` session. The Lovable-apply of
`20260813030000_signup_acquisition_forward_repair.sql` is **done** (RESOLVED
2026-08-21); **do not** GitHub-APPLY that file — it would clobber the live
`RAISE LOG` guard from `20260821150000`. Slice 5 recorded the honest
`missing_session_json` receipt rather than fabricating a walk. Colliding
PRs **#828**, **#817**, and **#696** all closed unmerged on 2026-08-15 within a
54-minute window (verified 2026-08-21 by direct PR read). The fence they carried
stands on its own: do not start a competing Timeline / Alerts / Action Queue UI
rewrite. Baseline and
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
Slice plan: each approved item ships as its own PR. **Status measured
2026-08-21 at deploy tip `6cf3ffda` — Tranche B+ is substantially
delivered, not pending:**

| Slice                                      | Status                                    |
| ------------------------------------------ | ----------------------------------------- |
| B0a measurement harness (first merge gate) | **MERGED** — #1039 `de8ebad`              |
| B1 target-precedence rules                 | **MERGED** — #1040 `9141be8`              |
| B3a recovery + ratified copy               | **MERGED** — #1042 `9b64456`              |
| B2a shared save-key policy                 | **MERGED** — #1049 `f09febc`              |
| B4a `/doctor` loop card                    | **MERGED** — #1047 `cff3efd`              |
| D7 plant-scoped Better/Same/Worse          | **MERGED** — #1041 `5640d77`              |
| D5 "Continue with `<plant>`?"              | **MERGED** — #1043 `e9e5ec5`              |
| B2b                                        | still deferred to **A5** (unopened)       |
| B4b                                        | **NONE REMAINING** — see note below       |
| B5                                         | waits for **A3** (unopened)               |
| B0b                                        | owner-gated authenticated session/CI path |

**B4b has no remaining scope — do not open a slice for it.** Measured
2026-08-22 at deploy tip `faea6e9c5` (recorded by #1095): A2 **has landed**
(`oneTentLoopNavigationRules.ts` carries 5 `normalizedGrowId` uses, including
the back-half `alertsPath(...)` / `actionsPath(...)` threading that was A2's
scope), and with it in place B4a already satisfies **every** §6 B4 requirement
— the `sensor-snapshot` → `?growId=&tentId=` carry, `doctorStartContextRules.ts`,
the `AiDoctorStart` tent-context line and "In this tent" badge, the carry matrix,
the fail-closed page validation, the no-paid-call pins, and the loop-card mount.
The a/b split recorded here was an artifact of B4a shipping before A2, not two
pieces of work. Building a "B4b" now would produce a second implementation of a
merged slice, which `AGENTS.md` forbids.

The remaining dependency: B2b and B5 block on Tranche A slices that have never
been opened. Both re-verified 2026-08-22 **against each slice's own artifacts**,
after a first attempt measured the wrong things (a raw literal count reported as
dispatch sites, and an `Alerts.tsx` check that belongs to A5(c), not A3):

- **A5** — "single dispatch" has not converged. `verdant:entry-created` still has
  **5 independent emit sites** in non-test code: `PlantQuickLog.tsx:399`,
  `QuickLog.tsx:1454`, `AppShell.tsx:390`, `useSavePhotoDiagnosisReview.ts:91`,
  and the `dispatchQuickLogV2EntryCreated` helper in
  `src/lib/quickLogV2EntryCreatedEvent.ts`. Count **emitters**, not literal
  matches — the string appears 23 times across 13 files, but most of those are
  comments, event-name constants, and `add`/`removeEventListener` in the
  Timeline / DailyCheck / ActionFollowUp listeners.
- **A3** — none of its artifacts exist. `src/lib/tentPlantDisplayLabel.ts` and
  `src/lib/actionContextNameLookup.ts` are both absent,
  `buildActionRowContextLabel` is absent from `actionQueueRowView.ts`, and none
  of the four A3 test ids (`action-queue-row-context-names`,
  `alert-detail-tent-label`, `alert-detail-plant-label`,
  `action-detail-tent-label`) appear anywhere in `src/`.

So Tranche A is no longer only its own tranche — it gates the completion of
Tranche B+. No schema, no migrations,
no new routes, no new Quick Log write paths, no production telemetry.

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

**Recorded 2026-08-20 (ADVISORY, NOT APPROVED; re-pinned at `cff3efd`):** Claude
triaged an owner-supplied 100-prompt Lovable build roadmap against the shipping branch.
Deliverable: `docs/lovable/verdant-lovable-prompt-triage-2026-08-20.md`, now at
**revision 2**, re-audited from `77d8eec` to `cff3efd` after the deploy branch advanced
(#1035, #1039 B0a, #1047 B4a). It selects and rewrites eight prompts and rejects the
rest with reasons. **It authorizes nothing** — no implementation, no schema, no Lovable
send, no production write.

Findings other agents should not have to rediscover: (1) prompt #96 asks for a **Stripe**
checkout UI, but production runs **Paddle** (233 references vs 20, five live edge
functions) — sending it would put a second payment provider into a live billing system;
(2) prompt #60 asks to visually smooth anomalous sensor spikes such as 0% humidity, which
inverts the Hard Safety Rule on unhealthy telemetry, and is included only in
flag-and-label form; (3) **prompt #4's own wording collides with an existing page** —
`src/pages/GrowRoomMode.tsx` / `src/lib/growRoomModeRules.ts` are a read-only multi-tent
operator view doing no theming, so the pack renames that pick to "Night Mode" and fences
the existing files off; (4) prompt #49 now has a measured target — **S5** in the B0a
baseline (≥5 interactions, 1+ reselections), the most expensive row in that table, though
S5 is a documented estimate and only S1a/S7 are automated.

Seven of the eight picks require zero new tables, chosen deliberately because migrations
do not auto-apply (see the second-drift section above). Collision boundaries were
re-checked at `cff3efd`: Tranche A edit points, PRs #828/#817/#696, the single
`quicklog_save_manual` write path, and now the **live Tranche B+ surface** (B0a harness,
B4a `doctorStartContextRules`/`AiDoctorStart`, the quicklog rules files). Only pick #49
touches an actively-edited family; it is flagged and resequenced behind the others.
Docs-only; no code, schema, or migration changes.

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
   cannot see it, because it only checks whether `image` is absent. Sibling note:
   **the unsitemapped indexable routes were adjudicated 2026-08-20 and are now
   RESOLVED LIVE — published and re-measured 2026-08-21.** Cheek's call was SITEMAP, not noindex. The set was
   **six**, not the four this file had recorded: `scripts/public-route-parity.config.mjs`
   also carried `/pheno-expression-showcase` and `/docs/mcp-api` in
   `STATIC_ONLY_ROUTES`, and all six measured HTTP 200, self-canonical,
   `index, follow`, absent from `sitemap.xml`, and disallowed by no robots group.
   Five were added to `public/sitemap.xml` (61 `<loc>` in-repo, up from 56).
   **`/breeder-beta` was held, then resolved the same day.** It renders the same
   `<BetaLanding>` component as `/creator-beta` — whose own source header calls the
   breeder route a "copy-only difference" — and measured 233 of ~237 shared unique
   visible tokens with identical `h1` and every `h2`. Both being self-canonical would
   have set two near-identical URLs competing on the same queries, so it was held for
   an owner call. **Cheek chose canonicalisation:** `/breeder-beta` now points its
   canonical at `/creator-beta` and stays affirmatively `index, follow`, keeping
   breeder-oriented copy for direct and paid traffic while conceding the ranking URL.
   It therefore stays out of `sitemap.xml` **by design** — never advertise a URL whose
   canonical points elsewhere.

   Implementation spans three halves that must agree, because a drift in any one is
   silent: the build-time head (`crossCanonicalDocument` in
   `src/lib/build/staticPublicSeoDocuments.ts`), the hydrated runtime head
   (`canonicalPath` on `usePageSeo`, passed from `src/pages/BreederBeta.tsx` — if this
   drifts back to a self-canonical it overwrites the pre-rendered one for every
   JS-rendering crawler), and the sitemap exclusion in
   `scripts/public-route-parity.config.mjs`. All three are pinned by
   `src/test/breeder-beta-cross-canonical.test.ts`.

   Note the distinction from the older `/strains/*` aliases: those use
   `aliasDocument`, which inherits the target's copy and marks the page
   `noindex, follow`. A cross-canonical must **not** also be `noindex` — that sends
   crawlers two contradictory instructions about one URL — so the two helpers are
   deliberately separate.

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

## Architecture-audit adjudication — owner/reviewer pairing (recorded 2026-08-21)

Recorded per `docs/agents/HANDOFF_PROTOCOL.md`, which requires the pairing in
**both** the handoff block and this file. Raised in review of the PR below when
the pairing existed only in the handoff.

| Field                             | Value                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slice                             | Adjudication of an owner-supplied architecture audit against measured deploy-branch state                                                                                                                                                                                                        |
| **Slice owner**                   | **Claude**                                                                                                                                                                                                                                                                                       |
| **Independent reviewer**          | **#1087 — Codex**, performed, not merely nominated. **#1092 — Grok (GDP)**, named by Cheek on the PR 2026-08-22 17:09 UTC; review in progress at that time, no verdict yet. Two PRs on one branch, two separate seats — do not read Codex's completed #1087 review as covering #1092             |
| PR / branch                       | [#1087](https://github.com/Verdant-OS/verdant-grow-diary/pull/1087) **merged** `faea6e9c59ad` · follow-on [#1092](https://github.com/Verdant-OS/verdant-grow-diary/pull/1092) **open** · both on `claude/verdant-architecture-audit-6qe80x`                                                      |
| Deliverable                       | `docs/audits/architecture-audit-adjudication-2026-08-21.md` — documentation only                                                                                                                                                                                                                 |
| Repository measurements pinned at | `28c01a017`. **Repository inventories only.** The deliverable's live HTTP probes and provenance comparisons use other commits — `4b1c4867e685`, `39935889fe02`, `5a13d0b47cb7`, `ea31fbdfb934` — and its §6.1 rows carry their own timestamps. Do not attribute production evidence to this tree |

**Why the reviewer row now names two seats.** #1087 merged on 2026-08-21 while its
branch was queue-locked, so two verified Codex findings could not land in it; #1092
is the follow-on that carries them, on the same branch. It is its own slice under
`AGENTS.md`'s "no code ships without peer review", so it needs its own named
independent reviewer rather than inheriting #1087's. Cheek named **Grok (GDP)** for
it on the PR at 17:09 UTC ("Review in progress. Will post PASS/FAIL/BLOCKED with
P0/P1 on this PR. No merge from this comment."), and marked #1092 ready for review
in the same minute. **No agent performed either transition.** The seat is _named_,
not _discharged_ — recording it here satisfies `HANDOFF_PROTOCOL.md:25`, which is
the requirement this whole section exists to meet, and satisfies nothing else. Do
not read a named seat as a completed review.

**Note the Grok naming that is NOT this one.** The MACAE reference-ingest row lower
in this file also names Grok (GDP) as its protocol peer-review seat (filled by Cheek
the same day, via #1100). Different slice, different seat, same reviewer — do not
collapse the two or treat a verdict on one as a verdict on the other.

**Read the deliverable's own withdrawal record before citing it — and read it
there, not here.** Review produced **nine** substantive corrections as of
`3ba7264f2`: claims withdrawn outright, one conclusion reversed, one retraction
that was itself wrong and withdrawn in turn, one relapse into an
already-withdrawn inference, and — added on `3ba7264f2` — a same-build ordering
claim refuted from `package.json`'s `prebuild`/`build` sequence, plus a
follow-up test wrongly described as able to refute as well as confirm. **This
count is maintained by hand and goes stale on every new review round; the
document's own record is authoritative.** It keeps every correction visible
rather than patching silently, and names three recurring failure modes:
inference presented as conclusion, propagation after change, and bounded reads
presented as complete. Its labelled bounds are the load-bearing part, not its
headlines.

**The provenance finding is now measured across FIVE publishes**, not one — see
the Production commit row above for the full comparison. `4b1c4867e685`,
`39935889fe02` (#1080), `5a13d0b47cb7` (#1089), `ea31fbdfb934` (#1086) and
`faea6e9c59ad` (#1087) all mismatch, all `dirty: true`. **This count is
hand-maintained and has already gone stale once** — it read "four" here while the
Production commit row said five. Treat that row as authoritative and re-derive from
it rather than trusting this sentence. The middle pair differ only in
`docs/agents/CURRENT_STATE.md` — outside `TREE_HASH_ROOTS` — and recompute
identically, which is the mechanism behaving correctly. **Do not
"confirm" any of this against a `git rev-parse` tree id:** `treeHash` is
Verdant's SHA-256 over the allowlisted roots, and the two never match even on
healthy builds. The bound is unchanged — the hashed roots include inputs that
never ship, so this establishes build-workspace drift at stamp time, and whether
any shipped byte differs stays `NOT_MEASURED`.

Two findings other agents should not rediscover:

- **The `vercel.json` directives that were measured are not applied as declared
  in production** — `redirects` (all eight, with a positive control), `rewrites`
  (by response-content comparison), and the **catch-all `/(.*)` header block
  only** (3 of its 5 arrive; HSTS differs from the declared value).
  **Everything else in that file is `NOT_MEASURED`, and the categorical "does
  not govern production" is deliberately not asserted.** Specifically unprobed:
  the `/unsubscribe` header block (`Cache-Control`, `Referrer-Policy`,
  `X-Robots-Tag`), the `/assets/(.*)` block (`Cache-Control`), and the
  `projectSettings` (labelled `inference`), `cleanUrls` and `git` keys. Where
  the three delivered headers originate is also `NOT_MEASURED`. **Do not read
  the catch-all result as covering the path-specific rules.**
- **The Bun/npm lockfile transition is dated.** `reviewBy` is 2026-08-25 and
  `check-bun-lockfile-policy.mjs` compares strictly greater, so the gate first
  fails **2026-08-26 UTC**. Its prerequisite is an **inventory across all five
  declared npm consumers** in `config/dependency-lockfile-transition.json` —
  `vercel.json`, the SEO-monitoring workflow, `README.md`, the agent run skill,
  and the preview-deployment checklist. The gate requires every declared
  consumer while `package-lock.json` remains, so retiring the preview Vercel
  project does not by itself clear the gate. Do **not** drop the compatibility
  lock on the strength of that project alone — one of the others is a workflow
  that actually runs. **Map contracts to deployments before counting what
  remains:** the preview checklist and `vercel.json` describe the _same_
  deployment (the checklist requires the project's settings to match that file,
  and its rollback step removes it), so five files are not five deployments. An
  earlier reading that treated production and preview as the same deployment was
  reversed; a later one that counted the five as independent was too.

Owner-gated, unchanged by this slice: the publisher's build log, the lockfile
decision above, and whether to commission the §7.1 ADR against the merged
`docs/codebase-map.md`.

**A candidate for the provenance question exists, but it is weak — read the
caveats before citing it.** #1090 (`9133a4c45`) merged into this branch on
2026-08-21 at 20:10Z, naming a mechanism: a Vite plugin regenerated
`supabase/functions/mcp/index.ts` — a `TREE_HASH_ROOTS` path — on every
non-Windows `vite dev` / `vite build`. Verified in-repo: that file **is** inside
the hashed roots, and the wiring existed at `ea31fbdfb`. The plugin's regeneration
behaviour and its byte-difference are `source claim` from #1090, not verified.

**The same-build version of this is impossible and was asserted here before being
withdrawn.** `package.json:9-11` runs `stamp-version.mjs` inside `prebuild`, and
only then `build` → `vite build`; the lifecycle orders `pre<script>` first, so one
build's stamp is captured before any Vite hook fires. Codex refuted it in review of
#1087. What survives is a **cross-build** version: a rewrite during an editor
session or a previous build sits in the workspace when the next publish stamps it —
which requires the build workspace to **persist between cycles**, an `inference`
supported by `dirty: true` / `ref: "__orphan__"` and by #1090's own "the workspace
no longer regenerates the file", not a measurement. Under a fresh-workspace-per-build
premise the candidate collapses. The right investigation, per Codex, is mutations
occurring **before** `stamp-version.mjs`.

**The test is one-directional.** Once a post-#1090 build is published, re-fetch
`/version.json` and recompute that commit's tree. Mismatch and `dirty: true`
_stopping_ supports the candidate; _persisting_ does **not** refute it, since a
workspace already dirtied by an earlier cycle stays dirty until something resets it.
**RUN 2026-08-22 16:16 UTC — the result is "no information", exactly as the rule
predicts.** Production now serves `faea6e9c59ad`, which contains #1090 (verified by
`git merge-base --is-ancestor`), so this is a post-#1090 build. Recomputed tree
`436eede41e4b` (5,856 files) vs stamped `7d9cc8a12898`: **mismatch persists**, and
`dirty: true` / `ref: "__orphan__"` persist with it. Under the one-directional rule
stated in the preceding paragraph that **neither confirms nor refutes** the candidate.
Do not report it as a refutation, and do not report it as confirmation of some other
mechanism — the persistence is precisely the outcome the rule says carries no signal.
#1090 puts the stamp / `dirty` / `__orphan__` diagnosis outside its own scope and
explains nothing about `ref: "__orphan__"`, so **the publisher's build log remains the
only route that settles it**, and it stays owner-gated. Prior text follows. **Not yet
available:** at 2026-08-21 20:35Z production still served the pre-#1090
`ea31fbdfb934` (`buildTime 15:53:46.096Z`).

One caution that is independent of all the above — the named path is an
edge-function source that publishing deploys, so the "hashed roots include inputs
that never ship" reassurance does **not** cover it. Whether any shipped byte
differed stays `NOT_MEASURED`.

---

## One-Tent goal — blocked on external gates, not code work (recorded 2026-08-21)

Recorded by Claude 2026-08-21 ~22:00 UTC; **all four gate states were re-checked
2026-08-22 — the first three at 17:12 UTC and #1076 re-queried at 17:24 UTC**, after
review flagged that a blanket "re-checked" claim sat above a row still dated
2026-08-21. At that measurement, **no agent performed any of the external transitions
named below**, and none was authorized by this entry.

**Two of the four have since closed: #1091 merged on 2026-08-22, and #1076 is now
closed unmerged.** The table below now records two active gates and two closed records,
not four open gates. The public attestation and disposable authenticated proof remain
the active blockers.

### Two active gates and two resolved records

| Gate                                | State                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1091 ready-state / reviewer action | **CLOSED 2026-08-22.** #1091 is **merged** — `merged: true`, closed 12:38:29 UTC by `cheekhimself`, final head `c432f9836f74`. It is no longer a draft and no longer waiting on anyone. Superseded row text: "Owner-only. Draft at `74e1ad4`; review automation cannot engage until the transition happens. Not performed by any agent" |
| Public attestation                  | **STILL INVALID** (tip/lag re-measured 2026-08-23 02:09 UTC). Canonical `a3ae36765`, production `faea6e9c59ad` `dirty: true`, lag **`12`** — see below                                                                                                                                                                                  |
| Disposable authenticated proof      | **Must remain UNDISPATCHED** while attestation is invalid                                                                                                                                                                                                                                                                               |
| #1076 CI runner migration proposal  | **CLOSED UNMERGED.** Retained as a resolved record for traceability; it no longer blocks or authorizes a workflow migration.                                                                                                                                                                                                            |

### #1091 — 35/35 required is true; "clean head" is not (superseded head)

> **#1091 MERGED 2026-08-22 12:38:29 UTC** as `72e766314` on the deploy branch,
> from final head `c432f9836f74` — **not** `74e1ad4`. Everything below was measured
> against `74e1ad4` and describes that head only. The branch advanced past it before
> merging (`c432f983`, "fix: withhold paused One-Tent proof reads", 11:59:28 UTC,
> touching five files under `src/`), so **do not read the smoke failure below as a
> statement about the merged code.** Whether that check was re-run, and with what
> result, on `c432f983` is `NOT_MEASURED` here. The finding is kept because the
> _lesson_ survives the merge — "35/35 green" summarised away a red check — while
> the _measurement_ does not.

`established fact`, measured 2026-08-21 ~21:50 UTC against head `74e1ad4`
(branch `codex/one-tent-polish-ea31`, **behind the deploy tip by 1 at that time**):

**All 35 ruleset-required contexts are green** — enumerated, not assumed: the 32
`Full test suite (shard n/32)` jobs, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, and `test:legal-seo`. The ruleset is
genuinely satisfied.

**A non-required check is red on that same head, and it is not a test failure.**
`Quick Log Playwright smoke` concluded `failure` (job `96919203284`, run
`32529735698`). Its own step outputs:

- `FIXTURE_STEP_OUTCOME: failure`
- `SMOKE_STEP_OUTCOME: skipped` — the smoke never executed
- `REPORT_JSON_PRESENT: false`, `SMOKE_COUNTS_AVAILABLE: false` — no report produced

It ran **authenticated against the live Lovable host** (`E2E_FIXTURE_MODE: true`)
with three fixture variables empty: expected grow name, second plant name, and
account hint. In the **same run**, `Authenticated One-Tent branch proof` concluded
`skipped`. `Browser census (authenticated)` was still `in_progress` at read time.

**Root cause is `NOT_MEASURED`**, and the distinction matters before anyone
resequences work around it: a failed _fixture/config_ step is not the same finding
as a failed assertion, and only the second would implicate product code. Nobody
should conclude either way from the summary line.

**Why this is recorded rather than acted on.** `codex/one-tent-polish-ea31` is
Codex's owned slice; adopting it would violate the collision fences in this file.
This entry is a handoff, not a claim on the work. But **"35/35 green" is the
summary that hides this**, so a ready-state transition taken on that summary alone
would carry an unexamined red into review.

**That warning is now retrospective, not actionable.** #1091 merged on 2026-08-22
from a later head. The point stands as a reading rule for the next PR summarised as
"all required green"; it is no longer advice about #1091.

### Attestation — re-measured 2026-08-22, still invalid

`established fact`, tip and lag measured 2026-08-23 **02:09 UTC**; the served-commit
rows measured 2026-08-22 **16:16 UTC** and re-confirmed unchanged at 17:09, 17:32,
17:51, 18:22, 00:02 and 02:09:

| Axis                 | Value                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Canonical deploy tip | `a3ae36765` (#1105)                                                                                              |
| Production serves    | `faea6e9c59ad`, `buildTime 2026-08-21T20:51:46.584Z`, `treeHash 7d9cc8a12898`                                    |
| Provenance flags     | `dirty: true`, `ref: "__orphan__"`                                                                               |
| Ancestry             | live **is** an ancestor of the tip                                                                               |
| Publish lag          | **12** first-parent commits (#1095, #1096, #1098, #1091, #1099, #1097, #1100, #1101, #1102, #1092, #1107, #1105) |

**The gap has now widened twice for two different reasons, and the distinction
matters.** Between 2026-08-21 and the 16:16 UTC reading, production republished _and_
the tip moved six commits — both halves changed, and the lag went 2 → 6. Between
2026-08-22 16:16 UTC and 2026-08-23 02:09 UTC, production did **not** republish at
all; only the tip advanced (#1100, #1101, #1102, #1092, #1107, #1105), taking the lag
6 → 7 → 8 → 9 → 10 → 11 → **12** across nearly ten hours. A widening lag is not by itself evidence of a stalled
publish, nor of a fresh one; read which half moved. `dirty: true` and
`ref: "__orphan__"` survived the republish, so the provenance defect is not a
one-build artifact. Prior reading, superseded: 2026-08-21 21:58:32 UTC — tip
`faea6e9c59ad`, live `ea31fbdfb934`, lag `2`, which itself re-confirmed the 21:05 UTC
row 53 minutes later. That pair is exactly why a lag figure is never carried forward:
two readings agreeing 53 minutes apart said nothing about the next 18 hours.

### `20260813030000` — "unapplied" carries two meanings, and one is dangerous

**This is the entry most likely to be misread, so state which sense is meant every
time.**

- **The GitHub apply lane never succeeded** — the apply-signup workflow still shows
  only its failed PREFLIGHT. True.
- **The production objects are live.** Per the measurement already recorded in the
  signup-attribution section above (2026-08-21 ~15:23 UTC, Lovable `query_database`
  against the production project): the table, all four helper functions, the
  readiness RPC, and a `handle_new_user` carrying the `RAISE LOG` guard from
  `20260821150000` all exist. Ledger name-rows for `20260813030000` are present via
  the founder backfill.

**The hard stop is unchanged and this entry does not soften it: do NOT GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql`.** That file re-issues an
**unguarded** `handle_new_user` and would overwrite the live guard — a production
incident. A reader who takes a bare "remains unapplied" as licence to apply it has
inverted the finding.

---

## ⚠️ Production JS ships a LIVE payments token — which FAILS CLOSED, disabling checkout (recorded 2026-08-21, severity corrected 2026-08-22)

Recorded by Claude 2026-08-21 ~23:03 UTC at Cheek's instruction, after Cheek
raised it; **re-measured 2026-08-22 16:16 UTC against a newer production build and
still true.** **Publishing is stopped by owner order while this stands.** Nothing
here authorizes a publish, an env edit, or a token rotation.

> ### ⚠️ SEVERITY CORRECTED 2026-08-22 — read this before quoting anything below
>
> **An earlier revision of this section said "production is running **live** payments."
> That was wrong, and the correction inverts the risk.** Raised by Copilot in review of
> #1092, verified in the served source **and** in the shipped bundle before conceding.
>
> At the served SHA `faea6e9c59ad`, `src/lib/paddleEnvironment.ts` classifies a `live_`
> token as `"live"` and `resolvePaddleCheckoutEnvironment` returns `"sandbox"` **only**
> for a `test_` token — every other class resolves to `"unavailable"`, on every host.
> `src/lib/paddle.ts`'s own header states the policy: _"Live tokens fail closed on every
> host."_ Confirmed empirically in the shipped bundle rather than inferred from source:
> the minified resolver reads
> ``iv(e){return rv(e.token)===`sandbox`?`sandbox`:`unavailable`}``, and the blocking
> copy `Checkout disabled: Verdant currently supports Paddle sandbox testing only.`
> ships alongside it.
>
> **So production is not taking live payments. Production is taking NO payments.** The
> live-class token disables checkout entirely; a grower who tries to upgrade sees the
> blocking message. That is a different defect from the one first recorded — a
> **checkout-blocking configuration and provenance defect**, not an unnoticed live
> billing surface.
>
> **The direction of the publish risk flips with it.** A file-sourced `live → test`
> swap would **restore** the intended sandbox checkout, not "break live payments".
> The corrected outcome list is below.
>
> The measurements in this section are unchanged and still stand — what a `live_`
> token _means_ is what was wrong. This is the "inference presented as conclusion"
> failure mode again: token class was read as billing state without checking the code
> that consumes it.

**Never reproduce a live token body** — in this file, a commit message, a PR, or
chat. Class prefix, length and redacted context are sufficient and are all that
appears below.

### What is measured

`established fact`, **re-measured over live HTTPS 2026-08-22 16:16 UTC** against a
DIFFERENT, newer production build than the one first recorded. The finding survives
the republish unchanged:

| Axis                                         | Value                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Production bundle                            | `/assets/index-C-R0_Bat.js` (820,070 bytes)                                              |
| Inlined key                                  | `VITE_PAYMENTS_CLIENT_TOKEN`                                                             |
| Shipped class                                | **`live_`**, body length 27, one distinct value, two occurrences in that bundle          |
| `test_`-shaped payments token in that bundle | **zero**                                                                                 |
| Repo `.env.production`                       | **`test_`** class (sha256 `1a79e29c…`)                                                   |
| Lovable project `.env.production`            | **`test_`** class, byte-identical to the repo file — **re-read 2026-08-22 16:16 UTC**    |
| `.env.development`                           | byte-identical to both (sha256 `1a79e29c…`)                                              |
| Serving commit at measurement                | `faea6e9c59ad`, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"` |

**Still the live build at 2026-08-23 02:09 UTC.** `/version.json` was re-fetched at
17:09, 17:32, 17:51, 18:22, 00:02 and 02:09, returning the same commit and the same
`buildTime` every time, so the bundle measured at 16:16 is
still what production serves. **The bundle itself was not re-fetched at 17:09** — this
row is a 16:16 UTC measurement carried forward on an unchanged serving commit, which is
the one case where carrying forward is legitimate. If `buildTime` moves, re-fetch the
bundle rather than trusting this row.

**The republish is itself evidence.** The asset filename changed
(`index-aTS7aKMk.js` → `index-C-R0_Bat.js`) across a build that also moved the served
commit `ea31fbdfb934` → `faea6e9c59ad` — so this is a rebuild, not a cached artifact —
and the shipped token is still `live_`, still 27 characters, still one distinct value
appearing twice, while both `.env.production` files still say `test_`. **A build cycle
did not reconcile the two.** The 2026-08-21 23:03:25 UTC reading of
`/assets/index-aTS7aKMk.js` is superseded only in its bundle path; every other row held.

**The shipped value does not match what either `.env.production` says NOW.** State it
that way and no further — an earlier revision said the bundle "came from neither
`.env.production` file", which is a categorical attribution the evidence does not
support, withdrawn 2026-08-22 after a review P2.

**Which source supplied the value at build time is `NOT_MEASURED`**, and two candidates
remain live:

1. **A platform environment variable** overriding the files at resolution time — the
   obvious candidate, and the one the §6.1 withdrawal below leans on.
2. **The workspace `.env.production` itself carrying a `live_` value at build time and
   being restored afterwards.** Both files were read _after_ deployment, so this is not
   excluded by anything measured here. It is the more interesting candidate, because it
   would explain the shipped token **and** the `treeHash` mismatch with one mechanism,
   on a build already stamped `dirty: true`.

**Do not discard candidate 2.** The §6.1 withdrawal argues candidate 1 is _likeliest_;
it does not establish candidate 1 and does not exonerate the file. Only the
owner-gated build log separates them. One bound tightened and one did not:
the earlier scan covered all 20 production bundles for `test_`-shaped tokens and found
none; **this re-measure scanned the main bundle only**, so the other nineteen are
`NOT_MEASURED` at the 2026-08-22 reading rather than re-confirmed.

### Pre-publish read, performed 2026-08-22 16:16 UTC

The owner's standing instruction is to re-read the Lovable `.env.production` before
anyone opens the publish button. **Done, and the answer is unchanged: it still reads
`test_`.**

Read that result correctly — it is the _reason_ the hazard is unresolved, not a
clearance. The file said `test_` on 2026-08-21 while production shipped `live_`, and it
says `test_` today while production still ships `live_`. **Reading the file cannot tell
you what a publish will produce**, because its contents _now_ are not evidence about
what was resolved at the earlier build — whether a platform variable overrode it, or the
file itself briefly differed and was restored. **Note what this does NOT say:** an
earlier revision said "the file demonstrably is not what produced the current bundle",
which contradicts candidate 2 recorded above and is **withdrawn 2026-08-22** after a
sixth review P2. The build-time source stays `NOT_MEASURED`. Only the platform env panel
and the publisher's build log can settle it, and both are owner-gated. A publish taken on the strength of this read alone is exactly the
sloppy publish the owner warned against.

### Why this is not merely an env-file discrepancy

`scripts/lib/tree-hash.mjs` lists the committed `.env` files in
`TREE_HASH_ROOTS`, and its own comment gives the reason: _"Committed Vite env
files: `VITE_\*` values are inlined into shipped JS, so an env-only commit
produces different app bytes and must move the hash."\_

So `.env.production` is a hashed root **precisely because** its values reach
shipped JS — and its shipped value differs from its committed value.

**WITHDRAWN 2026-08-22 — this did NOT close the audit's §6.1 `NOT_MEASURED`, and
saying it did was an error.** Raised as a P2 by `chatgpt-codex-connector` on #1092
and verified before conceding. The withdrawn claim read: "**A shipped byte does
differ**, and it is a hashed root ... The workspace-drift finding is no longer
confined to inputs that never reach users."

**Why it was wrong.** §6.1's open question is whether _the workspace content
responsible for the `treeHash` mismatch_ reached shipped bytes. What is measured
here is different: shipped JS diverges from what the **committed** `.env.production`
prescribes. Those coincide only if the **workspace file on disk** differed at build
time — and there is a mechanism that produces the measurement without any such
difference. Vite's `loadEnv` resolves `VITE_*` from platform environment variables as
well as from `.env` files, and a platform variable overrides the file **without
altering the file**. Under that mechanism the workspace `.env.production` is
byte-identical to the committed one, contributes **nothing** to the tree-hash
mismatch, and the mismatch is caused by some other, still-unidentified file.

**That mechanism is sufficient to break the inference; it is not established as what
happened.** The workspace file may equally have carried a `live_` value at build time
and been restored afterwards — see the two candidates recorded above — in which case it
_would_ have both moved the hash and shipped. Either way the §6.1 bound holds, because
neither candidate is measured. Do not read this withdrawal as clearing the file.

So two separate claims were conflated:

| Claim                                                                    | Status                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Shipped bytes differ from what the committed env file prescribes         | **measured** — that is the finding above, and it stands |
| The workspace drift behind the `treeHash` mismatch reached shipped bytes | **`NOT_MEASURED`** — unchanged; §6.1's bound is intact  |

**The audit's §6.1 bound therefore stands as written and needs no correction** —
which also retires the standing offer to amend that document on this point. This is
the "inference presented as conclusion" failure mode the deliverable itself names,
committed here while writing about it.

What survives, and is worth keeping: `.env.production` **is** in `TREE_HASH_ROOTS`
precisely because `VITE_*` values reach shipped JS, so _if_ that file ever drifts in
the workspace it would both move the hash and change shipped bytes. That is a reason
to keep watching it — not evidence that it happened.

### The publish hazard — THREE outcomes, not two (corrected 2026-08-22)

**The two-outcome model recorded here was incomplete.** Raised as a P2 by
`chatgpt-codex-connector` on #1092 and verified at source. #1091 merged
`scripts/assert-paddle-production-sandbox.mjs` into `package.json`'s **`prebuild`**,
where it now runs _first_, ahead of `stamp-version.mjs`. Read directly: it requires
the committed `.env.production` to resolve as the canonical sandbox token, then calls
Vite's own `loadEnv("production", rootDir, "VITE_PAYMENTS_")` — the **effective**
resolution, platform environment variables included — and fails unless that effective
value is itself a sandbox token _and_ equals the canonical one
(`effective_paddle_token_not_sandbox` / `effective_paddle_token_mismatch`, `exitCode 1`).

So the outcomes are:

1. **The build fails closed** — a live platform value now trips the guard before any
   output is generated. On the current deploy branch, via the repo's own build script,
   this is the expected outcome.
2. **A publish keeps the live token** — only if the publisher bypasses the package
   lifecycle (invoking `vite build` directly rather than `run build`, so `prebuild`
   never fires).
3. **A publish swaps live → test and RESTORES sandbox checkout** — if the file wins
   and the guard passes. Note the direction: because a live token already fails
   closed, this outcome **fixes** checkout rather than breaking it. An earlier
   revision called this "breaks live payments", which was backwards.

**Two bounds, both load-bearing:**

- **Whether the publisher runs the package lifecycle at all is `NOT_MEASURED`.** The
  guard only protects the paths that invoke `prebuild`. This is the same gap the
  bot named, and it is not closed here.
- **The guard does NOT explain the token already in production.** It is absent from
  the live build: `scripts/assert-paddle-production-sandbox.mjs` does not exist at
  `faea6e9c59ad`, whose `prebuild` is only `verify-edge-shared-in-sync` →
  `check-no-src-lib-imports` → `stamp-version`. It was added by `72e766314` (#1091),
  merged 2026-08-22 12:38:29 UTC — **after** the live build was stamped
  (2026-08-21T20:51:46.584Z). It changes what the _next_ publish does; it says nothing
  about how the current one shipped `live_`.

Nobody can predict the outcome from the repository alone. That is still why the env
surface must be read immediately before any publish — and why reading the **file alone
does not answer it**: the file said `test_` while production shipped `live_`.

### Severity, stated precisely

`inference, high confidence`, not verified against Paddle: a Paddle **client-side
token** is designed to be public, ships in the browser by intent, and cannot
authorize server-side operations. On that reading this is **not** an API-key leak.

What it **is**, corrected: a **checkout-blocking** configuration and provenance
defect. Production is running **no** payments — the live-class token fails closed and
disables checkout on every host — while every committed env file in the repository
says test, and the mismatch is invisible to CI. The earlier wording "production is
running **live** payments" is **withdrawn**; see the severity-correction block at the
top of this section.

### What else was checked, and came back clean

All 20 production bundles were scanned for secret-class markers **on 2026-08-21**;
the 2026-08-22 re-measure re-read only the main bundle, so this subsection is a
2026-08-21 result and is `NOT_MEASURED` against the current build. One hit:
`BRIDGE_TOKEN` in `sensorTestbenchIndicatorRules-BYI81Sq2.js`, which is a
PowerShell **variable name** inside a copy-paste snippet template carrying the
literal placeholder `<vbt_… mint a token to reveal>`. No token value.
`VITE_SUPABASE_PUBLISHABLE_KEY` is the anon key — public by design and already
committed in `.env`. No `service_role`, `SECRET`, or `PRIVATE_KEY` marker appears
in any bundle.

### Method note for whoever re-measures

The landing HTML contains NUL bytes, so plain `grep` reports **no matches and no
error** against it — the same trap `docs/agent-session-network-reachability.md`
records. Use `grep -a`. A bundle scan that silently returns nothing is the failure
mode to expect here.

---

## External reference scope — MACAE accelerator (recorded 2026-08-22)

**Status: `REFERENCE_ONLY`. Owner: Claude.** This row records that the scope exists; it
authorises no build, no slice, and no port. Recorded as its own timestamped row rather
than as a new Last-updated block — it supersedes no measurement above.

**Scope (`source claim`):** relayed by Cheek as "Grok has scoped this demo for all agents
to read and ingest for future builds", authorised 2026-08-22 as a docs-only slice.

| Field                              | Value                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository                         | `Verdant-OS/multi-agent-custom-automation-engine-solution-accelerator` (public)                                                                  |
| Read at                            | `b4a4a00` on `main`, `2026-06-26T20:50:10Z` — shallow clone, read 2026-08-22                                                                     |
| Digest                             | [`docs/knowledge-library/macae-reference-ingest.md`](../knowledge-library/macae-reference-ingest.md)                                             |
| Clone path (ephemeral)             | `/home/user/verdant-os/multi-agent-custom-automation-engine-solution-accelerator` — does not survive the container; re-clone from the public URL |
| Runtime behaviour                  | `NOT_MEASURED` — never deployed or executed                                                                                                      |
| Applicability to any Verdant slice | `NOT_MEASURED` — no slice assigned                                                                                                               |
| Slice owner                        | **Claude**                                                                                                                                       |
| Owner-designated reviewer          | **Blue Dream**, in Cursor — not a GitHub handle (Cheek, 2026-08-22)                                                                              |
| Protocol peer-review seat          | **Grok (GDP)** — filled by Cheek 2026-08-22; `HANDOFF_PROTOCOL.md:24` allows Grok, Claude or Codex                                               |
| Owner acknowledgement              | **cheekhimself**, given out-of-band, outside the GitHub review-request mechanism                                                                 |

Pairing recorded here per `docs/agents/HANDOFF_PROTOCOL.md:25`, which requires both names
in this file and not only in the handoff block. **Read the two reviewer rows together —
neither alone is the whole picture.**

Blue Dream remains the owner's designated reviewer and reviews in Cursor, not on GitHub,
so an empty GitHub reviewer list on these PRs is by design and not an oversight. The
protocol peer-review seat is now filled by **Grok (GDP)** as the independent peer
reviewer (Cheek, 2026-08-22). Blue Dream is **not** one of the three peers (Grok,
Claude, Codex) that `HANDOFF_PROTOCOL.md:24` and `AGENTS.md:582-584` permit in that
seat; Grok (GDP) is. Do **not** leave or restate `NOT FILLED` / "cannot infer" as the
live claim for this seat.

**Read the digest before acting on anything in that repository.** Its do-not-port rules
bind, and are repeated here so this row is not safe to quote alone:

1. **The in-memory approval store is an anti-pattern for Verdant.**
   `OrchestrationConfig` (`src/backend/v4/config/settings.py`) owns
   `approvals: Dict[str, bool]` coordinated by `asyncio.Event`, with
   `default_timeout: float = 300.0`; `HumanApprovalMagenticManager`
   (`human_approval_manager.py`) uses that config. A restart, a second replica, or a
   slow human loses the decision, and that path keeps no audit record. Do not
   reproduce that shape.
2. **The Action Queue stays durable** — `reason`, risk level, `status`, and an append-only
   audit trail, enforced with RLS. Approval is a persisted row, never process memory.
3. **Read the approval-gate shape and the tools-as-services separation. Port nothing
   else** — not the Azure runtime, not Cosmos DB, not Container Apps, not the in-memory
   approval store.
4. **Automation last.** Diary first, sensors second, AI third. This accelerator is an
   automation-orchestration engine; it does not move up that order.

---

## Agents currently assigned

| Agent             | Assignment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex             | Standing SEO measurement readiness and analytics integrity. Option A slice 1 (#949) is live-verified. Convex Phase 1 of `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` remains in review: PR #977, still OPEN 2026-08-15. Scope stays Phase 1 only, under `spikes/convex-component-sandbox/`. **Do NOT rebuild the Postgres domain-reach detector — Phase 0 and Phase 1 of `POSTGRES_RESTRICTED_ROLE_SPIKE` are already delivered by Claude.** Incoming #986 still said Phase 1 was `HOLD`; that row was stale. Phase 2 of that arm is HOLD (JWT secret unobtainable on Lovable Cloud; role durability `UNKNOWN`)                                                                                                                                                                                                                                                                                                                                                       |
| Claude            | **One-Tent Loop Tranche B+ — architect and implementer (Cheek, 2026-08-19). Substantially delivered as of 2026-08-21:** B0a (#1039), B1 (#1040), B3a (#1042), B2a (#1049), B4a (#1047) and D7 (#1041) merged; D5 (#1043) **merged** `e9e5ec5`; B2b/B5 blocked on unopened Tranche A slices A5/A3; **B4b has no remaining scope** — A2 landed and B4a already covers all of it, so do not open a B4b slice (see the Tranche B+ table note). Also delivered #1062, the routed `CURRENT_STATE` refresh specification (`docs/specs/current-state-refresh-2026-08-20.md`). `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` specification — delivered. `POSTGRES_RESTRICTED_ROLE_SPIKE`: spec delivered, **Phase 0 detector measured and Phase 1 role harness delivered (local-only)**, 2026-08-14 under Cheek's approval and full-authority grant. Not the 2026-08-13 “spec-only / not implementation” row. Prior completed out-of-slice work (#586/#809/#812/#885) unchanged |
| Grok              | **Product Intelligence, Adversarial Audit, and Implementation Lead** (Cheek 2026-08-20, refined). Equally empowered to research, audit the live app, implement assigned slices, test, and independently review. Peer with Claude and Codex — **none outranks the others**; explicit task ownership controls. SEO/market/backlink strength retained (not a fence). Map: `docs/agents/grok-peer-elevation-map-2026-08-20.md`. Does **not** take Tranche A remaining edit points (Codex) or Tranche B+ product code (Claude) unless done and unassigned. Prior delivered work unchanged: `ONE_TENT_LOOP_OPERATING_ORDER` repo slices 0/2/3/4; Slices 1 and 5 owner-`BLOCKED`; Cursor SDK spike gates on #985 / `CURSOR_API_KEY`. Reuse of the dispatcher not approved. Convex/Postgres spikes not paused. Production Convex HOLD. Not Unassigned                                                                                                                      |
| Security reviewer | Unassigned until Convex Phase 1 spike code is ready for review before any Convex cloud credential                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Gemini            | Unassigned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Council Chair     | Convex-vs-Postgres comparison: **recommendation delivered in spec §10 — adopt Postgres incrementally, hold Convex.** Postgres arm has a measured number (8 cross-domain reaches across 22 service-role functions). Convex arm remains `NOT_MEASURED` pending #977 isolation proofs (green CI on #977 is not those proofs). Incoming #986 still said “do not issue a recommendation until both arms carry evidence”; that sentence is stale — the recommendation already shipped. `ai-coach`'s five reaches are the case neither architecture removes cheaply                                                                                                                                                                                                                                                                                                                                                                                                       |
