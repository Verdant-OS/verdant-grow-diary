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
posture Tranche A took), decomposed into independent per-slice PRs
(B0a/B0b, B1, B2, D5, D7, B3a/B3b, B4, B5, B6 — see §6). The
headline audit fact still stands and sharpened at this pin: **the 3-tap
status-only contract already ships in two surfaces (PlantQuickLog, legacy
QuickLog) — the product's problem is parity and continuity, not a missing
feature.** Tranche B+ therefore: converges idempotency and payload-building on
the canonical contract without adding any write path; gives the status-first
path parity where growers actually stand (tent context, global entry,
recovery); closes the two context-drop seams Tranche A deferred (Sensors→AI
Doctor, global-entry target re-establishment); and proves it all with a
test-only interaction counter so every claim is a before/after number.

Three decisions were Cheek's, not mine, and all three were approved with this
design (§10): the Sensors→Doctor context carry (D4, deferred from Tranche A;
scope corrected to grow/tent-only in D-B6), the _visible, owner-validated_
"Continue with <plant>?" suggestion at unscoped entries (D5 — the ban on
_silent_ remembered defaults stays), and the plant-scoped status-chip row in
the V2 sheet (D7).

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
5. **Recovery ships on Plant Detail only** (corrected 2026-08-19 after bot
   review on PR #1036; an earlier draft wrongly said `MISSING` everywhere):
   `noRecentLogRecoveryRules.ts` + `PlantDetailRecentActivityRecap` already
   render the calm 72 h "No recent check-in" prompt with a 3-tap path. The
   Dashboard (`Dashboard.tsx:1543`) and Grow Detail (`GrowDetail.tsx:306`)
   empty states still say "No recent activity yet." with no status
   affordance — that is the actual gap.
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

**D-B5 — Recovery reuses the shipped engine; never a second one.**
(Corrected 2026-08-19 after Codex/Copilot review.) The recovery engine
already ships: `src/lib/noRecentLogRecoveryRules.ts` — pure, injectable
`now`, 72 h window (`NO_RECENT_LOG_STALE_AFTER_HOURS`), tested, and consumed
by `PlantDetailRecentActivityRecap` with the exact §11 prompt copy and a
3-tap completion path. B3a therefore creates **no new rules module**: it
extends `buildNoRecentLogRecovery` consumption to the Dashboard and Grow
Detail empty states, feeding it rows those pages already load (no new
fetches), with each "Add quick check" CTA opening that surface's existing
Quick Log entry. No guilt language, no forced note/sensor, no AI call.

Two constraints added 2026-08-19 after Codex review of the corrected draft:

- **Check-ins only, never merged activity.** `useDashboardScopedData` merges
  `action_queue_events` into its recent items and `useGrowDetailData`
  additionally merges alert-adjacent rows — feeding those merged lists into
  `buildNoRecentLogRecovery` would falsely suppress the prompt when the
  grower has recent Action Queue activity but no recent diary check-in. B3a
  adds a small pure **projection** (`selectRecoveryCheckInRows` — a filter to
  grower diary/grow-event check-in rows, not a second engine) and mandates
  the regression test "recent Action Queue event + no recent check-in →
  prompt still shows".
- **Plant intent on grow-scoped surfaces is one explicit choice — B3a
  derives no plant at all** (re-corrected after a further Codex finding,
  verified: neither `useDashboardScopedData` nor `useGrowDetailData`
  exposes plant rows, only counts/`soleTentId`, and neither page mounts a
  Quick Log of its own — so a sole-plant prefill is not derivable inside
  B3a's boundaries). The CTA uses the sanctioned global seam instead:
  `window.dispatchEvent(new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT,
{ detail: { growId } }))` — the `GrowRoomQuickActionsCard` precedent —
  which AppShell (:129-139) answers by opening the legacy dialog
  **grow-scoped** (`QuickLog.tsx:483-486`), where the Better/Same/Worse
  chips already exist and the grower makes exactly one explicit plant
  choice. The dispatch callback stays free of Supabase verbs (the
  `grow-detail-recent` read-only fence scans the page source). Two more
  wiring rules from verification: the prompt renders only when
  `recent.status === "ok"` (`unavailable` is unknown — never rendered as
  measured absence), the check-in projection is the `RecentItem.kind ===
"diary"` filter, the shipped CTA label "Add quick check" is reused
  verbatim (its exact string is pinned), and the card's not-auto-clearing
  after a save is an accepted gap deferred to A5's freshness parity.

**D-B6 — Back-half context carry (D4 approved; scope corrected 2026-08-19
after Codex review).** The Sensors loop card provably holds only
`{ growId, tentId }` (`Sensors.tsx:337-342`), so the carry is
**`?growId=&tentId=` only** — no plant parameter can honestly be emitted from
this producer. `sensor-snapshot` branch threads that scope to `/doctor`
(normalization-only in the rules per A2's precedent; validation on the
consuming page mirroring `useScopedGrow`'s fail-closed pattern). AiDoctorStart
uses the validated tent scope to **filter/annotate its plant option list**
and show a tent-context line; the explicit plant choice stays — "Verdant will
not guess which plant you mean" (`AiDoctorStart.tsx:50`) is doctrine, and S9's
tap count is already 2. **No auto-triggered AI call — the readiness gate and
paid-call behavior are byte-untouched.** `/doctor` also mounts the loop card
(`current="ai-doctor"`) so the visual chain stops breaking between Sensors
and Doctor sessions. A validated plant-intent handoff _into_ Sensors (which
would let a plant survive Timeline→Sensors→Doctor) is a deferred follow-up,
not part of B4.

**D-B7 — Post-save continuation is one typed contract.** After A5(d) lands
(single dispatch), B3b unifies the five `verdant:entry-created` shapes onto
`dispatchQuickLogV2EntryCreated`'s typed detail and gives every save surface
the same continuation guarantee: confirmation + at-most-one intentional
"View timeline" action, with correct grow/tent/plant attribution. The
All-Activities section gains the toast + CTA it currently lacks.

**D-B8 — Decompose only what the slices touch.** Extractions are limited to
the pure modules named above plus (B6) the legacy dialog's
target-resolution block if — and only if — B1's migration proves it needed.
Timeline.tsx, ActionQueue.tsx, and the three Quick Log presenters are **not**
rewritten.

**D-B9 — Remembered-suggestion validity window (added 2026-08-19 after
Copilot review).** The D5 suggestion is valid only when ALL hold, evaluated
with an injectable `now`: (a) the stored `savedAt` parses to a finite
timestamp; (b) it is not in the future (`savedAt > now` → invalid); (c) its
age is at most **14 days** (`RECENT_TARGET_SUGGESTION_MAX_AGE_MS`; boundary:
age strictly greater than the max → expired); (d) the stored plant id
revalidates against the grower's own currently-visible plant rows (archived,
merged, deleted, or cross-user targets never surface). Any failed condition
yields **no suggestion** — never an error, never a fallback to the un-scoped
v1 key — and the stale entry is overwritten on the next successful save.
These rules live in the D5 slice's pure module with a full boundary-matrix
test.

---

## 6 · PR map (ownership, tests, rollback, collisions)

All PRs: branch from current `origin/verdant-grow-diary` on
`claude/one-tent-loop-efficiency-be0dot` lineage, strict RED→GREEN, test
renegotiations in the same commit as the behavior change, single-revert
rollback, no schema. **Sequencing rule: any PR whose owned files intersect a
Tranche A PR waits for that PR to merge** (re-verify with a fresh collision
scan before each slice, per the standing directive).

| PR      | Objective                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owned files (edit)                                                                                                                                                                                                                                                                                                                                               | New files                                                                                                                                                                    | Key tests (RED first)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Waits for                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B0a** | Mocked interaction-counter harness + runtime baselines for the S1–S13 journeys, expressed as **deterministic fixture variants with exact counts** (ranged baseline rows split into named variants, e.g. S4a plant-nav / S4b V2-typed, S5 fixed-fixture; S9 included — it is B4's before/after journey; RPC scenarios stubbed), keyboard variants                                                                                                                     | none (test-only)                                                                                                                                                                                                                                                                                                                                                 | `e2e/helpers/interactionCounter.ts`, `e2e/one-tent-loop-interaction-counter.spec.ts` (chromium-mocked, self-stubbed routes), `src/test/one-tent-interaction-receipt.test.ts` | Counter determinism unit suite; per-variant specs asserting exact counts (RED if product drifts); the runtime-pinned numbers are written back into the baseline as the authoritative exact "before" values (correction over range)                                                                                                                                                                                                                                                                                                           | nothing — first PR                                                                                                                                                            |
| **B0b** | Authenticated live measurement variant, honest-receipt gated exactly like the golden path                                                                                                                                                                                                                                                                                                                                                                            | `e2e/one-tent-loop-golden-path-ui.spec.ts` (add counters only)                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                            | Blocked-receipt path re-proven; no fabricated login                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner session JSON, or the granted non-deploy branch push so `quicklog-smoke.yml`-class CI (repo secrets) can run it; any workflow-file change ships flagged for owner review |
| **B1**  | Shared target precedence rules (pure) + first consumer (legacy dialog reads the shared contract; no behavior change)                                                                                                                                                                                                                                                                                                                                                 | `src/components/QuickLog.tsx` (resolution call only)                                                                                                                                                                                                                                                                                                             | `src/lib/quickLogTargetResolutionRules.ts` + test                                                                                                                            | Null/invalid/cross-user/stale/encoded-junk fail-closed matrix; precedence order pins; fence `not.toContain("readLastTarget(")` **kept green**                                                                                                                                                                                                                                                                                                                                                                                                | nothing (new module); QuickLog.tsx is unowned by A2–A5                                                                                                                        |
| **B2**  | Idempotency parity + payload convergence (D-B2/-B3/-B4)                                                                                                                                                                                                                                                                                                                                                                                                              | `src/hooks/useQuickLogActivitySave.ts`, `src/components/QuickLogAllActivitiesSection.tsx`, `src/components/PlantQuickLog.tsx`, `src/components/QuickLogV2Sheet.tsx` (key policy adoption)                                                                                                                                                                        | `src/lib/quickLogSaveKeyPolicy.ts` + test                                                                                                                                    | Retry-reuses-key / edit-rotates-key matrix per surface; duplicate-save regression (lost-response retry = 1 row); reason codes un-collapsed; media-insert fence                                                                                                                                                                                                                                                                                                                                                                               | **A5 merged** (same files); #1034's deferral note honored                                                                                                                     |
| **D5**  | Visible "Continue with <plant>?" suggestion at unscoped legacy open (explicit selection, never silent) + user-namespaced `verdant.quickLog.lastTarget.v2.<userId>` write/read per D-B9                                                                                                                                                                                                                                                                               | `src/components/QuickLog.tsx` (chip + v2 write; v1 write retired), `src/components/LocalDataHealthPanel.tsx` (key inventory), fence renegotiation in `src/test/plant-detail-quicklog-handoff.test.ts` (ban silent defaulting, not the visible chip)                                                                                                              | `src/lib/quickLogRecentTargetSuggestion.ts` + boundary-matrix test                                                                                                           | D-B9 validity matrix (finite/future/14-day boundary/cross-user/archived); unscoped open shows chip, never preselects; tap = explicit selection; dismiss works; `quicklog-plant-default` + localStorage-allowlist guardrails renegotiated same-commit                                                                                                                                                                                                                                                                                         | **B1 merged** (consumes the precedence contract)                                                                                                                              |
| **D7**  | Plant-scoped Better/Same/Worse chip row in the V2 sheet, reusing `RESPONSE_CHECK_STATUSES` + `applyResponseCheck` into the note (save contract unchanged: `quicklog_save_manual` note) — plus TentDetail passes `defaultTargetKey="plant:<safePlantId>"` when the tent has exactly one active plant (the page-owned `safePlantId` derivation already shipped for the loop card in the same file; corrected 2026-08-19 after Codex review so the S4 budget is honest) | `src/components/QuickLogV2Sheet.tsx` (note-section chip row, plant-target-gated), `src/pages/TentDetail.tsx` (sole-plant V2 target key only)                                                                                                                                                                                                                     | —                                                                                                                                                                            | Chips render only for plant targets; tap fills note → save enabled with zero typing; payload `p_action:"note"`; tent target shows no chips; sole-active-plant tent → FAB opens plant-scoped (3-tap status save); multi-plant tent → tent-scoped with one explicit Select choice; V2 pin closure + `tent-detail-*` closure green                                                                                                                                                                                                              | nothing (V2 sheet and TentDetail page unowned by A2–A5; verify pin inventory in-slice)                                                                                        |
| **B3a** | Recovery parity on Dashboard + Grow Detail by extending the SHIPPED `noRecentLogRecoveryRules.ts` (D-B5, corrected three times) — no new rules engine, no plant derivation                                                                                                                                                                                                                                                                                           | `src/pages/Dashboard.tsx:1543`, `src/pages/GrowDetail.tsx:306` (empty states consume `buildNoRecentLogRecovery` over the `kind === "diary"` **check-in-only projection**, gated on `recent.status === "ok"`; CTA dispatches `PLANT_QUICKLOG_PREFILL_EVENT` with `{ growId }` — the `GrowRoomQuickActionsCard` precedent — opening the legacy dialog grow-scoped) | `src/lib/recoveryCheckInProjection.ts` (pure `RecentItem[]` → check-in rows filter, not an engine) + test                                                                    | Prompt renders on no/stale **check-in** with the shipped copy incl. "Add quick check" (pinned label reused verbatim); **recent Action Queue/alert event + no recent check-in → prompt still shows**; recent diary check-in → no prompt; `recent.status === "unavailable"` → no prompt (unknown ≠ absence); dispatch detail asserted `{ growId }`, no Supabase verbs in page source (read-only fence); "No recent activity yet." literals kept (source-scan pins); existing `no-recent-log-recovery-rules` + recap suites untouched and green | nothing (pages unowned by A2–A5; hooks NOT edited; post-save auto-clear deferred to A5)                                                                                       |
| **B3b** | Continuation parity (D-B7): All-Activities toast + "View timeline" CTA; unify `verdant:entry-created` detail shapes on the typed helper                                                                                                                                                                                                                                                                                                                              | `src/components/QuickLogAllActivitiesSection.tsx`, `src/components/PlantQuickLog.tsx` (dispatch shape), dispatch call sites                                                                                                                                                                                                                                      | —                                                                                                                                                                            | Exactly-one continuation action per surface; typed event detail; listener null-guards proven                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **A5 merged** (same files; A5(d) must land first)                                                                                                                             |
| **B4**  | Back-half context carry + `/doctor` loop card (D-B6)                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/lib/oneTentLoopNavigationRules.ts` (sensor-snapshot branch), `src/pages/AiDoctorStart.tsx`                                                                                                                                                                                                                                                                  | `src/lib/doctorStartContextRules.ts` + test                                                                                                                                  | Carry matrix incl. whitespace/invalid → bare `/doctor`; fail-closed page validation; **no paid-call regression pin**; card mount                                                                                                                                                                                                                                                                                                                                                                                                             | **A2 merged** (same rules file) + **owner decision D4**                                                                                                                       |
| **B5**  | Alert→Action Queue journey proof at journey level (counts S10–S13) incl. observed fail-closed PGRST202 boundary                                                                                                                                                                                                                                                                                                                                                      | none (test-only)                                                                                                                                                                                                                                                                                                                                                 | `e2e/one-tent-alert-action-journey.spec.ts` (mocked)                                                                                                                         | One click = one suggestion; approval/completion explicit; RPC-missing → calm boundary, zero fallback writes                                                                                                                                                                                                                                                                                                                                                                                                                                  | **A3 merged** (labels it asserts)                                                                                                                                             |
| **B6**  | Focused a11y + keyboard/mobile measurement closure; any B1-proven extraction                                                                                                                                                                                                                                                                                                                                                                                         | touched surfaces only                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                            | S15–S17 measured via B0a harness; focus-restoration and ARIA journey assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                              | B1–B3 merged                                                                                                                                                                  |

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

| Scenario                             | Today                                                                             | Budget after B+                                                                                                                                                                                                                                                                                                                                                                                       | Via                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| S1 status-only, plant context        | 3 taps / 0 typing / 0 reselect                                                    | **unchanged (3/0/0)** — protect with a counter regression; ~10 s manual headed target verified in Phase B                                                                                                                                                                                                                                                                                             | B0a pin                                         |
| S4 tent context → plant status       | 4 + 1 nav, or 5+ with typing                                                      | **Sole-active-plant tent: 3 taps / 0 typing / 0 reselection (FAB opens plant-scoped). Multi-plant tent: 5 taps incl. exactly one explicit plant choice, 0 typing**                                                                                                                                                                                                                                    | D7 (chips + sole-plant target key)              |
| S5 global entry, known recent target | ≥5 incl. select churn                                                             | **≤4 / 0 typing / exactly 1 explicit choice** (visible suggestion, never silent)                                                                                                                                                                                                                                                                                                                      | D5 (if approved); else unchanged and documented |
| S6 recovery                          | SHIPPED on Plant Detail (3 taps, 72 h window); `MISSING` on Dashboard/Grow Detail | **Plant Detail: 3 taps (unchanged). Dashboard/Grow Detail: 3 taps + exactly one explicit plant choice** inside the grow-scoped dialog (no plant derivation on those surfaces — hooks expose no plant rows; the D5 chip reduces the choice to one tap); check-in-only classification — never suppressed by Action Queue/alert activity; unknown never prompts; no guilt copy, no forced note/sensor/AI | B3a (+D5 for the one-tap choice)                |
| S7 save → timeline evidence          | 0–1, uneven feedback                                                              | **≤1 everywhere, uniform confirmation, exactly one row**                                                                                                                                                                                                                                                                                                                                              | B2+B3                                           |
| S8 timeline → trusted snapshot       | 1 (already met)                                                                   | unchanged; stale honesty via A4                                                                                                                                                                                                                                                                                                                                                                       | pin only                                        |
| S9 snapshot → doctor context-ready   | 2 interactions / 1 explicit plant choice / 2 transitions (corrected)              | **count unchanged; carried tent scope filters/annotates the plant list and is visible; explicit choice retained; no silent selection**                                                                                                                                                                                                                                                                | B4 (D4; grow/tent carry only)                   |
| Duplicate-write risk                 | LOW–HIGH by surface                                                               | **LOW everywhere**                                                                                                                                                                                                                                                                                                                                                                                    | B2                                              |

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
| **Genuinely new Tranche B+**                                    | B0 measurement harness; B1 target precedence contract; B2 idempotency/payload convergence; D5 continue-suggestion; D7 V2 status chips; B3a recovery parity (via the shipped module); B3b continuation parity; B4 back-half context carry (D4); B5 journey proof; B6 a11y/keyboard closure   |

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

| Where                                                                          | String                                                                                                                                                                                              | Status                                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Recovery prompt (B3a: Dashboard/GrowDetail; already live on PlantDetail recap) | "No recent check-in." + "Add a 10-second status: Better, Same, or Worse."                                                                                                                           | **Already shipped verbatim** in `noRecentLogRecoveryRules.ts:33-38` — B3a reuses it, no new copy |
| Recovery affordance button                                                     | "Add quick check"                                                                                                                                                                                   | **Already shipped** (same module) — supersedes the earlier draft's "Add status"                  |
| D5 suggestion chip                                                             | "Continue with <plant name>?" · dismiss: "Choose another"                                                                                                                                           | Ratified 2026-08-19 with this design                                                             |
| B4 doctor tent-context line                                                    | "This link carried tent context: **<tent name>**." + (only when plants really are listed) " Its plants are listed first — you can still choose any plant."                                          | **Ratified 2026-08-21 by Cheek**, as shipped in B4a                                              |
| B4 in-tent option badge                                                        | "In this tent"                                                                                                                                                                                      | Shipped with the line above; exposed to assistive tech as the link's description, not its name   |
| B4 unverified-scope line                                                       | "Verdant couldn't check the grow or tent this link carried, so no tent context is applied." + (only when listed) " Every active plant is listed below." + retry "Try the check again" / "Checking…" | Shipped with the line above — distinct from the invalid case below, deliberately                 |
| B4 unowned-scope line                                                          | "That link carried a grow or tent Verdant couldn't match to your account, so no tent context is applied." + (only when listed) " Every active plant is listed below."                               | Shipped with the line above                                                                      |

The ratified line is **tent-scoped, never plant-scoped** — the Sensors loop card
provably holds only `{ growId, tentId }`, so no plant is honestly nameable from
this producer (D-B6). Two properties of the wording are load-bearing rather than
stylistic, and a later edit must preserve both:

- **"listed first", not "filtered to".** The carried scope reorders and badges
  the options; it never removes one. A shorter list would be a softer way of
  guessing, and "Verdant will not guess which plant you mean" is doctrine.
- **Unverified ≠ unowned.** A failed ownership _read_ says Verdant could not
  check, and offers a retry; a scope the account does not own says so plainly.
  Collapsing them would report a network failure as a permissions verdict.

Both list clauses are conditional on plants actually being listed, so the page
never claims a list it is not showing.

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
