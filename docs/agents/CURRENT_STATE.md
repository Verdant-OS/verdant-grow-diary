# Verdant — Current Operating State

**Last updated:** 2026-08-14 UTC
**Updated by:** Claude (2026-08-14, later edit: records Cheek's in-session
approval of `POSTGRES_RESTRICTED_ROLE_SPIKE` and the **delivered, measured**
Phase 0 detector — 22 service-role edge functions, 8 cross-domain table reaches
against deploy tip `e1214d3df`. Records Cheek's decision to abandon
`claude/breeder-mode-genetics` and `claude/cultivar-library-p1`. Refreshes the
Branch topology row from `cbbd7122` to `e1214d3df` after five merges this
session (#979, #815, #710, #795, #980). Sentinel-Version moved to 2026-08-09.3
via #710; the tip then moved to `7843a3fcb` (#981, Phase 0) and `f2a03998f`
(#982, Phase 1). Records Cheek's "execute phase 1" decision and the
**demonstrated** local-only role harness — 10/10 proofs. Also records Cheek's
2026-08-14 approval-in-principle of **Phase 2 production adoption** (execution
gated on three items, see the slice entry) and the **Convex-vs-Postgres
recommendation**: adopt Postgres incrementally, hold Convex. No production, GA4,
GSC, sitemap, or release-identity row was re-measured in this edit; those retain
their earlier verification dates.)

**Prior update:** 2026-08-13 UTC
**Updated by:** Claude (records Cheek's 2026-08-13 in-session approval of the
named isolated Convex component sandbox spike, plus the deploy-branch HEAD
observed while writing that spec. Public-surface, GA4, and release-identity
rows retain their earlier verification dates; none were re-measured in this
update. Same-day follow-up: records the previously-untracked Lovable
knowledge-pack mechanism and this session's audit of its pre-2026-08-13
backup content against deploy-branch HEAD `e7690396e` — see the new
"Completed, out of slice (recorded 2026-08-13)" entry below; that audit's
evidence is pinned to `e7690396e` and was not re-verified against a later
tip. Second same-day follow-up, per Codex review on PR #975: the Branch
topology row below was stale at `6434ea2a8` (#942) even before this file's
own `e7690396e` (#943) reference was added, and the branch has since moved
again — refreshed the row to the actual current tip, `fb42ce00e` (#968),
verified with a fresh `git fetch` rather than by re-asserting either older
number)

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
"≥ 1 beyond signup" is proven, by object absence. **Someone should reconcile the
full migration ledger against production before assuming anything else in the
265-file directory is live.**

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `f2a03998f46f9e3827a593af100969a2f967f932` (#982), verified 2026-08-14 with `git fetch origin verdant-grow-diary && git rev-parse origin/verdant-grow-diary`. Supersedes `e1214d3df` (#980), `cbbd7122` (#978) and `fb42ce00e` (#968). Seven commits landed this session, in `git log` merge order oldest-first: `623edf17b` (#979), `e200d7561` (#815), `1a3a70d1b` (#710), `cba42c6d4` (#795), `e1214d3df` (#980), `7843a3fcb` (#981), `f2a03998f` (#982). PR numbers on this branch do not order by merge time — order commits with `git log`, never by PR number. Do not carry older validation tables forward |
| `main`               | Integration branch. It is not production parity. | `b6d747941948ce68157185a2b0847acea6970d44` (#779), verified 2026-08-07                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

`main` and `verdant-grow-diary` are divergent. Do not infer production behavior from
`main`, and do not backport deploy-only governance or data rules without a scoped branch
integration task.

The deploy-branch governance integration is complete in PR #626, and reconciliation PR
#635 is merged. The bounded Mode A readiness-evidence PR
[PR #679](https://github.com/Verdant-OS/verdant-grow-diary/pull/679)
(`codex/seo-readiness-evidence-20260802`) merged 2026-08-02 as `bff64896679d`. It
changed readiness evidence, artifacts, and tests only; it is **not** deployment evidence.

---

## Production status

Analytics axes verified directly on 2026-08-02; release identity re-verified 2026-08-05;
public-surface axes (sitemap, root route, indexable-route coverage) re-measured
2026-08-07 with a live sitemap re-count 2026-08-12. Each row carries its own
verification date where they differ:

| Axis                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200 (re-verified 2026-08-05)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Production commit                           | `PASS` — verified 2026-08-05 ~22:10Z: production serves real SHA `3f773b680dcc` with the resilient stamp live (`commitSource: "git"`, `treeHash: c8fc076f0011…`, `ref: "__orphan__"`, `dirty: false`); resolver matched the served treeHash to this exact commit via tag annotation. Incident context: the same day's 15:47:45Z build had stamped `commit: "unknown"` (see blocker 6 — resolved and live-verified); single observations remain point-in-time |
| Production build time                       | `2026-08-05T22:06:15.869Z` at the ~22:10Z verification; earlier that day: 15:47:45Z (degraded), 15:52:18Z (healthy pre-resilience)                                                                                                                                                                                                                                                                                                                           |
| Public sitemap                              | `PASS` — HTTP 200, **56** `<loc>` entries (live re-count 2026-08-12; supersedes the 51 of 2026-08-02 and the 55 measured 2026-08-07 — `/tools/blueprint-targets` shipped 2026-08-11 via #892). All 55 URLs of the 2026-08-07 set returned HTTP 200 with zero redirects and no `noindex`; the 56th postdates that crawl                                                                                                                                       |
| Public root route `/`                       | `FAIL` — measured 2026-08-07. The SSR response body is a suspended skeleton (`role="status"` … `Loading…`): 7 body words, no `<h1>`, no `<link rel="canonical">`, zero outgoing links. Every other public route SSRs 250–1500 words. `/` is also orphaned — no internal link targets it; navigation points "home" at `/welcome` (52 incoming). Root cause isolated; decision made — see blocker 7                                                            |
| Indexable routes outside the sitemap        | `FAIL` — four routes serve HTTP 200 with `robots: index, follow` yet are absent from the sitemap (re-confirmed against the deploy sitemap 2026-08-12): `/glossary`, `/breeder-beta`, `/creator-beta`, `/pheno-comparison`. Two are beta surfaces and one is a preview; none has a recorded eligibility decision — see blocker 8's sibling note                                                                                                               |
| robots.txt                                  | `PASS` — HTTP 200, production sitemap declared; neither lighting route is disallowed                                                                                                                                                                                                                                                                                                                                                                         |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified                                                                                                                                                                                                                                                                                                                                                                                |
| GA4 explicit lighting-page identity         | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted                                                                                                                                                                                                                                                                                                                                                                            |
| GA4 page-view singleton contract            | `FAIL` — five automatic tag-generated events observed beside explicit application events                                                                                                                                                                                                                                                                                                                                                                     |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                 |
| GSC authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Measurement Day 0                           | `UNSET`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Four-week measurement clock                 | `NOT_STARTED`                                                                                                                                                                                                                                                                                                                                                                                                                                                |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

---

## Latest deploy-head validation

**Replay-repair slice landed 2026-08-05.** Merged migration `20260804091142` revokes
EXECUTE on three function signatures that exist only in production, so every fresh
disposable-local-Supabase replay failed with SQLSTATE 42883, breaking the Security DB
Local, irrigation, and pgTAP replay lanes — and `continue-on-error: true` masked the
resulting job failure as a run-level success for a full day (run `30940375065`).
[PR #724](https://github.com/Verdant-OS/verdant-grow-diary/pull/724)
(`fc144485409a`) repaired the replay with a fingerprinted `compatibility_patches`
entry guarding exactly the three verified-missing signatures (`email_queue_dispatch()`,
`email_queue_wake()`, two-argument `admin_schema_audit`) — the migration file itself is
byte-unchanged — and removed the `continue-on-error` masking; the lane stays
non-required, but enabled failures now propagate to the run conclusion.
[PR #726](https://github.com/Verdant-OS/verdant-grow-diary/pull/726)
(`5611b130e81a`) tightened the audit provenance and lane docs and added a contract test
that fails the suite if any `continue-on-error` key returns to that workflow.

GitHub Actions push runs observed 2026-08-05 ~16:05 UTC for deploy commit
`5611b130e81a` (not exhaustive; listed runs are those observed):

| Check                                      | Status         | Evidence                                                                                                                                             |
| ------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck (tsgo) + build                   | `PASS`         | run `31021832816`                                                                                                                                    |
| Security DB Local                          | `PASS`         | run `31021835479` — full enabled run, not an opt-out skip: replay workspace prepared, `db reset` applied every migration, all harness steps executed |
| Irrigation evidence gate                   | `PASS`         | run `31021834439`                                                                                                                                    |
| Dependency & Security CI                   | `PASS`         | run `31021832498`                                                                                                                                    |
| auto-tag-release                           | `PASS`         | run `31021832735`                                                                                                                                    |
| Full Vitest Suite (PR gate)                | `NOT_MEASURED` | push run `31021833370` cancelled by queue supersession (not an intentional skip); all 35 required checks were `PASS` on the pre-merge PR head        |
| Core Link and Form Census                  | `NOT_MEASURED` | run `31021832698` still in progress at observation; the census pair is a pre-existing non-required failure on every branch                           |
| Required core schema present               | `FAIL`         | run `31021832568`                                                                                                                                    |
| Required money-critical migrations present | `FAIL`         | run `31021837013`                                                                                                                                    |

The validation evidence in this section is tied to deploy commit `5611b130e81a` and
must not be carried forward to later commits. The tip has since advanced through
`acad6cb938e5` (#727), `864eab892` (#725), `1ae1677645a0` (#729), `1a2df78ac3`
(#735), `6c78266edb7f` (#737), `a9a88e6ed` (#809), `63ed76c6d` (#794),
`ad29943ea9ec` (#785), `821adb9fafda` (#812), `b972ad8225ef` (#821) and on to
`c09b33d95ed2` (#814) — **69 commits ahead of `5611b130e81a`**, counted with
`git log --oneline 5611b130e81a..c09b33d95ed2` on 2026-08-07.
(PR numbers on this branch do not order by merge time: #809 merged before #794, which
merged before #785. Order commits with `git log`, never by PR number.)
None of the checks in the table above have been re-measured against any of those
commits; treat every row as evidence about `5611b130e81a` only. The Branch
topology row above names its own verification snapshot and is decoupled from this
section's evidence.
Notably, the full enabled Security DB Local run cited above (`31021835479`)
executed against `5611b130e81a` and is the replay-repair proof point regardless of
tip movement.

The two failing schema/migration guards remain outside the replay-repair and Mode A SEO
slices (board item #561). They are not converted to passes and prevent describing the
deploy branch as fully green; they require their own scoped owner/integration follow-up.

---

## Current approved slices

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
   *locally*; in production the role would be created and then **unreachable**.
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
- **Gate B — does the *hosted* PostgREST honour a custom `role` claim?** P3
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

Neither branch could be deleted from this environment (the agent proxy refuses
GitHub API writes and `git push --delete` alike), so both still exist on origin.
They are dead by decision, not by absence — treat this entry as the disposition.

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

**Completed, out of slice (recorded 2026-08-07):** #586 Action Queue atomic create. This
shipped as three separate merges, recorded separately because each carries different
migrations and different client moves:

- [PR #586](https://github.com/Verdant-OS/verdant-grow-diary/pull/586) merged as
  `dc29093b5`. **Introduced the RPC migration**
  `supabase/migrations/20260807010000_action_queue_create_rpc.sql` (nullable `dedupe_key`
  column, partial unique index on non-terminal statuses, and the `action_queue_create`
  SECURITY DEFINER RPC that writes the queue row and its `created` audit event in one
  transaction), plus `src/lib/actionQueueCreateRules.ts`,
  `src/lib/actionQueueCreateService.ts`, and the **Alert Detail** and **AI Doctor** client
  moves onto the RPC.
- [PR #809](https://github.com/Verdant-OS/verdant-grow-diary/pull/809) merged as
  `a9a88e6ed`. Added **only** `20260807140000_action_queue_create_allow_ai_coach.sql`
  (adds `ai_coach` to the RPC source allowlist) and the **Coach** client move, with tests.
  It did **not** introduce the RPC migration — that file already exists in `a9a88e6ed^`.
- [PR #812](https://github.com/Verdant-OS/verdant-grow-diary/pull/812) merged as
  `821adb9fa`, reconciling three lagging Action Queue pins against the atomic RPC.

All three (`dc29093b5`, `a9a88e6ed`, `821adb9fa`) are ancestors of the deploy tip recorded
in Branch topology above — verified 2026-08-07 with `git merge-base --is-ancestor` against
`c09b33d95ed2290c3364e54c77d5d980eb4e714a`. Re-verify this block
alongside the Branch-topology row: if a later reader advances that row, the ancestry claim
here is only as current as the head it was checked against.

Read directly from the migration bodies: the RPC inserts `status` `'pending_approval'`
literally, inserts `target_device` as NULL literally, and derives `user_id` from
`auth.uid()` rather than any client argument. That is an observation about this RPC only —
it is **not** a cleared system-wide fence. Per the migration's own header this is an expand
step: client `INSERT` on `action_queue` is deliberately not revoked and legacy
direct-insert paths remain functional, so the RPC's constraints do not bind writers that
bypass it. A contract/revoke step would be a separate slice.

Authoring agent is **not determinable from git**: all three commits are squash merges
attributed to the repository owner, and #809's source branch is deleted. The fact recorded
here is that this work shipped while this file listed the active slice as Mode A SEO and
every agent row except Codex as `Unassigned`. This entry records that; it does not
retroactively authorize it, and it does not assign it to an agent.

Production application state of both migrations: `BLOCKED` — not verified, and not
verifiable from an agent session. The Supabase MCP path available to agents resolves to the
**sandbox** project `bzatgtgjvuojpoxcknaa`, not production `knkwiiywfkbqznbxwqfh`
(refs pinned in `scripts/lib/supabaseDatabaseTargetIdentity.mjs`). A sandbox check on
2026-08-07 found the column, index, and function absent there; that is a sandbox
observation and carries no implication about production.
`scripts/apply-pinned-production-migrations.mjs` is SHA-pinned to three 2026-07-28 files
and does not cover these two.

**Completed, out of slice (recorded 2026-08-11):** #885 agent-integrations MCP
publication audit.
[PR #885](https://github.com/Verdant-OS/verdant-grow-diary/pull/885) merged
2026-08-11 via the merge queue as squash `1a9082bb1`. Documentation only — it adds
`docs/agent-integrations-mcp-server-spec.md` and changes no runtime, tool, schema,
or manifest code. Authoring agent **is** determinable for this one: Claude, in a
Claude Code session tasked with Lovable's "publish your app as an MCP server" flow,
while this file listed Claude as Unassigned. The audit found the MCP server itself
already shipped (PR #253, fixes #255/#256/#363) and needed no new implementation;
the doc records the three read-only tool contracts, the OAuth access model, the
pinned-surface change-control rule (repo-wide search for existing tool names before
any tool change), PASS/HOLD/REJECT expansion gates (Action Queue mutation, device
control, and no-login access all REJECT), and two sensor-contract gaps recorded as
specified-but-unapproved follow-up slices: `McpSensorReading` carries no
`confidence` field, and noncanonical legacy `source` labels (`sim`, vendor names)
pass through verbatim to connecting assistants. Live publication state (Lovable
Active status, OAuth 2.1 dashboard setting, endpoint reachability) remains
`BLOCKED` from agent sessions — the doc's §6 lists the owner actions. Five rounds
of automated (Codex-connector) inline review were verified against source and
addressed pre-merge. This entry records the work; it does not open a new slice.

**Completed, out of slice (recorded 2026-08-13):** Lovable knowledge-pack mechanism now
tracked. Cheek supplied a backup of the pre-2026-08-13 Lovable "Workspace/Project
Knowledge" pack content (`verdant_project_knowledge_BACKUP_pre-2026-08-13.md`, saved
outside this repo before Lovable's connector overwrote it) with no other instruction.
Claude audited its 8 factual claims against deploy-branch HEAD `e7690396e` (#943, this
branch's tip observed at audit time). The Branch topology row above has since been
refreshed to the branch's actual current tip, `fb42ce00e` (#968) — this audit's evidence
remains pinned to `e7690396e` specifically and was not re-verified against the newer
commits. On request, this entry records the mechanism here. This is the first appearance of
this mechanism anywhere in governance docs: it is a separate, ungoverned knowledge
surface (Lovable's project-level "Knowledge" field, populated via its own connector) that
`AGENTS.md`, this file, and every role file were previously silent on.

Audit verdicts (full evidence trail — file/line citations, git commits, PR numbers — lives
in the originating Claude Code session; not reproduced here):

- `PARTIALLY_ACCURATE` — public `/welcome` + `/demo` shipped with writes excluded from a
  "demo mode": `/welcome` holds; `/demo` does not — the standalone Demo page was deleted
  2026-06-03, six weeks before the pack's own ~2026-07-14 capture window, and `/demo` is
  now only a client-side redirect to `/welcome`. No app-wide demo-mode write-exclusion
  mechanism exists for any public surface.
- `PARTIALLY_ACCURATE` — CSV/TSV handling is a read-only review surface with disabled
  persistence: true for `CsvPreviewReviewGate.tsx` itself, which remains genuinely
  unreachable (imported only by its own test files, no page or route mounts it) — but
  that component is distinct from the public `/sensors/csv-preview` route, which is a
  live, reachable page (`src/pages/SensorCsvPreview.tsx` mounting
  `CsvSensorPreviewPanel.tsx`, linked from `/hardware-integrations` and
  `/partners/csv-preview`). `/sensors/csv-preview` is read-only in the same sense —
  no Supabase/network call in that component either — so the no-persistence verdict
  holds, but "unreachable" does not; do not conflate the two components. Separately,
  a live, authenticated write flow (`EnvironmentCsvImportLauncher` →
  `environmentCsvImportPersistence.ts`, mounted in `src/pages/Sensors.tsx`) really
  does insert into `sensor_readings` on confirm, shipped 2026-06-28, before the
  pack's own capture date — so "CSV/TSV handling" as a whole is not read-only either.
- `PARTIALLY_ACCURATE` — grower action follow-up evidence supported, outcomes never
  inferred, automatic diary creation unsupported: the outcome-never-inferred half holds.
  But `ActionDetail.tsx` does auto-insert (best-effort, not transactional — an insert
  failure does not roll back the completed status) a templated, outcome-less
  `diary_entries` marker row when an action is completed **from the Action Detail
  page** — a mechanism from 2026-05-26, predating the pack. This is narrower than "every
  Action Queue completion": completing via the Action Queue **list's** own "Mark
  Complete" control (`ActionQueue.tsx`, calling the `action_queue_transition` RPC
  directly) does not create a diary row at all.
- `PARTIALLY_ACCURATE` — real-data One-Tent smoke test blocked pending an actual tent
  reading, ghost seeding prohibited: the ghost-seeding prohibition is real and current.
  The actual block condition is a missing authenticated managed Supabase session, not
  literally an absent physical tent reading — once authenticated, the e2e spec enters a
  scripted, labeled "manual" reading.
- `STALE_NOW_DIFFERENT` — AI Doctor semantic output evaluator labeled an unmerged draft
  PR: [PR #230](https://github.com/Verdant-OS/verdant-grow-diary/pull/230) is confirmed
  **MERGED** (2026-07-14) and wired into required CI (`ci.yml` step
  `ai_doctor_output_eval`). Its content landed on the deploy branch via squash commit
  `0c4b3c1a4`, titled after unrelated PR #229 ("harden re-consent gate") — another
  instance of this repo's known squash-merge title/content mismatch pattern (see the
  #586/#809/#812 entry above for a prior example).
- `PARTIALLY_ACCURATE` — expanded pheno taxonomy migration merged but unverified on the
  live schema, cross-form UI gated pending confirmation: the migration-merged half holds,
  and production-schema verification remains genuinely `BLOCKED` from any agent session
  (same sandbox-vs-production Supabase MCP mismatch already documented in the #586 entry
  above). But no schema-confirmation gate exists in the live `PhenoKeepersPage` code — it
  silently degrades to an empty list / generic error on any Supabase error instead of
  holding for confirmation.
- `STILL_ACCURATE` — EcoWitt continuous live sync unverified until one real payload
  completes the full payload → dry-run → webhook → in-app provenance path: the repo's own
  acceptance ledger (`docs/ecowitt-hardware-validation-runbook.md`, "Final live proof
  ledger") remains a blank template as of its last edit (2026-07-18); every EcoWitt CI
  lane runs on fixtures/mocks only. This file carried zero EcoWitt mentions before this
  edit.
- `STILL_ACCURATE` — Quick Log legacy and V2 contracts remain separate with typecheck as
  a stop-ship gate: unchanged since PR #156 (2026-07-06); `quicklog-gate.yml` still runs
  `bun run typecheck` as a hard first gate before either note-sync test suite.

This entry does not authorize any new automation to keep the Lovable pack synchronized
with this repo, does not assign an owner for that mechanism going forward, and does not
claim the pack that replaced it on 2026-08-13 (which no agent session has read) is
accurate — only that the mechanism now exists in governance memory and that its prior
content's accuracy has been checked once.

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
   live 2026-08-05**. History: the 15:47:45Z build stamped `commit: "unknown"`
   (history-less Lovable publish sandbox, unborn-HEAD `git init`, no `GITHUB_*`
   env — proven and sandbox-reproduced); production self-healed at 15:52:18Z.
   Resilience shipped via PR #735 (`1a2df78ac3`, merged 17:41Z) with hardening
   in #737 (`6c78266edb`, merged 22:28:50Z) and follow-ups. **Verified live
   against the 22:06:15Z publish** — which, per its own commit `3f773b680dcc`,
   contained #735's stamper but predated #737's merge, so the live evidence
   attributes to #735's code; #737's hardening (trust-gated cross-era
   execution, annotation-line anchoring) awaits its first published build.
   The verification itself: production served `commitSource: "git"` and
   `treeHash: c8fc076f0011…`, and the resolver matched that hash to the exact
   commit via the `v2026.08.05-3f773b680dcc` tag annotation — Lovable's sandbox
   and the GitHub runner computed identical hashes independently, which shows
   the publish pipeline did not mutate hashed inputs **for that publish**
   (point-in-time evidence, not a permanent guarantee). Residual owner-side
   items (optional): raise the intermittent history-less sandbox with Lovable;
   retire the stale pre-SSR `vercel.json`.
   See the release-provenance runbook below for how to read and resolve stamps.
7. **Public root route `/` serves crawlers an empty shell.** Found 2026-08-07 while
   reconciling the Ahrefs site audit (project `10204962`, crawl `2026-08-07T07:14:05Z`).
   Root cause isolated 2026-08-12: the deliberate loading-until-hydrated gate in
   `src/components/RootEntry.tsx` (the fix for a navigation-freezing hydration
   mismatch), not an SSR defect. `/welcome` renders the identical `Landing` component,
   SSR'd correctly, and carries the navigation's "home" link plus 52 inbound internal
   links. **Cheek selected Option A on 2026-08-12** (`/` becomes the canonical home).
   Slice 1 (SSR the landing surface at `/`, no URL changes) is approved and handed to
   Codex; slice 2 (the `/welcome` → `/` consolidation, 35 pinned files) remains
   unapproved until slice 1 verifies live. Spec and handoff:
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

How to identify what production is running, even when a publish build had no
git context:

- **Read `/version.json`.** `commitSource` says where identity came from:
  `github-env` or `git` → `commit` is authoritative; `none` → `commit` is
  honestly `"unknown"` and identity lives in `treeHash` (the version string
  reads `<pkg>+<date>.t<hash12>`). `inherited` (if present) is the last
  repo-tracked stamp, explicitly `trusted: false` — lineage context, never
  identity. A null `treeHash` comes with `treeHashError` explaining why.
- **Resolve a treeHash to commits:** from any checkout with history,
  `node scripts/resolve-release-provenance.mjs --hash=<treeHash>`.
  Release tags created by `auto-tag-release` carry `Tree-Hash:` annotations
  (instant answer); the union scan then recomputes over recent commits
  (`--scan=N` caps it — the scan is slow on loaded Windows machines) and
  reports every content-identical commit **within the annotated tags plus the
  bounded scan window** — a partial-history answer, not exhaustive
  provenance. Candidates whose stamps predate the current hash algorithm are
  re-hashed by executing their own committed module, gated to ancestors of
  the protected release branch (`--trust-ref`) in a scrubbed environment —
  never code from arbitrary refs.
- **Canary practice:** periodically take a healthy stamp (`commitSource:
"git"` or `"github-env"` — both authoritative) and resolve its treeHash
  **pinned to its own recorded commit**:
  `node scripts/resolve-release-provenance.mjs --hash=<treeHash>
--ref=<stamped commit> --scan=1`. Only a NO_MATCH on that pinned scan
  indicates the publish pipeline mutated hashed inputs; an unpinned default
  scan can NO_MATCH merely because the commit fell outside the 30-commit
  window or the default remote ref is absent. First live run 2026-08-05
  22:06Z: PASS (exact match via tag annotation).

No new content family, automation, device control, production schema change, or
direct production write is approved by this state file. The 2026-08-13 Convex
slice is an isolated `spikes/` sandbox specified in
`docs/specs/convex-component-physical-sandbox-spike.md`; it is not a production
schema change and does not authorize production writes.

---

## Agents currently assigned

| Agent             | Assignment                                                                                                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex             | Standing SEO measurement readiness and analytics integrity. Convex Phase 1 of `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` is in review: PR #977, opened 2026-08-14, not a draft. Scope stays Phase 1 only, under `spikes/convex-component-sandbox/`. **Do NOT build a Postgres domain-reach detector — Phase 0 of `POSTGRES_RESTRICTED_ROLE_SPIKE` is already delivered by Claude (see slices above). Phase 1 of that arm is `HOLD` pending its own Cheek decision** |
| Claude            | `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` specification — delivered. `POSTGRES_RESTRICTED_ROLE_SPIKE`: spec delivered, **Phase 0 detector measured and Phase 1 role harness delivered (local-only)**, 2026-08-14 under Cheek's approval and full-authority grant (see slices above). Prior completed out-of-slice work (#586/#809/#812/#885) unchanged |
| Grok              | Unassigned. Prior same-session HOLD on unapproved Convex expansion is superseded only for this named isolated spike; production Convex remains HOLD                                                                                                                                           |
| Security reviewer | Unassigned until Phase 1 spike code exists; then review before any Convex cloud credential                                                                                                                                                                                                    |
| Gemini            | Unassigned                                                                                                                                                                                                                                                                                    |
| Council Chair     | Convex-vs-Postgres comparison: **recommendation delivered in spec §10 — adopt Postgres incrementally, hold Convex.** The Postgres arm has a measured number (8 cross-domain reaches across 22 service-role functions, `docs/specs/postgres-restricted-role-alternative.md` §5.1.1); the Convex arm remains `NOT_MEASURED` pending #977. Do not issue a recommendation until both arms carry evidence — and note that `ai-coach`'s five reaches are the case neither architecture removes cheaply |
