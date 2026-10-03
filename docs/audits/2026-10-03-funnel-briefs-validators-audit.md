# Funnel and Briefs Audit 2026-10-03

**Audited by:** Claude (Knowledge Library and Product Specification Architect), peer-observation capacity
**Measured against:** `verdant-grow-diary` deploy tip **`80176ba`** (#1864)
**Measurements taken:** 2026-10-03, read-only, in a Claude Code remote session
**Independent reviewer seat:** Grok (Claude touched this audit and cannot give its PASS)

This document is a **read-only peer audit**. It changes no product code, schema, policy, migration, or
governance file, and it carries no `Sentinel-Version` (it is not one of the twelve). Status words are
used literally: PASS, FAIL, BLOCKED, NOT_MEASURED, NOT_APPLICABLE, plus HOLD, GAP and OBSERVATION where
a page needed them. It was published first as a claude.ai page and committed here, unchanged in
substance, so the independent reviewer can read it from the repository.

---
_Verdant Grow Diary · peer audit by Claude · for independent review by Grok_

# Funnel instrumentation gaps, three evidence-labeled content briefs and the SEO validator gate, audited at the deploy tip

Three deliverables from the agent prompt deck (prompts 36, 37 and 38), run against the deploy branch on 2026-10-03. Audit 38 attempted to run the validators locally and was blocked by the session's network policy; the hosted result for the same checks is reported instead. No code, content or configuration was changed, and the working tree was left clean. Claude's findings are peer observations; Grok supplies the independent verdict. Sixth page in the series; the others are linked in the footer.

- **Branch and tip:** verdant-grow-diary at `80176ba` (#1864)
- **Method:** Source reads and greps; one attempted local install and test run; hosted check runs read through the GitHub API.
- **Status vocabulary:** PASS · FAIL · GAP · BLOCKED · NOT_MEASURED · OBSERVATION
- **Legend:** UNKNOWN is used only for search volume, because prompt 37 requires that word. It means NOT_MEASURED.
- **Locks in force:** HOLD #1250, production database lock, publishing stop. Unchanged.

> **Calibrated verdict.** The funnel is complete for the email path and consent-correct, with one FAIL: Google OAuth signups never emit `signup`, so acquisition is undercounted by the OAuth share, which is NOT_MEASURED. The three briefs are ready for an evidence editor; two carry explicit “missing evidence” on their cultivation claims because the repository registers no source for them yet. The SEO validators are green on hosted CI and could not run here, a network limit of this session rather than a repository defect.

## Audit 36 · Funnel instrumentation gaps

> **Prompt.** Review AnalyticsShell and FunnelEventDbSink ordering ahead of Outlet in src/routes/__root.tsx and the funnel sanitizer spec. List the events emitted on signup, first grow, first Quick Log, first AI Doctor call and upgrade. Name each gap that makes signup-to-paid conversion unmeasurable and the consent state each event respects.

| Check | Status | Evidence |
| --- | --- | --- |
| Provider order in the root | **PASS** | `AnalyticsShell` and `FunnelEventDbSink` render before `Outlet` (`src/routes/__root.tsx:254-256`); the load-bearing comment at lines 244-253 is intact. |
| Catalogue versus emitters | **PASS** | All 30 names in `FUNNEL_EVENTS` (`src/lib/funnelAnalytics.ts:32-80`) are emitted at least once in production code; no emitter uses a name outside the list. _Superseded, see index §4 errata: the array has 29 names, and all 29 have an emitter._ |
| Signup-to-paid chain | **PASS** | signup → grow_created → tent_created → plant_created → quick_log_saved → ai_doctor_cta_clicked → ai_doctor_review_started → ai_doctor_result_received → paywall_viewed → paywall_cta_clicked → checkout_started → subscription_activated → checkout_return_completed. Each step has an emitter (Onboarding, CreateTentDialog, CreatePlantDialog, quickLogSuccessTelemetry, Plant Detail, Pricing, CheckoutSuccess). |
| Consent respected | **PASS** | gtag fires only if the consent-gated script loaded; the DB sink writes only when consent is `granted` and a user id exists, queues pre-hydration events (max bounded) rather than dropping or back-filling them, and re-sanitizes and re-schema-checks every detail because the CustomEvent boundary is untrusted (`src/lib/funnelEventDbSinkRules.ts`, `src/components/FunnelEventDbSink.tsx:66-120`). |
| Signup covers OAuth | **FAIL** | `trackFunnelEvent("signup", { method: "email" })` is the only signup emitter (`src/pages/Auth.tsx:421`). The Google OAuth path (`signInWithOAuth`, line 163) emits nothing on return. OAuth signups are invisible to the funnel. |
| Signup carries acquisition source | **GAP** | The schema allows only `method` on `signup` (`src/lib/funnelEventSchema.ts:35`). `verdant_signup_source` is written to auth metadata but never to the funnel, so attribution cannot be joined server-side. _Superseded, see index §4 errata: the source is stored server-side by migration `20260714231627`; the join is NOT_MEASURED and only the `funnel_events` gap stands._ |
| Anonymous top of funnel | **GAP** by design | The DB sink is user-scoped. Public pages reach only gtag. Covered in the previous audit page. |
| First-AI-value marker | **OBSERVATION** | `ai_doctor_result_received` exists, but nothing marks a user's first ever result; cohort questions need a server-side derivation from the credit ledger. |

### Smallest fix, as a spec

- Emit `signup` with `method: "google"` on the OAuth return path, guarded so an existing user signing in does not fire it.
- Add `source` to the `signup` schema row and populate it from the resolved acquisition source. Two call sites, one schema entry, test pins in `src/test/funnel-analytics.test.ts`.

## Audit 37 · Three evidence-labeled content briefs

> **Prompt.** Draft three briefs in the style of docs/seo/content-briefs that open with a VPD, watering or sensor-truth question and end in a Quick Log or VPD calculator call to action. Label every horticultural claim with its source tier, keep the cautious ordering, and make no yield, miracle or one-photo-diagnosis claims. Report search volume as UNKNOWN.

Format follows `docs/seo/content-briefs/autoflower-light-schedule-and-grow-log.md`. Search volume is UNKNOWN for all three; no number is quoted. Risk classes and source tiers follow `docs/knowledge-library/content-standards.md`. None duplicates an existing guide slug. Implementation status for each: brief only, deliberately not routed.

### Brief 1 · Leaf temperature and VPD: when the air number is not the plant number

| Field | Detail |
| --- | --- |
| Slug | `leaf-temperature-and-vpd-offset` |
| Primary intent | leaf VPD vs air VPD. Secondary: leaf temperature offset, infrared thermometer for plants. |
| Audience | Growers who already track VPD and see a number that disagrees with the plant. |
| Problem | Calculators apply a guessed leaf offset, or none, and call the result leaf VPD. |
| Verdant angle | Verdant labels a result air VPD unless a measured leaf temperature exists; the public calculator unlocks a stage-target claim only for calibrated inputs (R0 product truth, `src/lib/publicVpdCalculatorRules.ts`). |
| Required outline | 1. The question in one line. 2. Air VPD versus leaf VPD, defined. 3. How to measure leaf temperature, with the emissivity caveat. 4. The offset is a measurement, not a constant. 5. Placement and timing of the reading. 6. When not to act on the number. 7. FAQ and CTA. |
| Evidence and labels | FAO 56 Ch. 3 Eq. 11-12 for saturation vapour pressure (Tier A, `defines_method`, R2). Chen 2015 and López 2012 on leaf emissivity under infrared thermometry (Tier A, `limits`, R2). Corredor-Perilla 2025 on humidity effects (Tier A, `supports`, R2). All from the P2 source register S1, S7a, S7b, S3. |
| Claims to avoid | Any universal offset value. Any claim that leaf VPD alone predicts yield or potency. Any instruction to change the room from one reading. |
| Links | In: grow-room-vpd-tracker, sensor-truth-grow-room, P2 pillar. Out: /tools/vpd-calculator, grow-room-vpd-tracker, sensor-truth-grow-room, Quick Log environment entry. |
| CTA | “Open the stage-aware VPD calculator and record which basis you used.” |
| Title and meta | “Leaf Temperature vs Air VPD: Measure the Offset, Don't Guess It \| Verdant”. Meta: “Why leaf VPD needs a measured leaf temperature, how to take one honestly, and how to label the result when you cannot.” |
| Schema and DoD | Article, BreadcrumbList, visible FAQPage. Evidence editor clears S1, S7a, S7b; no number offered as a default; original offset-method card; four useful links; SEO validation. |

### Brief 2 · Soil moisture grow log: turning readings into watering decisions

| Field | Detail |
| --- | --- |
| Slug | `soil-moisture-grow-log` |
| Primary intent | soil moisture grow log. Secondary: dry-back, pot weight watering, moisture meter cannabis. |
| Audience | Growers with a moisture meter or pot scale who still water on a calendar. |
| Problem | Readings are taken but not recorded against the watering, so dry-back cannot be seen. |
| Verdant angle | A watering entry with millilitres and a moisture reading beside it; readings stuck at 0 or 100 are flagged invalid, never healthy (R0, AGENTS.md sensor truth rules). |
| Required outline | 1. Why the calendar fails. 2. What one reading means and does not. 3. Pot weight versus probe versus sensor. 4. Logging the pair: reading, millilitres, time. 5. Reading dry-back over a week. 6. Medium-specific caution without a universal schedule. 7. FAQ and CTA. |
| Evidence and labels | **Missing evidence.** No Tier A or B source for substrate moisture management is registered in the repository. Every cultivation claim is R2 and stays labelled `missing evidence` until the evidence editor assigns an extension or handbook source with its role. |
| Claims to avoid | “Water every N days.” Any medium-agnostic threshold. Root-rot diagnosis from one reading. Any nutrient or irrigation change from weak evidence. |
| Links | In: plant-watering-log, daily-grow-log-checklist, what-to-log-in-a-grow-journal. Out: Quick Log watering entry, sensor-truth-grow-room, plant-watering-log, cannabis-plant-care. |
| CTA | “Log the reading and the millilitres together in Quick Log, then look at the week.” |
| Title and meta | “Soil Moisture Grow Log: Read Dry-Back, Not the Calendar \| Verdant”. Meta: “Pair each moisture reading with the watering it followed so dry-back becomes visible, without a universal schedule.” |
| Schema and DoD | Article, BreadcrumbList, FAQPage. Two independent sources per R2 claim; original dry-back worksheet; no schedule table; SEO validation. |

### Brief 3 · pH and EC grow log: writing down what your meter actually said

| Field | Detail |
| --- | --- |
| Slug | `ph-and-ec-grow-log` |
| Primary intent | pH and EC grow log. Secondary: runoff EC, meter calibration log, feed vs runoff. |
| Audience | Growers who adjust feed strength from memory and a forum number. |
| Problem | Feed EC, runoff EC and pH are measured inconsistently and compared across different methods. |
| Verdant angle | Record feed and runoff as separate values with method and calibration date; the existing nutrient-schedule guide already frames charts as something to evaluate, not follow (R0). |
| Required outline | 1. What the meter measures. 2. Calibration and temperature compensation as log fields. 3. Feed versus runoff as two numbers. 4. Medium-specific ranges stated as ranges with their source. 5. When a drift is a measurement problem. 6. What not to change on one reading. 7. FAQ and CTA. |
| Evidence and labels | Medium pH ranges may cross-reference `cannabis-nutrient-schedule` internally only. The external Tier B method source (university substrate-testing handbook, pour-through method) is **missing evidence** until the editor assigns it. All range claims are R2. |
| Claims to avoid | Brand chart endorsement or ranking. Aggressive flush advice. Nutrient changes from weak evidence. Cultivation ordering holds: environment, root zone, then nutrient moderation. |
| Links | In: cannabis-nutrient-schedule, the five brand nutrient diaries (closing their orphan status), plant-watering-log. Out: Quick Log feeding entry, cannabis-nutrient-schedule, sensor-truth-grow-room. |
| CTA | “Record feed EC, runoff EC and pH as three fields in one Quick Log feeding entry.” |
| Title and meta | “pH and EC Grow Log: Record the Method, Not Just the Number \| Verdant”. Meta: “How to log feed and runoff EC, pH and calibration so a drift can be read as measurement or plant response.” |
| Schema and DoD | Article, BreadcrumbList, FAQPage. Tier B method source cleared; original measurement-record card; no brand ranking; SEO validation. |

## Audit 38 · SEO validators as a gate

> **Prompt.** Run bun run test:legal-seo and bun run test:postbuild-seo-artifacts. For each failing validator, report the page, the rule, the exact output, and a fix as a specification. Do not whole-file-format any legacy file and do not loosen a validator to pass.

| Run | Status | Evidence |
| --- | --- | --- |
| Local `bun run test:legal-seo` and `test:postbuild-seo-artifacts` | **BLOCKED** | The container had no `node_modules`. The documented npm public-registry bootstrap failed with HTTP 403 fetching `cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, a host this session's network policy does not allow. Vitest never started (exit 127). `package-lock.json` restored; `git status` clean. |
| Hosted `test:legal-seo` | **PASS** | Required check concluded `success` at 2026-10-02 01:15:35 UTC on the head of PR 1864 (run 36949669776). |
| Hosted postbuild SEO validators | **PASS** | They run inside `bun run build` in the required `Lint, typecheck, test, build` job, `success` at 01:21:47 UTC. `sitemap parity + head fidelity` also `success`. |
| Caveat | **OBSERVATION** | Those checks ran on the PR head; the deploy tip `80176ba` is its squash commit. The ruleset accepts this. It is not a separate measurement of the tip itself. _Superseded, see index §4 errata: push run 36950533886 ran on `80176bad5c9c` itself, and it passed._ |

No validator failure exists to specify. Nothing was loosened. The bootstrap gap is an environment finding: the run skill's verified recipe assumes `cdn.sheetjs.com` is reachable, and this session's policy denies it.

## Independent review checklist for Grok

1. Confirm the OAuth signup FAIL by reading `src/pages/Auth.tsx` around lines 163 and 421 and checking nothing downstream (onboarding, auth callback) emits `signup` for the Google path.
2. Judge whether `source` on the `signup` event is privacy-safe under the sanitizer's length and whitespace rules. Claude's view: the allow-listed attribution ids are, free text is not.
3. Assign or decline the three briefs. Two need an evidence editor before any writing starts; say whether that seat exists.
4. If you have a working checkout, run `bun run test:legal-seo` and `bun run test:postbuild-seo-artifacts` at `80176ba` and record the counts. Claude could not.
5. Decide whether the run skill should document the `cdn.sheetjs.com` dependency as an environment prerequisite.
6. Record your verdict at this exact tip, `80176ba`. Claude touched this audit and cannot give it an independent PASS.

---

Prepared by Claude as peer observations on 2026-10-03 against verdant-grow-diary at 80176ba (#1864). Companion pages: [Billing Truth Audit](https://claude.ai/artifact/JvzUc1Fg1Gj72EcYqwwU3A), [Pricing Copy Audit](https://claude.ai/artifact/XjfJ5cE4SWNiZYyUoapgVx), [Checkout and Credits Audit](https://claude.ai/artifact/Qzv8sCRPdbkJyUWCL1hpc5), [Docs and Indexation Audit](https://claude.ai/artifact/9pNNDMrdSTpTQFE6hSAK1Y), [SEO Gate and Links Audit](https://claude.ai/artifact/AjWk8tsT8DxV1j8EGu4shj). Sources: src/routes/__root.tsx, src/lib/funnelAnalytics.ts, funnelEventSchema.ts, funnelEventDbSinkRules.ts, src/components/FunnelEventDbSink.tsx, src/pages/Auth.tsx, Onboarding.tsx, CheckoutSuccess.tsx, src/lib/signupAcquisitionRules.ts, docs/seo/content-briefs/, docs/knowledge-library/content-standards.md, the P2 source register, package.json scripts, .claude/skills/run-verdant-grow-diary/SKILL.md, and the GitHub check runs for PR 1864. No Publish, SQL apply, charge, role change, device control or Action Queue operation is authorized by this page.
