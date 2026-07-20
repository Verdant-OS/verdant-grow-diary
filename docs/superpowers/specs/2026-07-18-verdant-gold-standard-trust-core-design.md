# Verdant Gold Standard — Trust Core Design

**Date:** 2026-07-18

**Status:** Approved design

**Branch:** `codex/verdant-trust-core-deploy`

**Production reference:** https://verdantgrowdiary.com

## Executive summary

Verdant will become a calm, evidence-led Grow OS organized around one canonical operating loop:

```text
Grow -> Tent -> Plant -> Quick Log -> Timeline -> Sensor Snapshot
-> AI Review -> Alert -> Approval-Required Action Queue -> Outcome
```

The redesign will ship as four independently releasable phases. Phase 1 is the Trust Core: it repairs target integrity, sensor truth, stage safety, entitlement consistency, broken navigation, asynchronous state semantics, and mobile overflow without changing the database schema or Row Level Security policies.

The approved visual direction is **Field Console**: Verdant's current dark botanical identity refined into a restrained, information-dense interface with disciplined green accents, explicit scope, evidence age, sensor quality, and one primary action per screen.

This document is the executable design specification for Phase 1 and the governing product architecture for later phases. Each later phase will receive its own focused design and implementation plan before code changes begin.

## Approved product decisions

| Decision | Approved choice |
|---|---|
| Delivery strategy | Phased, independently releasable pull requests |
| Phase 1 target | Trust Core |
| Phase 1 data scope | No schema or RLS changes |
| Legacy records | Preserve and expose as Unassigned or Limited data; never infer relationships automatically |
| Visual direction | Field Console |
| Advanced features | Move under More -> Labs |
| Release boundary | Validated PR, then user and Claude review before merge |
| Branch strategy | New Codex branch from the fetched deploy trunk, `origin/verdant-grow-diary` |
| Implementation architecture | Trust-first vertical slices |

## Ground-truth delivery constraints

These constraints were added by the approved remediation charter and override
older repository assumptions:

1. `origin/verdant-grow-diary` is the implementation and deployment trunk.
   Undeployed `main` and older Claude/Codex branches are evidence sources only;
   their fixes must be ported deliberately and re-verified against the deploy
   trunk rather than assumed present.
2. Stage logic must reuse the existing stage normalizers, including the
   plant-side `cure`/`curing` to canonical `drying` alias. A raw
   `stage === "flower"` check is not an acceptable harvest fence.
3. Sensor work must reuse `CANONICAL_SENSOR_SOURCES` and the existing quality
   and freshness contracts. Phase 1 must not create a parallel source
   vocabulary.
4. The entitlement lane direction, provenance rules, and existing Founder
   backfill are frozen pending an explicit product decision. Phase 1 may make
   capability decisions consistent, but it must not redirect billing lanes or
   rewrite entitlement provenance.
5. Static-safety scanners remain authoritative. No suppression, ignore entry,
   relaxed pattern, or scanner bypass may be added to make a slice pass.
6. The remediation charter's T1-T21 outcomes are the acceptance contract.
   Slice completion does not substitute for the named verification method and
   exit criterion attached to each outcome.

## Why Trust Core comes first

The live walkthrough found defects that can cause Verdant to show or write the wrong cultivation context:

- Dashboard-to-Quick-Log handoff can lose the requested plant and show another grow or stage.
- The Sensors page can display one tent while the manual form targets another.
- Blank manual input can be described as a usable current reading.
- Stale sensor data can retain a Live-looking label, and suspicious 0% values can avoid invalid/suspicious treatment.
- Seedlings can receive Harvest Watch, harvest windows, and Harvest actions.
- Founder Lifetime can be presented as Pro-like while protected report and timeline capabilities remain paywalled.
- Primary routes can 404, discard scope parameters, resolve to the current page, or lead to unauthorized/incomplete destinations.
- Loading queries can render false empty states.
- Core mobile pages can overflow horizontally and place actions outside the viewport.

A visual redesign on top of these defects would make unsafe behavior look more trustworthy. Phase 1 repairs the truth and navigation contracts before Phase 2 reorganizes the experience.

## Governing invariants

These invariants apply to every phase:

