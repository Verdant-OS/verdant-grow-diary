# Verdant — Current Operating State

**Last updated:** 2026-08-13 UTC
**Updated by:** Claude (records Cheek's 2026-08-13 in-session approval of the
named isolated Convex component sandbox spike, plus the deploy-branch HEAD
observed while writing that spec. Public-surface, GA4, and release-identity
rows retain their earlier verification dates; none were re-measured in this
update)

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                                                |
| -------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `6434ea2a8` (#942), verified 2026-08-13 with `git rev-parse HEAD` on this checkout (this session did not re-fetch; treat as the local tracking ref). Prior CURRENT_STATE snapshot was `1a9082bb1` (#885) on 2026-08-11 — the queue has advanced; do not carry older validation tables forward |
| `main`               | Integration branch. It is not production parity. | `b6d747941948ce68157185a2b0847acea6970d44` (#779), verified 2026-08-07                                                                       |

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

| Agent             | Assignment                                                            |
| ----------------- | --------------------------------------------------------------------- |
| Codex             | Standing SEO measurement readiness and analytics integrity. Queued after the Convex spec merges: Phase 1 of `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` only (see `docs/specs/convex-component-physical-sandbox-spike.md`). Do not start Convex work if it collides with an in-flight SEO slice |
| Claude            | `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` specification (docs-only). Not implementation. Prior completed out-of-slice work (#586/#809/#812/#885) unchanged |
| Grok              | Unassigned. Prior same-session HOLD on unapproved Convex expansion is superseded only for this named isolated spike; production Convex remains HOLD |
| Security reviewer | Unassigned until Phase 1 spike code exists; then review before any Convex cloud credential |
| Gemini            | Unassigned                                                            |
| Council Chair     | Unassigned until Phase 1 proof tests exist; then compare Convex sandbox vs a possible Postgres-roles alternative (out of this slice) |
