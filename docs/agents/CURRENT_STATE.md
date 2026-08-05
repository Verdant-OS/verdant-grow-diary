# Verdant — Current Operating State

**Last updated:** 2026-08-05 UTC / 2026-08-05 America/Chicago
**Updated by:** Claude (replay-fix reconciliation; SEO/analytics facts below retain
their 2026-08-02 verification dates and were not re-measured)

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                      |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `1ae1677645a0` (#729) at this snapshot; the queue advances it several times daily — re-verify before relying on it |
| `main`               | Integration branch. It is not production parity. | `ecc9ae4b95dcf34163d33465bc442566b359f8e2` at this snapshot                                                        |

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

SEO/analytics axes verified directly on 2026-08-02; release identity re-verified
2026-08-05:

| Axis                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200 (re-verified 2026-08-05)                                                                                                                                                                                                                                                                                                                                                                   |
| Production commit                           | `PASS` with incident — re-verified 2026-08-05T16:11Z (`Cache-Control: no-store`): production serves real SHA `acad6cb938e5` (`ref: "__orphan__"`, `ciRunId: null`). The earlier 15:47:45Z build of the same day stamped `commit: "unknown"` (history-less publish sandbox; root-caused and made non-blinding — see blocker 6), so the failure mode is intermittent and single observations are point-in-time |
| Production build time                       | `2026-08-05T15:52:18.996Z` at the 16:11Z re-verification; two publishes occurred within ~5 minutes that day (15:47:45Z degraded, 15:52:18Z healthy)                                                                                                                                                                                                                                                          |
| Public sitemap                              | `PASS` — HTTP 200, 51 `<loc>` entries                                                                                                                                                                                                                                                                                                                                                                        |
| robots.txt                                  | `PASS` — HTTP 200, production sitemap declared; neither lighting route is disallowed                                                                                                                                                                                                                                                                                                                         |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified                                                                                                                                                                                                                                                                                                                                |
| GA4 explicit lighting-page identity         | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted                                                                                                                                                                                                                                                                                                                            |
| GA4 page-view singleton contract            | `FAIL` — five automatic tag-generated events observed beside explicit application events                                                                                                                                                                                                                                                                                                                     |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                 |
| GSC authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                 |
| Measurement Day 0                           | `UNSET`                                                                                                                                                                                                                                                                                                                                                                                                      |
| Four-week measurement clock                 | `NOT_STARTED`                                                                                                                                                                                                                                                                                                                                                                                                |

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
`acad6cb938e5` (#727), `864eab892` (#725), and `1ae1677645a0` (#729 — the commit the
Branch topology row above names); push-run evidence for those heads is not recorded
here. Notably, the full enabled Security DB Local run cited above (`31021835479`)
executed against `5611b130e81a` and is the replay-repair proof point regardless of
tip movement.

The two failing schema/migration guards remain outside the replay-repair and Mode A SEO
slices (board item #561). They are not converted to passes and prevent describing the
deploy branch as fully green; they require their own scoped owner/integration follow-up.

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
6. Production release-identity resilience (revised 2026-08-05 after root-cause):
   the 15:47:45Z production build stamped `commit: "unknown"` because Lovable's
   publish sandbox was a history-less snapshot (unborn-HEAD `git init`, no
   `GITHUB_*` env — proven by fallback-semantics analysis and reproduced in a
   sandbox). Production **self-healed** at 15:52:18Z: a second publish now serves
   real SHA `acad6cb938e5` (`ref: "__orphan__"`, `dirty: false`, `ciRunId: null`;
   verified 16:11Z with `Cache-Control: no-store`). The failure mode is therefore
   intermittent and will recur. Repo-side resilience shipped in the
   version-stamp-resilience slice: stamps always carry a deterministic `treeHash`
   content identity, degraded builds use `+<date>.t<hash>` versions instead of
   `unknown-dirty`, release tags record treeHash → commit
   (`scripts/resolve-release-provenance.mjs` maps back). Remaining owner items:
   publish production from a commit containing the resilient stamper, and
   optionally raise the history-less publish sandbox with Lovable.

No new content family, automation, device control, schema change, or direct production
write is approved by this state file.

---

## Agents currently assigned

| Agent             | Assignment                                                 |
| ----------------- | ---------------------------------------------------------- |
| Codex             | Standing SEO measurement readiness and analytics integrity |
| Claude            | Unassigned                                                 |
| Grok              | Unassigned                                                 |
| Security reviewer | Unassigned                                                 |
| Gemini            | Unassigned                                                 |
| Council Chair     | Unassigned                                                 |