1. **Diary first, sensors second, AI third, automation last.**
2. **No fake live data.** Source, freshness, quality, and captured time remain explicit.
3. **No blind automation or device control.** AI and alerts may suggest; the grower decides.
4. **Action Queue remains approval-required.** No auto-creation, auto-approval, or executable device payloads.
5. **A visible write target must equal the submitted write target.** Mismatches fail closed.
6. **Unknown, stale, invalid, suspicious, or incomplete evidence is never healthy or on-target.**
7. **Existing user records remain intact.** Missing relationships are visible and repairable, never guessed.
8. **Entitlements are capability-based.** Client checks are presentation-only; the server is authoritative for paid or costly features.
9. **AI uncertainty is visible.** A single photo or reading is not a diagnosis.
10. **Every behavior change is test-first and independently verifiable.**

## Phased roadmap

### Phase 1 — Trust Core

Goal: make every core handoff, sensor label, stage capability, entitlement presentation, route, and mobile surface truthful and deterministic.

Scope:

- Canonical grow/tent/plant scope resolution
- Write-target confirmation and fail-closed mismatches
- Sensor source, quality, freshness, plausibility, and reason codes
- Stage-aware activity and Harvest Watch fences
- Founder/Pro capability parity across relevant client presentation and server gates
- Broken, no-op, scope-dropping, and unauthorized route remediation
- Loading/empty/limited/error state ordering
- Mobile horizontal-overflow and fixed-action safety
- Advanced navigation moved under More -> Labs
- Regression, accessibility, route, and One-Tent browser tests

Explicitly excluded:

- Database migrations
- RLS policy changes
- New billing provider behavior
- Live-payment activation
- New device control or automation
- Broad visual replacement of every page
- Unified event-table migration
- Rebuilding Labs features

### Phase 2 — Field Console Core

Goal: redesign the daily grower experience around a single decision hierarchy.

Planned scope:

- Canonical scope bar
- Today decision brief
- Two-step, stage-aware Quick Log
- Four-tab Plant Detail: Overview, Timeline, Environment, AI Review
- One canonical Timeline route and presentation
- Responsive five-item mobile navigation
- Consistent loading, empty, limited, error, and retry components

Phase 2 will preserve the Phase 1 data and safety contracts.

### Phase 3 — Evidence Intelligence

Goal: make alerts, AI Review, reports, and Action Queue outcomes auditable and useful without overstating evidence.

Planned scope:

- Scope-rich, deduplicated alerts with actual-versus-target evidence
- AI Review instead of photo-diagnosis framing
- Approval Queue outcome follow-ups: Better, Same, Worse
- Report and entitlement consistency
- Accessibility and performance completion
- Full One-Tent Loop browser proof

### Phase 4 — Labs reintroduction

Goal: redesign and reintroduce advanced features only after their own proof gates pass.

Labs include:

- Pheno Hunt
- Breeding and lineage repair
- Customer publishing
- Agent integrations
- Advanced AI-session management

Customer publishing will not be publicly linked until authorization, publishing, revocation, and share-token behavior are implemented and tested.

## Phase 1 architecture

Phase 1 adds small pure-rule boundaries around existing pages and hooks. It does not introduce a new global store or data model.

### 1. Operating scope

The URL is the canonical source of explicit operational scope:

```ts
type OperatingScope = {
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
};
```

Resolution rules:

1. Parse supported route and query parameters.
2. Normalize empty or malformed identifiers to `null`.
3. Validate visible records and their relationships.
4. Preserve a valid explicit route target even when the remembered active grow differs.
5. Reject incompatible grow/tent/plant combinations.
6. Never broaden a scoped page to all records silently.
7. Surface missing relationships as Unassigned or Limited data.

Existing `useScopedGrow` behavior remains available, but it must consume the canonical resolution contract rather than independently choosing scope per page.

### 2. Write target

Every grower-initiated write surface derives a typed target from validated scope:

```ts
type WriteTarget = {
  growId: string;
  tentId: string | null;
  plantId: string | null;
};
```

The write target contract requires:

- The target summary above Save uses the same resolved object as the payload builder.
- Selecting a grow invalidates incompatible tent and plant selections.
- Selecting a tent invalidates incompatible plant selections.
- A plant route preselects that plant only after visible-scope validation succeeds.
- Manual sensor entry requires an explicit tent and cannot inherit a stale form target from a previously viewed tab.
- Missing or mismatched targets disable Save and return a user-facing reason code.
- No fallback silently targets the active grow, first tent, or first plant.

### 3. Sensor evidence view model

Phase 1 adapts existing database states into a two-axis presentation model:

