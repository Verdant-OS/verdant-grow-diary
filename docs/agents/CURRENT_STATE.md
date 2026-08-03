# Verdant — Current Operating State

**Last updated:** 2026-08-03 UTC / 2026-08-03 America/Chicago  
**Updated by:** Grok Build (merge hygiene + #699 train)

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

---

## Branch topology

| Branch               | Role                                             | Verified head                                               |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `069636b6f58b9122bd57241efca897518967d400`                  |
| `main`               | Integration branch. It is not production parity. | `ecc9ae4b95dcf34163d33465bc442566b359f8e2` at this snapshot |

`main` and `verdant-grow-diary` are divergent. Do not infer production behavior from
`main`, and do not backport deploy-only governance or data rules without a scoped branch
integration task.

The deploy-branch governance integration is complete in PR #626, and reconciliation PR
#635 is merged. The current bounded Mode A readiness-evidence PR is
[PR #679](https://github.com/Verdant-OS/verdant-grow-diary/pull/679)
(`codex/seo-readiness-evidence-20260802`, head
`d91f17bd30a02d58b4487a2e0059510923aaa835`), targeting deploy head `a20776993bd6`.
It changes readiness evidence, artifacts, and tests only; it is **not** deployment evidence.

---


---

## Recent merge commit hashes (exact)

| PR | Title | Base | Merge commit (full SHA) | Merged at (UTC) |
| -- | ----- | ---- | ----------------------- | --------------- |
| [#681](https://github.com/Verdant-OS/verdant-grow-diary/pull/681) | docs(agents): refresh current operating state | `verdant-grow-diary` | `dd3b47570458c4afbaf6c2ae2736fccbefb7fedc` | 2026-08-03T22:55:11Z |
| [#701](https://github.com/Verdant-OS/verdant-grow-diary/pull/701) | docs(skill): CI contract hygiene (PR #630 lessons) | `main` | `ecc9ae4b95dcf34163d33465bc442566b359f8e2` | 2026-08-03T23:07:46Z |

Closed without merge: **#634** (superseded by #701), **#688** / **#689** (SNC obsolete; base has `"strict": true`).

Active (no merge SHA yet): **#699** head `2fac5c65506a6db79ec22af0b88521b4b5eb235b`; stack **#702** (#691→#692) parked until green.

## Production status

Verified directly on 2026-08-02:

| Axis                                        | Status                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200                                                                        |
| Production commit                           | `a20776993bd606f07977674934864b888a407e1c`                                             |
| Production build time                       | `2026-08-02T01:28:54.548Z`                                                            |
| Public sitemap                              | `PASS` — HTTP 200, 51 `<loc>` entries                                                  |
| robots.txt                                  | `PASS` — HTTP 200, production sitemap declared; neither lighting route is disallowed    |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified           |
| GA4 explicit lighting-page identity         | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted       |
| GA4 page-view singleton contract            | `FAIL` — five automatic tag-generated events observed beside explicit application events |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                             |
| GSC authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                             |
| Measurement Day 0                           | `UNSET`                                                                                |
| Four-week measurement clock                 | `NOT_STARTED`                                                                          |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

---

## Latest deploy-head validation

GitHub Actions observed for deploy head `a20776993bd6`:

| Check                                      | Status | Evidence                                                                      |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| CI                                         | `PASS` | run `30727090143`                                                           |
| Full Vitest Suite (PR gate)                | `PASS` | run `30727090122`                                                           |
| Typecheck (tsgo) + build                   | `PASS` | run `30727090114`                                                           |
| Security regression                        | `PASS` | run `30727090134`                                                           |
| Security DB Local                          | `PASS` | run `30727090125`                                                           |
| Dependency & Security CI                   | `PASS` | run `30727090124`                                                           |
| Core Link and Form Census                  | `PASS` | run `30727090132`                                                           |
| SEO Monitoring                             | `PASS` | run `30727208474`; GSC operation `SKIPPED`, access status `BLOCKED`      |
| Required core schema present               | `FAIL` | run `30727090135`                                                           |
| Required money-critical migrations present | `FAIL` | run `30727090159`                                                           |

The two failing schema/migration guards remain outside the Mode A SEO evidence and
governance slices. They are not converted to passes and prevent describing the deploy
branch as fully green; they require their own scoped owner/integration follow-up.

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
