# One-Tent Loop Efficiency — Tranche B+ design

**Status:** APPROVED — Cheek, 2026-08-19 ("APPROVED. Execute steps one through
five, each in its own slice."). The approval covers the design, owner
decisions **D4, D5, D7**, and the §11 copy; each approved item ships in its
own slice. Slices gated on Tranche A PRs (B2, B3b, B4's rules edit, B5) stay
gated until the owning A-PR merges.
**Author:** Claude (Tranche B+ architect and, after approval, implementer, per
Cheek's 2026-08-19 reassignment).
**Verified against:** deploy branch `verdant-grow-diary`, tip
`e012b633c55310343d37e9ec90210e2321a00bc8` (2026-08-19; includes #1029 =
Tranche A PR-A1 merged as `f8d93f57…`, and #1034 merged). Every anchor read
directly at this tip.
**Baseline:** `docs/one-tent-loop-efficiency-baseline.md` (same date, same
pin, same counting rules). Every budget in §7 refers to that table.
**Scope class:** client-side wiring, pure rules extraction, copy, and
test-only measurement. No schema, no migrations, no RLS/auth/edge-function
changes, no new Quick Log write paths, no device control, no paid AI in tests,
no production telemetry.

---

## 1 · Executive recommendation

Continue **Option A — shared pure rules + progressive convergence** (the same
posture Tranche A took), decomposed into seven independent slices (B0–B6; B0
ships as a mocked part and a separately-gated authenticated part). The
headline audit fact still stands and sharpened at this pin: **the 3-tap
status-only contract already ships in two surfaces (PlantQuickLog, legacy
QuickLog) — the product's problem is parity and continuity, not a missing
feature.** Tranche B+ therefore: converges idempotency and payload-building on
the canonical contract without adding any write path; gives the status-first
path parity where growers actually stand (tent context, global entry,
recovery); closes the two context-drop seams Tranche A deferred (Sensors→AI
Doctor, global-entry target re-establishment); and proves it all with a
test-only interaction counter so every claim is a before/after number.

Three decisions are Cheek's, not mine (§10): the Sensors→Doctor context carry
(D4, deferred from Tranche A), whether a _visible, owner-validated_ "Continue
with <plant>" suggestion may exist at unscoped entries (D5 — the current test
fence bans silent remembered defaults, and this design keeps that ban), and
whether the V2 sheet gains a plant-scoped status-chip row (D7).

---

## 2 · Fixed inputs and ownership boundaries

**Fixed inputs — treat as done, never redo:**

- Tranche A specification (`docs/specs/one-tent-loop-tranche-a-specification.md`)
  remains authoritative. PR-A1 is merged (`f8d93f57…`). PR-A2…A5 are approved,
  Codex-owned, and **incoming**; their edit points and pinned anchors are
  collision boundaries for every B slice (§6 sequencing).
- #1034 (merged, `e012b633`): save-error classification in the canonical hook,
  PlantQuickLog recovery copy, operator `/diagnostics/quicklog`, helper ACL
  fences. Its deliberate deferral — the activity-save hook still collapsing
  reason codes — is picked up by PR-B2 _after_ A5 lands (same reason #1034
  deferred it: A5's pinned anchors).

**Not owned by this program:** Tranche A items; any competing One-Tent
navigation implementation; the Action Queue transition/RLS production repair
(Codex, separate slice — B5 measures the client's fail-closed boundary and
never works around it); production migrations, deployment, billing, paid AI,
service-role operations, device control.

---

## 3 · Audit delta since engagement 1 (verified at this pin)

New or sharpened facts the design responds to; anchors in the baseline doc.

1. **The last-target key is write-only by fence.**
   `verdant.quickLog.lastTarget.v1` is written on every legacy save but a
   static fence (`plant-detail-quicklog-handoff.test.ts:117-120`) bans reading
   it back: "Route prefills are resolved against stored relationships and must
   not fall through to remembered or single-plant defaults." Any reuse of
   remembered targets is a deliberate contract renegotiation → D5.
2. **Status parity is the S4/S5 friction, not save speed.** V2 and the
   All-Activities section have no Better/Same/Worse; the 3-tap contract exists
   only on plant-context surfaces.
3. **Idempotency quality is wildly uneven** (baseline §4): legacy strongest
   (signature-aware reuse), All-Activities weakest (fresh key every click, no
   success feedback) — the repo's highest duplicate-write exposure.
4. **The manual payload is built twice.** `useQuickLogActivitySave.ts:132-148`
   duplicates the RPC arg shape inline, omits `p_stage`, and can pass
   `p_idempotency_key: null`, silently disabling server dedupe.
5. **No recovery state exists** (S6 `MISSING`): empty states say "No recent
   activity yet." with no status affordance.
6. **The back half still drops context** at `sensor-snapshot → /doctor`
   (`oneTentLoopNavigationRules.ts:182`, all ids dropped; D4), and `/doctor`
   mounts no loop card.
7. **Post-#1034**, transport errors are classified in the canonical hook — B2
   inherits this for free when converging the activity-save hook onto it.

---

## 4 · Architectural options

| Option                                                   | Shape                                                                                                                                                       | Trade-offs                                                                                                                                                                 | Verdict                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A — shared pure rules, progressive convergence**       | Extract target-resolution, save-key, recovery, and doctor-context rules into pure typed modules; migrate one surface per PR; presenters keep their identity | Lowest regression risk; each PR independently revertible; matches Tranche A's proven posture and the repo's pin discipline; slower to full consistency                     | **RECOMMENDED**                                                                  |
| B — one canonical Quick Log presenter                    | Fold legacy, V2, PlantQuickLog into one component                                                                                                           | Immediate consistency, but collides with ~40 pinned suites across three large components, breaks Tranche A anchors mid-flight, and couples every entry point's regressions | REJECT for this tranche                                                          |
| C — tent-level loop workspace ("today/continue" surface) | New tent-scoped surface backed by pure view models                                                                                                          | Strongest overview but a new navigation surface + new route (Tranche A verified the manifest untouched — this reverses that), high dashboard-creep risk                    | DEFER — re-evaluate only if B3's measured continuation numbers still miss budget |

---

## 5 · Design decisions

**D-B1 — Target precedence is a single pure contract.** New
`src/lib/quickLogTargetResolutionRules.ts`: typed precedence
`explicit prefill/intent → route context → explicit grower selection`, with
**no remembered-default tier** (fence preserved). Consumes the existing
resolvers (`quickLogRouteTargetRules.ts`, `resolveQuickLogPrefillTarget`,
`resolveQuickLogV2Target`) rather than replacing them; each surface migrates
to the shared entry point one PR at a time. Null/invalid/cross-user/stale
inputs fail closed to "ask for the minimum selection". _Alternative
considered:_ leave three independent resolution stacks — rejected: S4/S5
counts show the seams are exactly where the stacks disagree.

**D-B2 — One idempotency policy, the strongest one.** Extract legacy's
signature-aware behavior into `src/lib/quickLogSaveKeyPolicy.ts`: mint on
open, reuse on unedited retry, rotate on success/reset/edit (payload-signature
comparison, `occurred_at` normalized). V2, PlantQuickLog, and All-Activities
adopt it; PlantQuickLog's re-minting fallback (`:298`) and All-Activities'
fresh-key-per-click (`:535`) are the two fixed defects. _Alternative:_ leave
per-surface policies and only fix the two defects in place — rejected: the
next surface added would fork again; the policy is 30 lines of pure code.

**D-B3 — Converge the duplicated manual payload, not the RPC.** The
activity-save hook's `manual_note` branch switches to
`buildQuickLogV2SavePayload` + `useQuickLogV2Save` (canonical builder + hook,
inheriting #1034's error classification and un-collapsing reason codes). The
`quicklog_save_event` branch is **untouched** — it is a distinct, deliberate
contract for typed events, not a defect. No RPC signature changes anywhere.

**D-B4 — Photo/video direct inserts are an accepted, documented divergence.**
The inline rationale ("the event RPC would confirm an invisible photo") is a
real safety argument. Folding media into `quicklog_save_manual` needs a server
change → schema territory → REJECT within this program. B2 documents the
divergence at the call sites and adds a static fence pinning that these two
inserts remain the only sanctioned direct `diary_entries` INSERTs in Quick Log
code.

**D-B5 — Recovery is copy + affordance, not a new engine.** New pure
`src/lib/quickLogRecoveryRules.ts`: given the entries a page already loaded
(no new fetch), classify `recent | none-recent | never` with an injectable
clock. Pages that show "No recent activity yet." render the ratified recovery
copy (§11) plus a status-chip affordance that opens the surface's existing
Quick Log entry with `focusResponseCheckOnOpen` (mechanism already shipped in
PlantQuickLog). No guilt language, no forced note/sensor, no AI call.

**D-B6 — Back-half context carry (gated on D4).** If Cheek approves D4:
`sensor-snapshot` branch carries validated scope to `/doctor`
(`?growId=&tentId=&plantId=`, normalization-only in the rules per A2's
precedent, validation on the consuming page mirroring `useScopedGrow`'s
fail-closed pattern); AiDoctorStart renders a "Reviewing <plant>" context chip
and hands the ids to the existing readiness gate. **No auto-triggered AI call
— the readiness gate and paid-call behavior are byte-untouched.** `/doctor`
also mounts the loop card (`current="ai-doctor"`) so the visual chain stops
breaking between Sensors and Doctor sessions. If D4 is declined, B4 shrinks to
the loop-card mount only.

**D-B7 — Post-save continuation is one typed contract.** After A5(d) lands
(single dispatch), B3 unifies the five `verdant:entry-created` shapes onto
`dispatchQuickLogV2EntryCreated`'s typed detail and gives every save surface
the same continuation guarantee: confirmation + at-most-one intentional
"View timeline" action, with correct grow/tent/plant attribution. The
All-Activities section gains the toast + CTA it currently lacks.

**D-B8 — Decompose only what the slices touch.** Extractions are limited to
the four pure modules named above plus (B6) the legacy dialog's
target-resolution block if — and only if — B1's migration proves it needed.
Timeline.tsx, ActionQueue.tsx, and the three Quick Log presenters are **not**
rewritten.

---

## 6 · PR map (ownership, tests, rollback, collisions)

All PRs: branch from current `origin/verdant-grow-diary` on
`claude/one-tent-loop-efficiency-be0dot` lineage, strict RED→GREEN, test
renegotiations in the same commit as the behavior change, single-revert
rollback, no schema. **Sequencing rule: any PR whose owned files intersect a
Tranche A PR waits for that PR to merge** (re-verify with a fresh collision
scan before each slice, per the standing directive).

| PR      | Objective                                                                                                            | Owned files (edit)                                                                                                                                                                                       | New files                                                                                                              | Key tests (RED first)                                                                                                                                          | Waits for                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B0a** | Mocked interaction-counter harness + runtime baselines for S1–S8, S10–S13 (stubbed RPC), keyboard variants           | none (test-only)                                                                                                                                                                                         | `e2e/helpers/interactionCounter.ts`, `e2e/one-tent-efficiency-baseline.spec.ts` (chromium-mocked, self-stubbed routes) | Counter unit tests; per-scenario specs asserting the baseline's exact counts (RED if product drifts)                                                           | nothing — first PR                                                                                                                                                            |
| **B0b** | Authenticated live measurement variant, honest-receipt gated exactly like the golden path                            | `e2e/one-tent-loop-golden-path-ui.spec.ts` (add counters only)                                                                                                                                           | —                                                                                                                      | Blocked-receipt path re-proven; no fabricated login                                                                                                            | Owner session JSON, or the granted non-deploy branch push so `quicklog-smoke.yml`-class CI (repo secrets) can run it; any workflow-file change ships flagged for owner review |
| **B1**  | Shared target precedence rules (pure) + first consumer (legacy dialog reads the shared contract; no behavior change) | `src/components/QuickLog.tsx` (resolution call only)                                                                                                                                                     | `src/lib/quickLogTargetResolutionRules.ts` + test                                                                      | Null/invalid/cross-user/stale/encoded-junk fail-closed matrix; precedence order pins; fence `not.toContain("readLastTarget(")` **kept green**                  | nothing (new module); QuickLog.tsx is unowned by A2–A5                                                                                                                        |
| **B2**  | Idempotency parity + payload convergence (D-B2/-B3/-B4)                                                              | `src/hooks/useQuickLogActivitySave.ts`, `src/components/QuickLogAllActivitiesSection.tsx`, `src/components/PlantQuickLog.tsx`, `src/components/QuickLogV2Sheet.tsx` (key policy adoption)                | `src/lib/quickLogSaveKeyPolicy.ts` + test                                                                              | Retry-reuses-key / edit-rotates-key matrix per surface; duplicate-save regression (lost-response retry = 1 row); reason codes un-collapsed; media-insert fence | **A5 merged** (same files); #1034's deferral note honored                                                                                                                     |
| **B3**  | Recovery state + continuation parity (D-B5/-B7)                                                                      | `src/components/PlantQuickLog.tsx` (focus wiring), `QuickLogAllActivitiesSection.tsx` (toast/CTA), `Dashboard.tsx:1543`, `GrowDetail.tsx:306`, `PlantDetailRecentActivityRecap.tsx:281`, dispatch shapes | `src/lib/quickLogRecoveryRules.ts` + test                                                                              | Recovery classification (clock injected); copy pins (§11); exactly-one continuation action; typed event detail                                                 | **A5 merged** (dispatch + refresh adjacency)                                                                                                                                  |
| **B4**  | Back-half context carry + `/doctor` loop card (D-B6)                                                                 | `src/lib/oneTentLoopNavigationRules.ts` (sensor-snapshot branch), `src/pages/AiDoctorStart.tsx`                                                                                                          | `src/lib/doctorStartContextRules.ts` + test                                                                            | Carry matrix incl. whitespace/invalid → bare `/doctor`; fail-closed page validation; **no paid-call regression pin**; card mount                               | **A2 merged** (same rules file) + **owner decision D4**                                                                                                                       |
| **B5**  | Alert→Action Queue journey proof at journey level (counts S10–S13) incl. observed fail-closed PGRST202 boundary      | none (test-only)                                                                                                                                                                                         | `e2e/one-tent-alert-action-journey.spec.ts` (mocked)                                                                   | One click = one suggestion; approval/completion explicit; RPC-missing → calm boundary, zero fallback writes                                                    | **A3 merged** (labels it asserts)                                                                                                                                             |
| **B6**  | Focused a11y + keyboard/mobile measurement closure; any B1-proven extraction                                         | touched surfaces only                                                                                                                                                                                    | —                                                                                                                      | S15–S17 measured via B0a harness; focus-restoration and ARIA journey assertions                                                                                | B1–B3 merged                                                                                                                                                                  |

**Collision boundaries (standing):** `oneTentLoopNavigationRules.ts` + its
test family → A2 until merged. `ActionQueue/AlertDetail/ActionDetail` wiring →
A3. `Sensors.tsx`, `growDataSourceLabelRules.ts`, `Timeline.tsx` chips/filters
→ A4. `QuickLogAllActivitiesSection`, `Alerts.tsx`, `AppShell.tsx` dispatch,
`useDashboardScopedData`/`useGrowDetailData` → A5. The no-go vocabulary and
proximity-window pins from Tranche A §1 apply verbatim to every B slice.

---

## 7 · Interaction budgets (measured, not aspirational)

Before-values are the baseline table's; budgets bind only after the harness
(B0a) reproduces the before-values at runtime.

| Scenario                             | Today                                   | Budget after B+                                                                                           | Via                                             |
| ------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| S1 status-only, plant context        | 3 taps / 0 typing / 0 reselect          | **unchanged (3/0/0)** — protect with a counter regression; ~10 s manual headed target verified in Phase B | B0a pin                                         |
| S4 tent context → plant status       | 4 + 1 nav, or 5+ with typing            | **≤4 / 0 typing / ≤1 explicit plant choice**                                                              | D7 (if approved) or plant-nav CTA               |
| S5 global entry, known recent target | ≥5 incl. select churn                   | **≤4 / 0 typing / exactly 1 explicit choice** (visible suggestion, never silent)                          | D5 (if approved); else unchanged and documented |
| S6 recovery                          | `MISSING`                               | **3 taps from the recovery prompt**, no guilt copy, no forced note/sensor/AI                              | B3                                              |
| S7 save → timeline evidence          | 0–1, uneven feedback                    | **≤1 everywhere, uniform confirmation, exactly one row**                                                  | B2+B3                                           |
| S8 timeline → trusted snapshot       | 1 (already met)                         | unchanged; stale honesty via A4                                                                           | pin only                                        |
| S9 snapshot → doctor context-ready   | 2–3 transitions + full re-establishment | **1 CTA / 0 reselection when context provable; calm missing-context otherwise**                           | B4 (D4)                                         |
| Duplicate-write risk                 | LOW–HIGH by surface                     | **LOW everywhere**                                                                                        | B2                                              |

If runtime measurement contradicts a before-value, the baseline is corrected
first and the budget re-derived — never the test bent to the budget.

---

## 8 · Test strategy

Strict RED→GREEN per behavior change; exact expected RED captured before the
fix. Per-PR verify-closures follow Tranche A §7's discipline (enumerate by
glob for the A3-adjacent families). Contract tests import-and-assert resolved
values, never source-regex, per the constitution — source scans only for
absence fences (e.g. B2's media-insert fence, the kept `readLastTarget` ban).
Mocked browser runs stub all Supabase traffic (`chromium-mocked`,
self-stubbed `page.route()`); no paid provider call is reachable (the
readiness gate is pinned untouched, and B0/B5 specs assert zero calls to AI
endpoints); no production write occurs in ordinary CI. Authenticated evidence
is labeled separately and only ever collected through the sanctioned gated
paths (session JSON / repo-secret CI), with the honest `blocked` receipt
otherwise.

Validation commands per slice: `bun run typecheck` (+ `typecheck:tsgo` second
opinion), targeted `bunx vitest run <edited + closure>`, the affected e2e
project, and the §12-format report with exact counts.

---

## 9 · Work classification (mandated 4-way split)

| Class                                                           | Items                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Already solved by Tranche A** (do not touch)                  | Mobile FAB plant scoping (A1, merged); grow threading of ai-doctor/alert steps + tent self-link fix (A2); names-not-UUIDs at decision moments (A3); sensors staleMs + Stale/Invalid honesty + °F chip + notes filter (A4); All-Activities refresh, Alerts URL filters, single dispatch (A5) |
| **Solved by #1034** (merged; build on, don't redo)              | Save-error classification in the canonical hook; PlantQuickLog failure copy + recovery actions; `/diagnostics/quicklog`; helper ACL fences. Inherited deferral → B2: activity-save reason-code collapse                                                                                     |
| **Blocked by the Action Queue production repair** (Codex-owned) | Live approval/completion journey verification; anything touching `action_queue_transition` server-side. B5 measures the client fail-closed boundary only and never bypasses it                                                                                                              |
| **Genuinely new Tranche B+**                                    | B0 measurement harness; B1 target precedence contract; B2 idempotency/payload convergence; B3 recovery + continuation parity; B4 back-half context carry (D4); B5 journey proof; B6 a11y/keyboard closure                                                                                   |

---

## 10 · Owner decisions required (each blocks only its own slice)

> **Resolved 2026-08-19:** Cheek approved D4, D5, and D7 (and ratified the
> §11 copy) together with this design. The table below is kept as the record
> of what each decision was; the "If declined" columns are moot.

| ID                            | Decision                                                                                                                                                                                                                                                                                                                  | Recommendation                                                                                            | If declined                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **D4** (inherited)            | Sensors→`/doctor` context carry                                                                                                                                                                                                                                                                                           | APPROVE the D-B6 contract: normalization-only threading, fail-closed page validation, no paid-call change | B4 shrinks to the `/doctor` loop-card mount            |
| **D5**                        | Visible "Continue with <plant>?" suggestion at unscoped entries, sourced from a **user-namespaced** (`verdant.quickLog.lastTarget.v2.<userId>`), owner-revalidated recent target; rendered as an explicit choice chip, never a silent default; the `readLastTarget` fence is renegotiated to ban only _silent_ defaulting | APPROVE — it is the only lever that moves S5 within safety rules                                          | S5 stays ≥5 and is documented as accepted friction     |
| **D7**                        | Plant-scoped status-chip row (Better/Same/Worse) in the V2 sheet, reusing `RESPONSE_CHECK_STATUSES` + `applyResponseCheck` into the note (save path unchanged: `quicklog_save_manual` note)                                                                                                                               | APPROVE — closes S4 without presenter convergence                                                         | S4 served by a "log status on <plant>" nav CTA instead |
| **D2** (inherited, unchanged) | V2 sheet vs legacy dialog as the long-term plant-route capture surface                                                                                                                                                                                                                                                    | No position needed for B+ — A1's shipped intent path stands; revisit after B2/B3 measurements             | —                                                      |
| **Copy**                      | §11 strings                                                                                                                                                                                                                                                                                                               | Ratify with this design (Tranche A §8 precedent)                                                          | Slices holding copy land without the copy change       |

---

## 11 · Copy proposed for ratification

| Where                                                                     | String                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Recovery prompt (B3; Dashboard/GrowDetail/PlantDetail recap empty states) | "No recent check-in. Add a 10-second status: Better, Same, or Worse."          |
| Recovery affordance button                                                | "Add status"                                                                   |
| D5 suggestion chip (only if D5 approved)                                  | "Continue with <plant name>?" · dismiss: "Choose another"                      |
| B4 doctor context chip (only if D4 approved)                              | "Reviewing <plant name>" · missing-context: existing readiness copy, unchanged |

No other public copy changes in this tranche.

---

## 12 · Safety verdict and rollback

**Safety verdict: SAFE by construction.** No schema/RLS/auth/edge-function
changes; no new write path (B2 _removes_ a duplicated payload); Action Queue
approval-required posture untouched and re-proven fail-closed; no device
control; no paid AI reachable from any test; sensor provenance rules untouched
(A4 owns that honesty); recovery copy is calm and optional; remembered-target
behavior only ever becomes a visible explicit choice, and only if D5 is
approved. Every PR is a single revert with no data migration; B0/B5 are
test-only and inert to the product.

**Calibrated verdict:** the design is fully anchored at `e012b633` with the
friction quantified in a same-method baseline, but its runtime before-numbers
are still source-derived until B0a lands — treat B0a as the tranche's first
merge gate, and treat any B0a/baseline disagreement as a baseline correction,
never a green light to skip re-measurement. **APPROVED — proceeding to
implementation in per-slice PRs (B0a first).**