```ts
type SensorEvidenceSource = "live" | "manual" | "csv" | "demo";

type SensorEvidenceQuality =
  | "ok"
  | "stale"
  | "invalid"
  | "unknown"
  | "incomplete";
```

The existing stored/read-model vocabulary is preserved. The view model separates where evidence came from from whether it is usable now.

Rules:

- `Current live` requires source `live`, quality `ok`, and age inside the live freshness window.
- Manual evidence is never labeled Live.
- Stale evidence remains historical evidence but cannot drive a current healthy/on-target claim.
- Blank or partial forms resolve to `incomplete`, never usable.
- Missing values resolve to `unknown` or `incomplete` according to whether the user is editing.
- Invalid units, impossible values, future timestamps, and parse failures resolve to `invalid`.
- Repeated or isolated 0/100 humidity or soil-moisture extremes resolve to a suspicious/invalid review state according to the existing validation context; they never resolve directly to healthy.
- Target comparison runs only after normalization, plausibility validation, and freshness evaluation.
- No-data VPD copy says unavailable, not outside target.

Every classification includes a stable reason code so UI copy and tests do not reverse-engineer the decision.

### 4. Cultivation capability rules

Available actions are derived from plant context in pure rules, not scattered JSX conditions.

The minimum input is:

```ts
type PlantActivityContext = {
  stage: string | null;
  flowerStartedAt: string | null;
  archived: boolean;
  merged: boolean;
  hasTent: boolean;
};
```

Rules:

- Harvest Watch requires normalized Flower stage, a valid flowering-start date, and an active non-merged plant.
- Seedling, vegetative, germination, unknown, archived, and merged plants do not receive Harvest Watch or a harvest-readiness window.
- The destructive historical action to record a harvest, if retained, is separate from harvest readiness and requires explicit confirmation.
- Quick Log primary activities are stage-aware; additional actions remain under More.
- Missing cultivation context produces an observation request, not a confident recommendation.
- Autoflower and medium-specific content remains cautious and avoids high-stress or aggressive feeding/irrigation defaults.

### 5. Entitlement consistency

`public.billing_subscriptions` remains the entitlement source of truth.

Phase 1 preserves:

- Pure capability resolution under `src/lib/entitlements/*`
- Presentation-only client hooks
- Authoritative server gates for paid/costly features
- Founder Lifetime as Pro-like access with capped AI credits
- Separate, auditable staff overrides

The defect to fix is inconsistent consumption, not a new billing architecture. Protected pages must distinguish:

- Free plan capability denial
- Inactive/expired plan resolution
- Entitlement lookup/verification failure
- Allowed Founder/Pro capability

No URL, local storage, checkout success state, or client plan label grants capability.

### 6. Canonical routes

One route builder owns grow/tent/plant query serialization. It must preserve valid scope during navigation and aliases.

Phase 1 route outcomes:

- Dashboard uses `/` as canonical and accepts supported grow scope.
- `/dashboard` either redirects to `/` while preserving scope or becomes an intentional alias; it cannot 404.
- `/logs` redirects to `/timeline` while preserving supported scope parameters.
- Plant Detail's Add quick log invokes the working target-aware Quick Log flow instead of linking to the current page.
- Daily Check's manual-snapshot action routes to the actual sensor entry anchor with preserved tent/plant context or stays disabled with an explanation.
- Operator-only routes are hidden from users without capability; they are not presented as ordinary dead-end links.
- Public placeholder Customer Mode destinations are removed from public navigation until Phase 4.
- Broken demo destinations are removed or replaced by deterministic read-only fixtures before being promoted.

The existing app route manifest becomes the regression source for internal link verification.

### 7. Asynchronous page state

Every data-backed page follows this order:

```text
Loading -> Error -> Empty -> Limited data -> Usable data
```

Rules:

- Empty UI cannot render until all queries required to establish emptiness have resolved.
- Partial query failure preserves valid content and labels unavailable sections.
- Retry is scoped to the failed query or section.
- A stale previous selection cannot appear as the current resolved target while a new query loads.
- Hydration placeholders never imply that no grow/tent/plant exists.

### 8. Responsive shell safety

Phase 1 makes the existing shell safe without completing the Phase 2 visual redesign.

Rules:

- Root application content uses `min-width: 0` and prevents page-level horizontal overflow.
- PageHeader actions stack or wrap below the title on narrow screens.
- Tab and jump-link groups use an intentional contained scroller when wrapping would harm comprehension.
- Core cards use one column on small screens.
- No action label depends on truncation to fit.
- Mobile fixed navigation reserves content space including safe-area insets.
- A floating Quick Log control cannot compete with bottom navigation or another fixed CTA.
- There is one `main` landmark and interactive controls do not appear inside heading accessible names.

