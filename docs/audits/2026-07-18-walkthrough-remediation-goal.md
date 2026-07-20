# GOAL: Verdant Grow Diary — Trust Remediation to Production-Promotion Gate

**Prepared for:** ChatGPT/Codex (implementation owner)
**Prepared by:** Claude Code (verification owner), from the 2026-07-18 live walkthrough report
**Repo:** Verdant-OS/verdant-grow-diary · **Live:** https://verdantgrowdiary.com
**Status of this document:** goal charter — measurable outcomes only; Claude's file-level P0/P1 remediation map follows separately.

---

## 1. Mission

Lift the "hold broad production promotion" verdict by driving every P0 and P1 walkthrough finding to a measurably fixed state, verified by automated regression tests in CI plus one clean re-walkthrough, without weakening Verdant's safety philosophy (approval-required Action Queue, no device control, cautious AI language, sensor-truth honesty).

**The goal is complete when every outcome in §4 reports GREEN and the §5 gate checklist passes.**

---

## 2. Ground truth and constraints (read before architecture work)

1. **Branch topology:** the live app deploys from branch `verdant-grow-diary` (repo default). `main` is a separate hardening lineage (~25 commits) that is NOT deployed — it already contains Quick Log v2 target hardening (#257–#259), MCP sensor snapshot + stale-trust-vocabulary fixes (#255), and the MCP server port (#253). **Port or reconcile — do not re-invent — anything already solved there.**
2. **Post-audit fixes may already cover parts of P0 sensor truth:** #294 (diagnostics out of sensor truth), #295 (mobile grow workflows), #296 (ECOWITT live provenance boundary) landed on the deploy branch during/after the walkthrough. Verify current behavior before implementing.
3. **Stage vocabulary landmine:** plant-level stages use `cure`; the grow-level canonical STAGES list uses `drying`. Every plant→grow-stage comparison must alias `cure→drying`. Stage-gated harvest tooling built without this alias will misfire.
4. **Sensor vocabulary is already canonical:** source labels `live | manual | csv | demo` with `stale/invalid` states exist in the codebase. Extend with an explicit quality axis if needed, but **reuse the existing enum names**; do not introduce a parallel vocabulary. Get enum names right before any live migration.
5. **Static-safety scanners:** CI bans control vocabulary (including bare "mqtt") within ±60 characters of `pi_bridge` references in `src`; MCP tool titles/descriptions are locked by a drift test across all mirrors. Copy changes near these surfaces must respect both.
6. **Entitlement lane is FROZEN pending Matt's decision:** a 2026-07-16 push reversed the entitlement canonical direction, removed a fail-closed channel, and backfilled an unverified `environment='live'` founder row. Fix Founder/Pro *capability gating* (§4 WS3), but do **not** restructure the entitlement lane, provenance rules, or the backfilled row without Matt's explicit sign-off. `PAYMENTS_ENVIRONMENT=live` is an ops task (Matt), not code.
7. **RLS asymmetry:** operator accounts can read `diary_entries`/`plants` but not `grows`/`tents`/`sensor_readings`. Any external or operator-facing read surface needs ownership guards; the EcoWitt audit link fix must respect this.
8. **Process:** all changes land via PRs on `codex/*` (or `agent/*`) branches. Claude reviews every slice PR before merge (§4 WS7). Existing contract tests and smoke audits must stay green.

---

## 3. Ownership

| Owner | Work |
|---|---|
| Codex | Architecture, core scope model, implementation, integration, final verification |
| Claude | Independent audit, file-level remediation map, test scenarios, sensor-truth rule review, cultivation/content review, entitlement contract-test coverage, per-PR code review |
| Both | Compare findings at each phase boundary; sign off jointly on §5 gate |
| Matt (human) | Entitlement-lane decision (§2.6), `PAYMENTS_ENVIRONMENT` ops change, production promotion call |

---

## 4. Measurable outcomes

Every outcome states: **Metric → Verification method → Exit criterion.** An outcome is GREEN only when its verification is automated in CI (unless marked walkthrough-only) and passing.

### WS1 — Trust patch (P0)

**T1. Quick Log target integrity**
- Metric: % of Quick Log entry points (dashboard deep link, tent, plant, Daily Check, timeline) that open with the exact route-specified target preselected; count of save paths where payload target can differ from displayed target.
- Verification: route-contract Playwright suite enumerating every entry point; unit test asserting save payload target === displayed target; server-side hierarchy validation test (cross-grow plant/tent combinations fail closed with a visible error).
- Exit: 100% of entry points targeted correctly; 0 divergent save paths; fail-closed test green.

**T2. Manual sensor entry target sync**
- Metric: count of code paths where the Sensors-page selected tent and the manual form's save target derive from different state.
- Verification: single canonical selected-tent state asserted by unit test; Playwright test switches tents and asserts both the form's displayed target and the submitted payload.
- Exit: 1 canonical state, 0 divergent paths; displayed target string is present in the save payload and asserted equal.

**T3. Sensor quality honesty (blank/incomplete)**
- Metric: state label produced by each input class in the fixture matrix: blank, partial, non-numeric, impossible value, stale timestamp, unit-mismatched.
- Verification: table-driven unit tests mapping every fixture row to its exact expected state (`incomplete`/`missing`/`invalid`/`stale`); rendering test asserting none of these states can produce "Usable", "Live", "OK", or on-target presentation.
- Exit: full matrix passes; the string "Usable current reading" (or successor copy) is only reachable with ≥1 validated metric.

**T4. Source vs freshness separation ("Live" badge)**
- Metric: conditions required for "Current live" presentation.
- Verification: unit tests asserting `source=live` AND `quality=ok` AND age within the tent's freshness window are all required (three-factor); chart/summary-count rendering tests with stale fixtures; regression fixtures for 0% and 100% RH/moisture producing a suspicious/sensor-review state, never cultivation advice.
- Exit: three-factor rule enforced at every "Live" render site (audit count of render sites documented); 0/100 extremes never render healthy; #294/#296 behavior confirmed and covered by tests rather than assumed.

**T5. Stage-gated harvest tooling**
- Metric: number of harvest-related UI elements (Harvest Watch, harvest window, trichome/pistil checklists, Harvest quick action) reachable for plants in seedling/veg stages.
- Verification: stage-gating unit tests including `cure→drying` alias cases and flower-without-flower-start (shows missing-context, not a countdown); Playwright seedling fixture asserts 0 harvest elements; autoflower fixture receives no transplant/high-stress advice.
- Exit: 0 harvest elements below flowering stage; gating logic lives in one pure, tested rule module.

### WS2 — Broken destinations patch (P1)

**T6. Internal link integrity**
- Metric: count of rendered internal links that 404, no-op, drop query scope, or dead-end on authorization; each of the 7 walkthrough-identified destinations individually.
- Verification: a route-inventory test that renders nav/link sources and asserts each href resolves to a real route; dedicated regression tests for: `/dashboard?growId` (resolves with grow scope), `/logs?growId→/timeline` (growId preserved), Plant Detail "Add quick log" (opens dialog with plant preselected), Pheno demo (deterministic read-only fixture loads, or card removed), public Customer Mode links (removed + routes noindexed until publishing is real), EcoWitt audit link (hidden without capability, honoring §2.7), Daily Check "Add Manual Snapshot" (reaches the form with target, or disabled with reason).
- Exit: 0 broken/no-op/scope-dropping links; all 7 named regressions green.

**T7. Redirect scope preservation**
- Metric: % of redirects that preserve `growId`, `tentId`, `plantId` query params.
- Verification: unit tests on every declared redirect.
- Exit: 100%.

**T8. VPD calculator unit conversion**
- Metric: value shown after °F→°C toggle for 78°F.
- Verification: unit test asserting 78°F → 25.6°C (±0.1) with bounds updated consistently; boundary-value tests both directions.
- Exit: conversion preserves physical value; no native-validation error state from a previously valid input.

### WS3 — Entitlement patch (P1) — *within §2.6 freeze*

**T9. Capability matrix**
- Metric: pass rate of a capability contract matrix: plans {Free, Pro monthly, Pro annual, Founder, expired, canceled, staff-override} × surfaces {diary reports, environment summaries, advanced timeline filters, AI credits, every other Pro-gated route/API}.
- Verification: one shared capability resolver exercised by client tests AND server (edge function) contract tests from the same matrix definition; client cannot set identity/plan/credit weight/model tier (negative tests).
- Exit: full matrix green on client and server; Founder = Pro-like access + capped AI credits; 0 occurrences of "plan cannot be verified" for a valid Founder row in the matrix run.

**T10. Fail-state honesty**
- Metric: behavior when no billing row matches.
- Verification: contract test asserting unresolved plan → Free (fail-closed) with honest UI copy, never a broken paywall on a paid account.
- Exit: fail-closed test green; any change to lane/provenance semantics carries Matt's recorded sign-off in the PR description.

### WS4 — Mobile patch (P1)

**T11. Zero horizontal overflow**
- Metric: `document.scrollingElement.scrollWidth − clientWidth` on Dashboard, Plants, Plant Detail, Quick Log at 320/360/375/390/430 px.
- Verification: Playwright viewport scan asserting overflow = 0 px on every page×width combination; fixed controls (FAB/nav) never overlap content or safe areas (bounding-box assertions).
- Exit: 0 px overflow on all combinations, in CI.

**T12. Plant Detail de-duplication and budget**
- Metric: mount count of Harvest Watch, Harvest Evidence Report, and AI readiness panels; total page height at 375 px.
- Verification: DOM assertions — each concern renders exactly once; four-tab structure (Overview/Timeline/Environment/AI Review) with per-tab height budget ≤ 4,000 px at 375 px for fixture data.
- Exit: exactly 1 mount per concern; all tabs within budget (down from >17,000 px single page).

**T13. Ten-second decision brief**
- Metric: presence of the five answers (scope, needs-attention, evidence freshness, what changed, next action) within the first mobile viewport (375×812) without scrolling.
- Verification: Playwright first-viewport assertion on the redesigned dashboard.
- Exit: all five elements present above the fold.

### WS5 — Core-loop consolidation

**T14. Canonical scope**
- Metric: % of authenticated screens carrying the canonical scope bar; % of writes where payload scope ≠ visible scope is possible.
- Verification: shared scope-bar component asserted on every authenticated route; server hierarchy validation on every write path; "blank never silently means active grow" — placeholder-vs-loading states distinguished by test (T16).
- Exit: 100% coverage; 0 divergent write paths; Unassigned plants/tents appear as explicit first-class filters and counts reconcile (account total = grow-associated + unassigned) by server-side test.

**T15. One timeline, one event model**
- Metric: number of distinct event-history views/models rendering on Plant Detail and Timeline.
- Verification: single typed event model (grow/tent/plant ids, type, note, occurred/created time, source+quality, links, author, optional Better/Same/Worse outcome) with adapter tests from legacy records; duplicate "memory" panels removed.
- Exit: 1 event model, 1 timeline surface (scoped by query params, canonical route `/timeline?growId&tentId&plantId`).

**T16. Loading-state honesty**
- Metric: count of empty-state renders before query resolution ("No real tents yet" flash).
- Verification: tests assert loading skeleton until resolution; empty state only on confirmed-empty.
- Exit: 0 premature empty states on Tents, Grows, Action pages.

**T17. Auditable alerts**
- Metric: % of alert cards showing scope (grow/tent/plant), actual vs target, captured age, source, quality; duplicate-alert incident collapse.
- Verification: alert card component test with the walkthrough's example shape; fingerprint (tent/metric/window) dedupe unit test — repeated readings update one incident with a count.
- Exit: 100% of cards complete; duplicates collapse; alert detail includes trend, duration, target source, and what-not-to-do guidance.

### WS6 — Cultivation content (Claude reviews, Codex implements)

**T18. Content safety checklist**
- Metric: item-by-item pass of the cultivation review: no harvest readiness below flowering; no universal "reduce water as buds mature" (irrigation advice conditioned on medium/container/dryback); runoff pH qualified by medium, never auto-triggering correction; no generic high-P/K framing; corrective leaching vs pre-harvest flush language separated; 0/100 extremes → sensor diagnostics, not advice; AI reviews request the missing variables that matter (medium, pot size, irrigation, cultivar, stage/flip date, EC/pH, changes, pests, sensor age); "Diagnose photo" renamed to context-review language; AI call preview shows target context + credit cost before spending.
- Verification: Claude produces the content audit with file:line citations; each item resolved in code and re-reviewed by Claude; string-level regression tests for renamed CTAs and safety copy where scanners permit (§2.5).
- Exit: every checklist item pass; Claude sign-off recorded on the PR.

### WS7 — Process outcomes (both agents)

**T19. Review coverage**
- Metric: % of remediation slice PRs receiving a Claude review before merge.
- Verification: PR timeline (review submitted before merge event).
- Exit: 100%.

**T20. Phase-boundary reconciliation**
- Metric: a findings-comparison note at the end of each §6 phase (what Codex believes fixed vs what Claude's independent verification shows).
- Verification: note linked in the phase's closing PR.
- Exit: one per phase, discrepancies resolved or ticketed before the next phase starts.

**T21. No regression**
- Metric: status of existing suites — CI (lint/typecheck/test/build), 8 test shards, One-Tent Loop smoke audit, static-safety scanners, MCP drift/contract tests.
- Verification: CI on every PR.
- Exit: all green on every merged slice; no scanner suppressions added.

---

## 5. Definition of done (promotion-gate checklist)

1. All §4 outcomes GREEN with verification automated in CI (T13/T18 partially walkthrough-verified as noted).
2. A full re-walkthrough (public + authenticated, desktop + 375 px, same script as 2026-07-18) reports **0 P0 and 0 P1** findings.
3. Claude and Codex publish a joint phase-boundary reconciliation for the final phase with no open discrepancies.
4. Matt's decisions recorded: entitlement lane direction (§2.6), `PAYMENTS_ENVIRONMENT` ops change, and the promotion call itself.
5. Advanced modules (Pheno Hunt, Breeding, Customer Mode, agent integrations, session tooling) either behind Labs/More or individually re-justified — no public placeholder destinations remain.

---

## 6. Delivery sequence (each phase exits on its listed outcomes)

| Phase | Scope | Exit outcomes |
|---|---|---|
| 1. Trust patch | Quick Log targets, manual sensor sync, quality labels, stage gating | T1–T5 |
| 2. Broken-link patch | Routes, redirects, demo, public placeholders, VPD conversion | T6–T8 |
| 3. Entitlement patch | Capability resolver + matrix (within freeze) | T9–T10 |
| 4. Mobile patch | Overflow, Plant Detail tabs/dedupe, decision brief | T11–T13 |
| 5. Core-loop consolidation | Scope bar, unified timeline, loading honesty, alerts | T14–T17 |
| 6. Cultivation content | Guidance language and evidence gates | T18 |
| 7. Labs re-introduction | Advanced features return only after 1–6 hold | §5.5 |

Process outcomes T19–T21 apply to every phase.

---

*Claude's file-level P0/P1 remediation map (per-finding verdicts against deploy-branch code, including what #294–#296 already fixed and what exists on `main` to port) is being generated and will be delivered as the companion document to Phase 1.*
