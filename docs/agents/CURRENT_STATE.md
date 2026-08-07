# Verdant — Current Operating State

**Last updated:** 2026-08-07 UTC
**Updated by:** Claude (Knowledge Library & Product Specification Architect), executing the
Mandatory governance handoff declared in this file's own "Current approved slices" section.
Docs-only; exactly one file changed.

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

**Provenance convention for this revision.** Every material fact below names the ref,
commit, artifact, or command that produced it. A finding without a ref is not a finding.
Facts re-verified during this handoff are dated 2026-08-07; facts carried forward retain
their original verification date and say so.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                                                               |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `cb98fe4e4` — verified 2026-08-07 via `git rev-parse origin/verdant-grow-diary`. The queue advances it several times daily; re-verify before relying on it. |
| `main`               | Integration branch. It is not production parity. | `b6d747941948ce68157185a2b0847acea6970d44` — verified 2026-08-07 via `git rev-parse origin/main`                                                            |

`main` and `verdant-grow-diary` are divergent. Do not infer production behavior from
`main`, and do not backport deploy-only governance or data rules without a scoped branch
integration task.

The deploy-branch governance integration is complete in PR #626, and reconciliation PR
#635 is merged. The bounded Mode A readiness-evidence PR
[PR #679](https://github.com/Verdant-OS/verdant-grow-diary/pull/679)
(`codex/seo-readiness-evidence-20260802`) merged 2026-08-02 as `bff64896679d`. It
changed readiness evidence, artifacts, and tests only; it is **not** deployment evidence.

---

## Deployed vs. unpublished — verified 2026-08-07

**Production is three commits behind the deploy branch.**

| Axis                                        | Status                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200, fetched directly 2026-08-07                                                                                                                                                                                                                                                         |
| Production commit                           | `PASS` — `ae3c0f75ebafab9c0457437bafaf9801a4e94d78` ("fix(plants): Assign to tent no longer dead-ends on a plant with no grow (#773)"), served with `commitSource: "git"`, `dirty: false`, `treeHash: 773509ad7dfb…`. `commitSource: "git"` is authoritative per the release-provenance runbook below. |
| Production build time                       | `2026-08-07T01:29:10.068Z`; `commitTime` `2026-08-07T01:21:39Z`; version string `0.0.0+20260807.ae3c0f75ebaf`                                                                                                                                                                                          |
| Deploy-branch tip                           | `cb98fe4e4` — `ae3c0f75e` is an ancestor; `git rev-list --count ae3c0f75e..cb98fe4e4` = **3**                                                                                                                                                                                                          |
| Unpublished source delta                    | **3 commits, 106 files, +3670 / -774** — `git diff --shortstat ae3c0f75e..cb98fe4e4`                                                                                                                                                                                                                   |

The three unpublished commits (`git log --oneline ae3c0f75e..cb98fe4e4`):

| Commit      | Subject                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `cb98fe4e4` | `fix(sensor-truth): re-land #592 freshness canon + residual (supersedes #691/#692)` |
| `dc29093b5` | `fix(action-queue): atomic create + server dedupe for audit trail (#586)`           |
| `aa3619110` | `fix(alerts): link Environment Check alerts to diary_entry evidence (#603)`         |

Two elements of that delta are named explicitly because they carry the most risk:

- **`supabase/migrations/20260807010000_action_queue_create_rpc.sql` — new file, 375
  lines**, introduced by `dc29093b5`. Verified via
  `git show --stat dc29093b5 -- <path>` (`1 file changed, 375 insertions(+)`) and
  `git show cb98fe4e4:<path> | wc -l` = 375.
- **The sensor-truth canon** — all added (`A`) in this delta, in both the app tree and the
  edge-function shared tree, per
  `git diff --name-status ae3c0f75e..cb98fe4e4`:
  `src/lib/sensorTruthCanon.ts`, `src/lib/sensorLiveMembership.ts`,
  `src/constants/sensorTruthRanges.ts`, and their
  `supabase/functions/_shared/lib/…` counterparts.

**Whether `20260807010000_action_queue_create_rpc.sql` is applied to production is
`BLOCKED`.** Verified 2026-08-07: `list_migrations` against project
`knkwiiywfkbqznbxwqfh` returned `MCP error -32600: You do not have permission to perform
this action`. This is structural, not transient — `docs/paddle-paid-launch-runbook.md`
records that the Supabase MCP in agent sessions sees only the personal sandbox account
(`bzatgtgjvuojpoxcknaa`) and cannot reach the Lovable-managed production project. **Do not
guess whether this migration is live.** An unapplied `action_queue` create RPC while the
application code that calls it is also unpublished is self-consistent; the risk is a
partial publish. Confirming application state requires owner-side or Lovable-side access.

---

## Production status — SEO and analytics

SEO/analytics axes were verified directly on 2026-08-02 unless a row states otherwise.
Rows re-derived during this handoff are dated 2026-08-07.

| Axis                                | Status                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public sitemap                      | `PASS` — **55** `<loc>` entries at `cb98fe4e4` (`git show cb98fe4e4:public/sitemap.xml \| grep -c "<loc>"`, 2026-08-07). Previously recorded as 51; see "Sitemap growth" below. |
| robots.txt                          | `PASS` — HTTP 200, production sitemap declared; neither lighting route is disallowed (2026-08-02)                                                                               |
| Lighting route technical SEO        | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified (2026-08-02)                                                                                      |
| Route runtime structured data       | `FIXED BUT UNVERIFIED` — see "Structured-data blocker resolution" below. Neither `PASS` nor `FAIL`.                                                                             |
| GA4 explicit lighting-page identity | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted (2026-08-02)                                                                                  |
| GA4 stream identity                 | **`BLOCKED`** — downgraded from `PASS` 2026-08-07. See "Evidence-artifact integrity" blocker.                                                                                   |
| GA4 page-view singleton contract    | **`NO_BASELINE`** — downgraded from `FAIL` 2026-08-07. See below.                                                                                                               |
| GA4 authenticated baseline          | `BLOCKED` — authenticated access unavailable                                                                                                                                    |
| GSC authenticated baseline          | `BLOCKED` — authenticated access unavailable                                                                                                                                    |
| Measurement Day 0                   | `UNSET`                                                                                                                                                                         |
| Four-week measurement clock         | `NOT_STARTED`                                                                                                                                                                   |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline — and as of this revision stream identity is itself
`BLOCKED`.

### Duplicate page views — why `NO_BASELINE`, not `FAIL`

The five automatic tag-generated `page_view` events recorded on 2026-08-02 were observed
against measurement ID `G-B3QRSZEM9S`, which the deploy branch no longer ships (`git grep
"B3QRSZEM9S"` at `cb98fe4e4` returns nothing). A defect measured against a stream that is
no longer deployed is not a current verified defect, and it is not a pass either. Per the
`AGENTS.md` status vocabulary, the correct value is `NO_BASELINE`: no valid earlier
measurement exists against the stream that currently ships.

**No code change can close this axis.** The duplicate emission is produced by GA4
**Enhanced Measurement → Page views → "Page changes based on browser history events"**,
which is a property/stream setting, not application behavior.
`docs/seo/analytics-owner-setup-checklist.md` already records this as
`BLOCKED_BY_ACCESS` and assigns it to the owner. Do not open an application-code slice
against it.

### Sitemap growth: 51 → 55

Four routes shipped 2026-08-02 in
[PR #627](https://github.com/Verdant-OS/verdant-grow-diary/pull/627) (`a1b1e3501`,
"feat: add evidence-first cannabis symptom hub and checks"), verified as an ancestor of
`cb98fe4e4`:

- `/guides/cannabis-leaf-symptoms`
- `/guides/cannabis-leaves-turning-yellow`
- `/guides/cannabis-leaf-spots-lesions`
- `/guides/cannabis-burnt-crispy-leaf-tips`

They shipped **with** `src/test/symptom-guide-static-safety.test.ts` (45 lines at
`cb98fe4e4`), which fences the safety-critical behavior rather than trusting review:
it asserts no `action_queue` / `sensor_readings` insert on the Quick Log seam
(`expect(QUICK_LOG).not.toMatch(/from\(["'](?:action_queue|sensor_readings)["']\).*insert/s)`),
no `service_role` and no device control
(`expect(QUICK_LOG).not.toMatch(/service_role|device.?control/i)`), a plant-identity
recheck before the persistence seam, a pure 14-day past-only scope-aware Timeline
evidence path, and that every canonical symptom route is published.

This is the pattern to preserve for future content families: a new public page family
lands with a static safety fence in the same commit.

### Structured-data blocker resolution

The long-standing `route_runtime_structured_data: FAIL` blocker — rendered JSON-LD not
matching build-time route documents — was fixed by
[PR #624](https://github.com/Verdant-OS/verdant-grow-diary/pull/624), merged as
`b62aac5d4` ("fix(seo): remove duplicate guide JSON-LD after hydration", 2026-07-31),
verified as an ancestor of `cb98fe4e4`. It was production-verified 2026-08-02.

**Record it as `FIXED BUT UNVERIFIED`, not `PASS`.** The production verification predates
the TanStack router migration, which changed how routes mount and hydrate — the exact
mechanism the fix addresses. The 2026-08-02 observation is therefore not evidence about
the current router. It is equally not evidence of breakage, so `FAIL` is also wrong.
Re-verification against the post-migration router is an open, unowned item.

---

## Latest deploy-head validation

**This section's evidence is pinned to deploy commit `5611b130e81a` and is NOT valid for
the current tip `cb98fe4e4`.** It is retained because two of its findings are unresolved
and must not be lost. No equivalent full validation has been recorded for `cb98fe4e4`;
that axis is `NOT_MEASURED`, not inherited-green.

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

**Carried forward unconverted:** `Required core schema present` (`FAIL`, run
`31021832568`) and `Required money-critical migrations present` (`FAIL`, run
`31021837013`) remain outside the replay-repair and Mode A SEO slices (board item #561).
They are not converted to passes, they prevent describing the deploy branch as fully
green, and they require their own scoped owner/integration follow-up. Whether they still
fail at `cb98fe4e4` has not been measured.

The tip has advanced through `acad6cb938e5` (#727), `864eab892` (#725), `1ae1677645a0`
(#729), `1a2df78ac3` (#735), `6c78266edb7f` (#737), and onward to `cb98fe4e4`. The
Branch topology row names its own verification snapshot and is decoupled from this
section's evidence. Notably, the full enabled Security DB Local run cited above
(`31021835479`) executed against `5611b130e81a` and is the replay-repair proof point
regardless of tip movement.

---

## Current approved slices

**Parent program:** MODE A SEO measurement-readiness work.

**Active SEO-evidence slice:** `P2 LIGHTING_GUIDE_CTA_ATTRIBUTION_CONTRACT` in PR #679,
with status `DOCUMENTED_MISSING_NO_EVENT_ADDED`. It records the guide CTA as
`MISSING`/`NOT_MEASURED`; it does not authorize a new event or runtime instrumentation.

**Mandatory governance handoff (this branch):** Refresh stale operating-state facts, align
the permanent `SKIPPED` status vocabulary, and correct the signed-out root-route runbook
description across the canonical constitution and its mirrors/role prompts. This is
docs/governance reconciliation only; it does not change the approved product or analytics
implementation scope.

**Handoff status as of 2026-08-07:**

| Item                                                  | Status                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh stale operating-state facts                   | `PASS` — this revision                                                                                                                                                                      |
| Align the permanent `SKIPPED` status vocabulary       | `NOT_APPLICABLE` on this branch — `AGENTS.md` at `cb98fe4e4` already carries the `SKIPPED` row in its Status Vocabulary table. Residual drift is on `main` (Sentinel-Version 2026-08-01.2). |
| Correct the signed-out root-route runbook description | `NOT_APPLICABLE` on this branch — `AGENTS.md` at `cb98fe4e4` already reads "Signed-out `/` renders the public landing directly through `RootEntry`". Residual drift is on `main`.           |

The two `NOT_APPLICABLE` items were verified already-satisfied on the deploy branch and
were **not** edited: the owner instruction for this slice restricted the change set to
`docs/agents/CURRENT_STATE.md` and explicitly forbade editing `AGENTS.md`. Reconciling
`main` to the deploy branch's governance canon is a separate, unowned slice.

In scope:

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

---

## Authorized measurement datasets — provenance

**Correction (2026-08-07).** Earlier operating state described an owner-supplied Semrush
US lighting snapshot as "the only authorized keyword dataset". That claim is stale. The
deploy branch carries **three** provenance-carrying datasets. None is invented; each names
its source.

| Dataset                                    | Location                                                     | Provenance                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Semrush US **lighting** snapshot           | `docs/seo/content-taxonomy.md:5`                             | Owner-supplied; itemized volume + KD per term                                                                                   |
| Semrush US **grower/brand** snapshot       | `docs/seo/verdant-30-day-grower-keyword-content-plan.md:5`   | Owner-supplied, explicitly dated **2026-07-15**; a distinct dataset from the lighting snapshot                                  |
| **Lovable first-party analytics** snapshot | `docs/growth/verdant-60-day-growth-execution-calendar.md:35` | First-party, window **2026-06-18 → 2026-07-19**: 372 visitors, 1,174 pageviews, 3.16 pages/visit, 193 s avg session, 72% bounce |

The scoping language in `docs/seo/content-taxonomy.md` ("the only current keyword dataset
**in this sprint**") is accurate within its own lighting sprint. It must not be quoted as a
statement about all authorized measurement data.

Read the Lovable snapshot with its own recorded caveats: 344 of 372 visits are Direct
(~92%), attribution is "not yet clean enough for scaling decisions", and traffic is
test-skewed (338 pageviews on 2026-07-16, 138 on 2026-07-18). Founder, QA, preview,
crawler, and automation traffic must be separated before it is used as a growth baseline.
It is a first-party snapshot, not an authenticated GA4/GSC baseline, and it does not
unblock Day 0.

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
   **Still healthy 2026-08-07:** the production stamp reads `commitSource: "git"`,
   `dirty: false` for `ae3c0f75ebaf`.
7. **NEW — Evidence-artifact integrity. Owner: Cheek.** `BLOCKED`.
   [PR #697](https://github.com/Verdant-OS/verdant-grow-diary/pull/697) (`355c3e362`,
   "fix(analytics): restore route and SEO release contracts", 2026-08-04) rewrote
   `artifacts/seo/seo-readiness-status.json`, changing `measurement_id`
   `G-B3QRSZEM9S` → `G-MCXQ9GVS5H` on both occurrences. Verified via
   `git show 355c3e362 -- artifacts/seo/seo-readiness-status.json`: the diff is
   **exactly `2 insertions(+), 2 deletions(-)` — both `measurement_id` lines and nothing
   else.** The surrounding attestation was left untouched, so the artifact now makes
   claims its own evidence does not support:
   - `audited_release_head` still reads `a20776993bd606f07977674934864b888a407e1c`, and
     `a20776993` **demonstrably shipped `G-B3QRSZEM9S`** — including in the runtime files
     `index.html` and `src/constants/analytics.ts` (`git grep -l "B3QRSZEM9S" a20776993`).
     The artifact therefore attests that a release which shipped the old ID matches the
     new ID.
   - `stream_identity_evidence` still reads
     `OWNER_CONFIRMED_VALUES_MATCH_DEPLOYED_PRODUCTION_TAG`, which is now false for the
     named head.
   - `artifact_revision` was **not** updated: it still reads `revised_at`
     `2026-08-02T08:07:28.792Z` with scope
     `POST_DEPLOY_ANALYTICS_RECHECK_PROVENANCE_CORRECTION_ONLY` — two days _before_ the
     2026-08-04 rewrite. The artifact does not record that it was edited.
   - `stream_id` `15065867361` is unchanged while `measurement_id` changed. **A GA4 data
     stream has exactly one measurement ID.** Therefore either `stream_id` or
     `measurement_id` is wrong. This pairing is asserted in
     `docs/seo/analytics-owner-setup-checklist.md:46` — the document the owner is being
     asked to act on — as owner-confirmed. One of those two values must be corrected at
     source before the checklist is actioned.

   Consequence recorded above: `stream_identity_status` is downgraded `PASS` → `BLOCKED`,
   because the artifact attests to a superseded measurement ID. What would unblock it:
   the owner confirms, from the GA4 property itself, the true `(stream_id,
measurement_id)` pair; the artifact is then regenerated against a re-audited release
   head with `artifact_revision` correctly stamped.

   **Do not resolve this by editing the artifact's `audited_release_head` to match.** That
   would launder the same defect a second time. The artifact is an evidence record; it is
   regenerated from a real audit or it is marked stale.

8. **Readiness artifact is stale.** `artifacts/seo/seo-readiness-status.json` was
   generated `2026-08-02T05:19:48.245Z` against `a20776993`, which is **310 commits**
   behind the deploy tip (`git rev-list --count a20776993..cb98fe4e4`). The artifact
   self-declares `"production_or_analytics_reverification_performed": false`. Treat every
   value in it as a 2026-08-02 point-in-time snapshot, never as current production state.

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

No new content family, automation, device control, schema change, or direct production
write is approved by this state file.

---

## Unrelated work — closed

**PR #616 (Skill Runtime v1 Build 7, evaluation harness) is MERGED, not in flight.**
Merged as `1109c3620` ("Build 7: Skill Evaluation Harness and Promotion Pipeline (Gate A
remains open)", 2026-08-01).

**Name the ref:** `1109c3620` is an ancestor of `origin/main`. It is **not** an ancestor of
the deploy branch `cb98fe4e4` (`git merge-base --is-ancestor` returns false). Do not
describe Build 7 as shipped to production on the strength of its merge. Its own subject
line records that Gate A remains open. This is internal AI-skill infrastructure and does
not touch public content, SEO, or the routes above.

---

## Agents currently assigned

| Agent             | Assignment                                                 |
| ----------------- | ---------------------------------------------------------- |
| Codex             | Standing SEO measurement readiness and analytics integrity |
| Claude            | Unassigned — governance handoff delivered 2026-08-07       |
| Grok              | Unassigned                                                 |
| Security reviewer | Unassigned                                                 |
| Gemini            | Unassigned                                                 |
| Council Chair     | Unassigned                                                 |