Required widths: 320, 360, 375, 390, 430, 768, 1024, and 1440 pixels.

### 9. Navigation hierarchy

Primary navigation after Phase 1:

```text
Today
Tents
Plants
Timeline
Sensors
AI Review
Alerts
Actions
Reports
More
Settings
```

More contains Labs:

```text
Pheno Hunt
Breeding / Lineage
Customer publishing
Agent integrations
Advanced AI sessions
```

Moving an item to Labs changes prominence only. It does not weaken existing authorization or safety gates.

## Field Console experience contract

Phase 2 will implement the complete experience, but Phase 1 changes must be compatible with it.

### Today decision brief

The future Dashboard answers five questions in under ten seconds:

1. Which grow and tent are in scope?
2. Which plants or environmental conditions need attention now?
3. Is the evidence current, stale, invalid, or missing?
4. What changed since the previous check?
5. What is the safest next grower action or observation?

Desktop order:

```text
Scope bar
Needs attention + primary Quick Log
Environment evidence
Plants due for check
Recent changes
Pending grower approvals
```

Mobile uses the same order in one column with Today, Tents, Plants, Log, and More in bottom navigation.

### Quick Log

The future two-step Quick Log contract is:

1. Confirm target and select a stage-aware activity.
2. Record Better/Same/Worse, a short note, and progressively disclosed optional details.

Save repeats the exact target. Ten verbose action descriptions are not displayed simultaneously. Harvest is absent from primary seedling or vegetative actions.

### Plant Detail

The future Plant Detail has four tabs:

- Overview
- Timeline
- Environment
- AI Review

There is one canonical readiness panel per concern, one Harvest Watch when eligible, and no duplicated evidence report.

## Error handling and diagnostics

### User-facing errors

- Target mismatch: block Save and explain which relationship must be repaired.
- Missing target: keep the user on the current step and identify the missing selection.
- Sensor validation: identify invalid metrics without claiming the full record is healthy.
- Entitlement denial: explain the required capability without treating an expected Free state as a crash.
- Verification failure: provide Retry and do not present the failure as a confirmed paywall.
- Network write failure: preserve user input and never show a success state.
- Unauthorized operator route: hide the ordinary link; direct navigation receives a clear restricted state.

### Diagnostic reason codes

Pure rules return stable, non-sensitive reason codes. Examples include:

```text
scope.plant_outside_grow
scope.tent_outside_grow
write_target.missing_tent
write_target.visible_payload_mismatch
sensor.incomplete
sensor.stale
sensor.future_timestamp
sensor.suspicious_extreme
harvest.stage_ineligible
harvest.flower_start_missing
entitlement.verification_failed
```

Browser telemetry may record reason-code counts and route templates. It must not include user-authored notes, raw sensor payloads, plant names, IDs, tokens, AI prompts, or private environment values.

## Testing strategy

All Phase 1 behavior follows red-green-refactor. A regression test must fail for the observed defect before production code changes.

### Pure-rule tests

- Valid and invalid grow/tent/plant scope combinations
- Explicit route scope precedence over remembered active state
- Write-target invalidation when parent selection changes
- Sensor source/quality/freshness combinations
- Blank, partial, invalid-unit, impossible, future, stale, and extreme sensor inputs
- Stage normalization and Harvest Watch eligibility
- Founder, Pro, Free, inactive, expired, malformed, and lookup-error entitlement states
- Canonical route/query construction and alias preservation
- Async loading/empty/limited/error selection

### Component and integration tests

- Dashboard and Plant Detail Quick Log handoffs
- Daily Check route preselection
- Sensors tent-tab/manual-form synchronization
- No-data VPD semantics
- Founder report and advanced-filter presentation
- Add quick log behavior on Plant Detail
- Hidden/guarded operator and placeholder destinations
- Loading state before empty state
- Navigation movement into Labs
- One main landmark and clean heading accessible names

### Responsive and accessibility tests

- No page-level horizontal overflow at every required width
- Header actions, tab groups, cards, and bottom navigation remain operable
- Fixed controls do not overlap content
- Keyboard order and visible focus
- Dialog focus trap and focus restoration
- Logical heading hierarchy and named controls
- Text and non-color status communication meet WCAG 2.1 AA expectations

### Browser proof

The One-Tent browser path must verify:

```text
Grow -> Tent -> Plant -> Quick Log -> Timeline -> Sensor Snapshot
-> AI Review -> Alert -> Approval Queue
```

The smoke test stops before cost-incurring AI calls or permanent writes unless it uses the repository's disposable fixture contract. Fixture validation occurs before the first write-producing action. Grow remains optional in the current fixture validator until the actual UI contract requires it; Tent and Plant remain the hard fixture requirements.

## Validation and release gate

Each Phase 1 PR runs fresh evidence for:

```text
Targeted Vitest suites
Type-check
Changed-file ESLint
Production build
Relevant static safety guards
Full sharded Vitest suite
One-Tent Playwright smoke
Manual browser evidence review
git diff --check
```

The documented `test:security-db-local` infrastructure lane remains opt-in and non-gating under the current baseline unless a future change explicitly brings its infrastructure into scope.

Validation reporting uses:

```text
Targeted tests:
Full suite:
Type-check:
Runtime harness:
Skipped:
Introduced failures:
Pre-existing failures:
```

No result is called all-green unless every relevant check actually passed. Missing tooling or environment access is reported rather than hidden.

## Phase 1 definition of done

Phase 1 is complete only when:

1. Every Trust Core defect listed in this document has a failing-then-passing regression test.
2. Valid explicit route scope survives every core handoff.
3. Visible write targets match submitted targets or Save is blocked.
4. Missing, incomplete, stale, invalid, and suspicious evidence cannot render as current healthy telemetry.
5. Harvest readiness UI is absent for ineligible stages.
6. Founder/Pro capabilities are presented consistently with authoritative server results.
7. Core internal links do not 404, no-op, discard supported scope, or expose ordinary unauthorized dead ends.
8. False empty-state hydration flashes are removed from touched core pages.
9. Dashboard, Plant Detail, Daily Check, Sensors, and application shell have no page-level horizontal overflow at required widths.
10. Advanced features appear under More -> Labs.
11. No schema or RLS changes appear in the diff.
12. All validation results, skipped checks, safety verdict, and rollback notes are included in the PR.
13. User and Claude review the validated PR before merge.
14. Every applicable T1-T21 outcome has its named evidence attached to the PR.
15. The phase-boundary findings reconciliation records fixed, still-open,
    superseded, and newly discovered findings with no silent drops.
16. No scanner suppression or guardrail weakening appears in the diff.

## Rollback strategy

Phase 1 ships as small commits grouped by independent vertical slice. Each slice must be revertible without a schema rollback.

- Pure-rule modules are additive until their consumers switch.
- Route aliases preserve existing bookmarks while canonical builders change.
- UI gating changes preserve underlying records and writes.
- Navigation moves do not delete routes.
- No migration or data rewrite is required to roll back.

If a slice introduces a regression, revert that slice's commit and retain the regression test as a pending proof only when the test accurately represents the approved contract.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing pages independently encode scope | Introduce one pure resolver and migrate one vertical path at a time |
| Existing sensor vocabulary mixes source and state | Add a presentation adapter without changing stored rows |
| Large page/component files create merge conflicts | Extract only rules needed by the touched behavior; avoid broad rewrites in Phase 1 |
| Claude work overlaps | Codex uses `codex/verdant-trust-core-deploy`; reconcile Claude's deploy-trunk-based review artifacts by commit SHA before each PR |
| Moving Labs changes discoverability | Preserve routes and add clear More -> Labs navigation |
| Entitlement client/server drift | Add capability contract tests and distinguish denial from verification failure |
| Responsive fixes regress desktop | Test all required widths and avoid mobile-only fixed widths |
| Cultivation guidance becomes overconfident | Gate by stage/context and request missing observations instead of inferring |

## Deferred decisions

These decisions belong to later phase specifications and are not required for Phase 1:

- Whether the unified timeline eventually requires a schema migration
- Final Field Console token and asset library
- Customer publishing authorization and token model
- Pheno Hunt and breeding workflow redesign
- Advanced AI-session import/export design
- Live-sensor premium product policy
- Live-payment and billing-provider activation
- Device-control architecture, which remains out of scope

## Final design statement

Verdant's gold-standard experience is not the page with the most cards or the most automation. It is the system that remembers scope perfectly, labels evidence without exception, makes the safest next observation obvious, and records the grower's approved action and outcome.

Phase 1 earns that trust before the rest of the Field Console is built.
