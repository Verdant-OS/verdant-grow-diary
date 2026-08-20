# Lovable 100-Prompt Roadmap — Triage and Cherry-Picked Pack

**Date:** 2026-08-20
**Author:** Claude (Knowledge Library and Product Specification Architect)
**Audited ref:** `verdant-grow-diary` @ `cff3efd` — the branch that actually ships
**Revision:** 2 — re-audited at `cff3efd` after the deploy branch advanced from
`77d8eec` (three merges: #1035 quicklog review fixes, #1039 **B0a** interaction-counter
harness, #1047 **B4a** `/doctor` loop card). Revision 1 was pinned at `77d8eec`.
Changes in this revision are summarised in §10.
**Status:** ADVISORY / NOT APPROVED. This document selects and rewrites prompts.
It authorizes no implementation, no schema, no Lovable send, and no production write.

---

## 1. Executive recommendation

The 100-prompt roadmap is well-constructed **for a project that does not exist yet.**
Verdant is not that project. At the audited ref it carries **129 page components, 270
migrations, and 34 edge functions**, with a live public site, a live billing provider,
and a live AI Doctor. `established fact`, measured by file count at `cff3efd`.

Sent as written, the list would not build Verdant. It would build a **second Verdant
inside the first one** — a parallel app shell (prompts 1–10) writing to a parallel schema
(prompts 11–16) through a parallel write path, which is precisely the "dual write paths"
failure the approved `ONE_TENT_LOOP_OPERATING_ORDER` slice exists to prevent.

**The recommendation is not "discard the list."** It is: stop treating it as a build
sequence and start treating it as a **feature backlog to triage against what already
ships**. Roughly 60 of the 100 describe surfaces Verdant already has. Of the remainder,
a small set is genuinely excellent and genuinely absent, and one is actively dangerous.

**The selection criterion that matters most here is not product value. It is schema
cost** — for a reason specific to this repo, explained in §3.

---

## 2. Audit findings — what already ships

`established fact`, re-verified by source search at `cff3efd`. Sending these to a builder
would produce a competing implementation of a shipped feature, which
`AGENTS.md` → Multi-Agent Coordination forbids.

| Prompt | Claim | Reality at `cff3efd` |
| --- | --- | --- |
| #5 Quick Log FAB | "implement a FAB" | `AppShell.tsx`, with mobile-FAB tests; plant scoping merged as Tranche A PR-A1 (#1029) |
| #8 Breadcrumbs | "design a breadcrumb component" | `GrowBreadcrumbs.tsx` (22 files reference it) |
| #9 Skeleton loaders | "implement skeleton states" | `ui/skeleton.tsx`, `ActionQueueLoadingSkeleton.tsx` (16 files) |
| #29 Move plant between tents | "create a Move Plant action" | `PlantRecentMoveCard.tsx`, `TentCardActionsMenu.tsx` |
| #33 Genetics lineage | "show a family tree" | `GeneticsBadge.tsx`, `LineageRepairCta.tsx` (19 files) |
| #34 Pheno-hunt matrix | "build a comparison table" | `PhenoComparisonView.tsx`, live route `/pheno-comparison` (44 files) |
| #35 Terpene radar | "aroma tagging widget" | `CultivarPhenoSampleModule.tsx`, `PhenoProductSamplingSection.tsx` |
| #56 VPD optimal zone | "shade the optimal band" | `VpdTimelineStatusWidget.tsx`, `DerivedVpdStatus.tsx`, `AiDoctorVpdDriftSection.tsx` |
| #75 AI missing-data alert | "list what's missing" | Already a constitutional requirement of AI Doctor output; present in Doctor panels |
| #76 AI confidence score | "add a confidence meter" | Confidence is a mandated AI Doctor output field |
| #80 Approval-required queue | "user must click Approve" | Action Queue is approval-required **by constitution**, and shipped (345 files touch it) |
| #97 Cmd+K omni-search | "build a command palette" | `GlobalSearchDialog.tsx` + `ui/command.tsx` |
| #98 Export to PDF | "format the diary to PDF" | `grow-diary-pdf-export.test.ts`, `PostGrowLearningReportCards.tsx` |
| #99 Metric/Imperial toggle | "toggle unit systems" | `formatTemperatureDisplay` and the unit-preference layer, consumed app-wide |

`practical observation`: prompts 71–80 read as a description of the AI Doctor Verdant
already has. The 4-agent pipeline framing (#72) is a **UI animation** prompt, not an
architecture prompt — it would render a fake pipeline over the real single call. Skip it.

---

## 3. The constraint that should drive selection: migrations do not auto-apply

This is the most important operational fact for anyone sending prompts to Lovable, and
it is the reason my picks are ranked by schema cost rather than by feature appeal.

`established fact`, recorded in `docs/agents/CURRENT_STATE.md`: **publishing deploys the
frontend and edge functions only. It does not replay `supabase/migrations/`.** Migrations
reach production solely through an operator apply.

The consequence is a specific and nasty failure shape, and it has already happened twice:

- A prompt that needs a new table produces UI that **ships immediately** and a migration
  that **does not**.
- The shipped UI then queries a table that does not exist in production.
- Verdant's own hooks swallow that error — `useQuickLogRevisionBadges` does
  `if (error) return new Map();`. `established fact`, verified in source.
- Result: **the feature looks shipped, renders nothing, and raises no alarm.** No crash,
  no error surface, no telemetry.

That is exactly how Quick Log revision badges were invisible in production for weeks, and
it is worse than a loud failure because nothing tells you to look.

**Therefore:** prefer prompts computable from data Verdant already stores. Seven of my
eight Tier-1 picks require **zero new tables**, which is why they can actually reach a
grower. That is the selection filter, not polish.

---

## 4. The cherry-picked pack

Ranked. Each entry gives the reason, the rewritten prompt (brownfield-safe), and the
guardrail. Prompts are rewritten because the originals assume an empty project.

Absence claims below were re-measured at `cff3efd`; the exact search terms are recorded
so anyone can reproduce them.

### Pick 1 — #82 Yield Analytics (g/W and g/sq ft) · **zero new schema**

**Why this is the single highest-leverage prompt in the list.** Both operands already
exist in the database and nothing multiplies them. `established fact`: `wet_weight_grams`
and `dry_weight_grams` are captured in `quickLogActivityTypes.ts` and
`harvestCureQuickLogPersistencePayload.ts`; tent wattage is captured via
`EditTentDialog.tsx`. Search for `gramsPerWatt|gPerWatt|gramsPerSquare|yieldEfficiency`
returns **zero hits at `cff3efd`.**

Verdant records everything needed to answer *"did this grow actually work?"* and then
never answers it. That is the product promise — *Plant memory. Sensor truth. Better
decisions.* — stopping one arithmetic step short of the payoff.

> **Prompt:** In the existing Verdant codebase, add a pure module
> `src/lib/yieldEfficiencyRules.ts` that derives harvest efficiency from data already
> stored: grams per watt (dry weight ÷ tent light wattage) and grams per square foot (dry
> weight ÷ tent footprint), plus wet-to-dry conversion ratio. Read `dry_weight_grams` /
> `wet_weight_grams` from existing harvest Quick Log activity payloads and wattage and
> dimensions from the existing tent record. Return a typed, null-safe result with an
> explicit status when any operand is missing — never substitute a default. Render it as
> a presenter-only card on the existing post-grow report surface. Add unit tests for the
> happy path, missing wattage, missing dry weight, zero-value guards, and unit conversion.

**Guardrail:** logic in `src/lib/*Rules.ts`, not JSX. A missing operand must render
`NOT_MEASURED`, never `0` and never an estimate — a fabricated g/W is fake data about a
real harvest.

### Pick 2 — #66 + #64 pH Drift and Runoff Differential · **zero new schema**

**Why:** root-zone correctness is priority #2 in the constitution's own cultivation
ordering, behind only environmental stability. `established fact`: runoff pH/EC capture
already exists (`QuickLogWateringForm.tsx`, `StructuredWateringEntry.tsx`,
`TentIrrigationHistoryPanel.tsx`); searching `runoffDifferential|runoff_delta|phDrift|
rootZoneDrift` returns **zero hits at `cff3efd`.** Growers are already entering the
numbers and getting nothing back.

Input-vs-runoff divergence over time is the single most diagnostic cultivation signal a
diary can compute. It catches salt buildup and lockout *before* the leaves show it —
which is the difference between a diary and a decision tool.

> **Prompt:** Add a pure module `src/lib/rootZoneDriftRules.ts` that computes, from
> existing irrigation entries, the input-vs-runoff differential for pH and EC per event
> and the trend across the last N events. Then add a presenter-only chart to the existing
> tent irrigation history panel plotting input pH against runoff pH on a shared time axis,
> using the project's existing Recharts setup. Classify drift into stable / drifting /
> diverging bands using thresholds defined in `src/constants`, never inline in JSX.
> Where an entry lacks runoff data, exclude it from the trend and show the excluded count.
> Do not add nutrient or irrigation recommendations.

**Guardrail:** compute and display; **do not advise.** `AGENTS.md` forbids nutrient or
irrigation change recommendations from weak evidence. Drift math is evidence; the
prescription is not this slice's to make.

### Pick 3 — #49 Duplicate Previous Day · **zero new schema · now has a measured target**

**Why, and this got stronger in revision 2.** `established fact`: searching
`duplicatePrevious|copyPreviousDay|repeatLast|sameAsLast` returns **zero hits at
`cff3efd`** — no repeat shortcut exists. Daily logging is where diary apps die: a grower
who must retype the same feed for the fourth night stops logging, and a diary with gaps
cannot support AI Doctor context.

**What changed:** #1039 landed the **B0a interaction-counter harness** and a measured
baseline at `docs/one-tent-loop-efficiency-baseline.md`. Its scenario table names
**S5 — "Global/mobile entry → repeat the last valid target"** at **≥5 interactions and
1+ target reselections** — the most expensive row in the whole table. That is precisely
what this pick attacks, so the win can now be *measured* rather than asserted.

Read the evidence class carefully: `established fact` that **S1a and S7 are automated and
passing (2/2)** in `e2e/one-tent-loop-interaction-counter.spec.ts`. **S5 is a documented
estimate in the table, not a runtime receipt** — no automated scenario drives it yet.

> **Prompt:** Add a "Same as last time" action to the existing Quick Log form that
> pre-fills the current draft from the grower's most recent entry of the same activity
> type for the same plant. Pre-fill only; the grower must still review and submit. Stamp
> the new entry with its own real timestamp — never copy the source timestamp. Persist
> exclusively through the existing `quicklog_save_manual` path; do not add a new write
> path or RPC. Show clearly which entry was used as the source. Then extend
> `e2e/one-tent-loop-interaction-counter.spec.ts` with an S5 scenario that counts the
> repeat-target journey before and after, and update the S5 row in
> `docs/one-tent-loop-efficiency-baseline.md` with the measured result.

**Guardrails, two of them:**

1. `quicklog_save_manual` is the **single sanctioned manual write path**
   (`docs/specs/one-tent-loop-quicklog-single-write-path.md`). A builder asked to
   "duplicate an entry" will reach for a direct insert. It must not.
2. **This is now the highest-collision pick of the eight** — see §7. The Quick Log path
   is under active B-series editing (`quickLogSaveErrorMessage.ts`,
   `quicklogManualDiagnosticsRules.ts` both changed at `cff3efd`). Confirm ownership
   before sending.

### Pick 4 — #4 Night Mode · **zero new schema · RENAMED in revision 2**

**Why I like this one disproportionately:** it is the only prompt in 100 that shows real
grow-room empathy. Opening a bright phone inside a tent during lights-off is a genuine
horticultural problem, not a UI preference — it disturbs the dark cycle and destroys the
grower's night vision. `established fact`: `stealth` and `nightVision` both return **zero
hits at `cff3efd`**, and no dark-adapted palette exists.

**⚠️ Name collision found in revision 2 — this is why the prompt is renamed.**
`established fact`: **`src/pages/GrowRoomMode.tsx` and `src/lib/growRoomModeRules.ts`
already exist**, with a legacy `/grow-room` route. They are a **read-only multi-tent
operator view** — aggregated tent cards, alerts, pending Action Queue items — and do
**no theming or palette work whatsoever**. The *feature* I recommend is still absent, but
prompt #4's original wording ("a 'Grow Room / Stealth Mode' toggle") would point a builder
straight at a substantial existing page. Revision 1 repeated that wording and was wrong to.

> **Prompt:** Add a **"Night Mode"** toggle to the existing app header that switches the
> UI to a dark-adapted low-luminance palette — deep red/amber foreground on near-black,
> reduced overall brightness, no white surfaces, no bright accent green. Implement it
> through the project's existing theming tokens rather than by overriding component
> colors. Persist the preference locally. **Do not modify `src/pages/GrowRoomMode.tsx`,
> `src/lib/growRoomModeRules.ts`, or the `/grow-room` route — that is an unrelated
> existing multi-tent operator view, not this feature.** Keep all text at accessible
> contrast within the dark-adapted palette.

**Guardrail, sharpened by direct source reading:** this palette removes green *and* leans
red. `established fact`: existing severity styling already uses amber for `warning`/`stale`
and **red for `critical`** (`GrowRoomMode.tsx` lines 84–86, `bg-red-500/15
text-red-300`). A red-dominant night palette therefore collides with the colour that
currently means *critical*. Every status indicator must stay distinguishable under the
night palette, or a stale sensor can read as healthy — a Hard Safety Rule violation
arriving through a theme.

### Pick 5 — #59 + #53 Synced Chart Cursor and Mobile Zoom · **zero new schema**

**Why:** near-free and disproportionately effective. `syncId` is a built-in Recharts prop;
`syncId|<Brush|zoomDomain` returns **zero hits at `cff3efd`**. Verdant already renders
multiple charts (`SensorChart.tsx`, `ui/chart.tsx`). Linking their cursors turns separate
graphs into one instrument, which is how a grower actually reads *"the humidity spike and
the watering happened together."*

> **Prompt:** Link the existing environment and irrigation charts so hovering a point on
> one highlights the same timestamp on all others, using Recharts' `syncId`. Add
> drag-to-pan and pinch-to-zoom over the time axis for touch devices, and a 24H / 7D / 30D
> / Full Cycle range selector that changes the domain without refetching. Do not change
> any data-fetching or aggregation logic.

**Guardrail:** presentation only. Zoom must never resample or average away a data point —
see Pick 6 for why that matters.

### Pick 6 — #60 REWRITTEN: Suspect Reading Flag (**not** "Ghost Data Filter")

**Why it is in the pack:** the underlying need is real — anomalous sensor spikes do wreck
chart averages. **Why it must be rewritten:** as written, prompt #60 asks to "visually
smooth out extreme anomalous sensor spikes (like 0% humidity)." That directly violates the
Hard Safety Rule *"Bad or unknown telemetry must never be shown as healthy,"* and
humidity stuck at 0 is on the constitution's own explicit list of suspicious-telemetry
patterns.

A humidity sensor reading 0% is not noise to be smoothed. It is **a broken sensor**, and
hiding it produces a clean-looking chart of a grow room nobody is actually monitoring.
That is the most dangerous single prompt in the 100.

`established fact` at `cff3efd`: `suspectReading|flagSuspect|anomalyFlag` returns exactly
**one** file — `supabase/functions/payments-webhook/orchestrator.ts`, which is billing
anomaly handling and unrelated to telemetry. **No sensor-side suspect-reading flag
exists.** (Revision 1 reported a flat zero; the single match is real but out of domain.)

> **Prompt:** Add a pure module that flags suspect sensor readings using the project's
> documented suspicious-telemetry patterns — humidity or soil moisture pinned at 0 or 100,
> pH outside a realistic range, unit-scale mismatches, and readings older than a freshness
> threshold. Flagged readings must remain **visible** on the chart, rendered in a distinct
> "suspect" style with an explicit label, and must be **excluded from computed averages
> with the excluded count shown**. Add a sensor-health summary stating how many readings
> were flagged and why. Never delete, smooth, interpolate, or hide a flagged reading, and
> never let a flagged reading contribute to a healthy status.

**Guardrail:** the inversion is the whole point. Flag and surface; never smooth.

### Pick 7 — #39 + #40 Plant-Tag QR · **zero new schema**

**Why:** `established fact` — QR infrastructure exists but only for customer guides
(`CustomerGuideQrBlock.tsx`); `plantQr|PlantQrTag|qrScanner|QrScanner` returns **zero hits
at `cff3efd`**. Nothing generates or scans a **plant** tag. The physical-to-digital bridge
is a real grow-room win: a grower with wet hands and eight identical fabric pots scans one
and lands on the right plant instead of guessing.

> **Prompt:** Add a printable QR tag for an existing plant that encodes the plant's
> in-app route, sized for a pot label, using the project's existing QR generation
> approach. Add a camera-based scanner view that resolves a scanned tag to that plant's
> existing detail page. The scanner performs navigation only — it must not create,
> mutate, or log anything, and it must fail gracefully on an unrecognized or foreign code.

**Guardrail:** encode the route, not grower or account identifiers — a printed tag is a
physical object that leaves the room.

### Pick 8 — #63 Save Nutrient Recipe · **requires new schema — sequence last**

**Why it is last despite being genuinely good:** `recipeTemplate|savedRecipe|feedTemplate|
nutrientMix` returns **zero hits at `cff3efd`**, and the repetitive-entry pain is real.
But it is the **only** pick needing a new table, which per §3 means UI that ships and a
migration that does not. Ship it local-first so it degrades honestly.

> **Prompt:** Let a grower save the current nutrient mix from the existing feeding form as
> a named template and load it into a later entry. **Phase 1: persist templates in local
> storage only**, clearly labeled as device-local and not synced. Loading a template
> pre-fills the form for review; it never submits. Do not add a database table, migration,
> or RPC in this phase.

**Guardrail:** cross-device sync needs a table, and a table needs an operator apply. Do
not let a builder quietly add one.

---

## 5. Do not send — with reasons

### 5.1 #96 Stripe checkout — **the most dangerous prompt in the list**

`established fact`, re-measured at `cff3efd`: Verdant runs on **Paddle**, not Stripe —
**233** Paddle references against **20** Stripe references, and five live edge functions
(`paddle-webhook`, `payments-webhook`, `checkout-status`, `get-paddle-price`,
`paddle-portal-session`). Counts unchanged from revision 1.

Prompt #96 says *"Implement a Stripe checkout modal UI."* Sending it would introduce a
**second payment provider into a live billing system.** Best case it is dead code; worst
case it produces a checkout path that takes money without ever reaching the
`public.subscriptions` entitlement source of truth — a grower charged for access they
never receive.

`AGENTS.md` independently forbids it: *"Do not add checkout, webhook, provider SDKs,
pricing copy, PaywallCta edits, or UI gating unless specifically requested."*

### 5.2 Prompts 11–20 (schema and state) — would fork the data model

These would have a builder create `Plants`, `DiaryEntries`, `Photos`, and
`WateringAndFeeding` tables. Verdant already has `plants`, `tents`, `grows`,
`diary_entries`, `grow_events`, and `quicklog_entry_revisions`, reached through one
sanctioned write path. A parallel schema is unrecoverable damage, not a bad afternoon.

**#18 (dummy data)** is salvageable only with source labeling — `demo` is a legal source
label; unlabeled seeded data presented as live is a Hard Safety Rule violation. A demo
surface already exists at `/internal/demo-proof-walkthrough`.

### 5.3 Prompts 85–90 (Verdant Cup, community feed, blind voting, public diaries)

Deferred by the constitution in as many words: *"Do not expand into community,
competitions, public mode … until the One-Tent Loop is clean, safe, and tested."* It is
not yet — a signup-attribution outage is open and two migration drifts are on record.

**#88 (publish diary) additionally carries data-leak risk.** "Sanitizes a plant's timeline
(removing private data)" is an RLS and redaction design problem, not a prompt. It needs a
specification and a security review, not a builder.

### 5.4 #48 Batch Log — good idea, wrong delivery

Zero hits and genuinely useful for a tent of clones. But applying one entry to many plants
is a **write-path change**, and this repo has exactly one sanctioned manual write path. A
builder will implement it as a loop of direct inserts. Spec first, then implement.

### 5.5 #79 AI feedback — keep the widget, drop the claim

Thumbs up/down on a diagnosis is genuinely valuable (zero hits). But *"to simulate
reinforcement learning"* must go: nothing would be learning, and describing it that way to
growers is a false claim about how their data is used. Frame it as outcome capture —
*"did this resolve the issue?"* — which is honest and more useful anyway.

### 5.6 #94 Next Door Cannabis portal

`AGENTS.md`: *"Verdant is not tied to Next Door Cannabis unless explicitly requested."* A
partial customer surface already exists (`src/components/customer/`). Needs an explicit
owner decision on positioning before any build.

---

## 6. Suggested sequence

One prompt per session, verified before the next. Revision 2 **moves Pick 3 later** — not
because its value dropped (it rose) but because the Quick Log path is now the busiest
collision surface in the repo. Picks 1, 2 and 4 are the safest high-value starts.

```text
1. #82  Yield analytics          (zero schema · answers "did it work?")
2. #66  pH drift / runoff        (zero schema · root-zone truth)
3. #4   Night Mode               (zero schema · zero collision · RENAMED)
4. #59  Synced charts + zoom     (zero schema · near-free)
5. #60R Suspect reading flag     (zero schema · safety-inverted)
6. #39  Plant-tag QR             (zero schema · physical bridge)
7. #49  Duplicate previous day   (zero schema · HIGH collision — clear ownership first)
8. #63  Nutrient recipe          (LOCAL-FIRST · schema gated)
```

---

## 7. Collision boundaries — updated at `cff3efd`

`established fact` from `CURRENT_STATE.md` plus the `77d8eec..cff3efd` diff:

- **Tranche A items A2–A5 remain Codex-owned and unopened.** Their edit points —
  `oneTentLoopNavigationRules.ts`, Action Queue rows/drawer, Alert detail, Sensors source
  summary, post-save freshness — are collision boundaries.
- **Tranche B+ is now actively landing, which is new since revision 1.** #1039 (B0a) and
  #1047 (B4a) both merged. The live B-series surface is:
  `src/lib/doctorStartContextRules.ts`, `src/pages/AiDoctorStart.tsx`,
  `src/pages/QuicklogDiagnostics.tsx`, `src/lib/quickLogSaveErrorMessage.ts`,
  `src/lib/quicklogManualDiagnosticsRules.ts`, `src/lib/quicklogPrivateHelperGrantRules.ts`,
  and the e2e harness (`countedDriver.ts`, `interactionCounter.ts`,
  `mockedOneTentWorld.ts`, `one-tent-loop-interaction-counter.spec.ts`).
- **Owner decision D4 (Sensors→Doctor context carry) is now partly implemented** by B4a's
  `resolveDoctorStartScope` / `partitionDoctorEntryOptionsByTent`. Treat the Doctor entry
  path as owned.
- **PRs #828, #817, #696 are open and parked.** Do not start a competing Timeline, Alerts,
  or Action Queue UI rewrite. This is why no Timeline-surface prompt is in the pack.

**Overlap check for the eight picks, run at `cff3efd`:** only **Pick 3** touches a file
family the B-series is actively editing (the Quick Log save path). Picks 1, 2, 4, 5, 6, 7
and 8 land outside every boundary above.

---

## 8. Unknowns and blocked items

| Item | Status |
| --- | --- |
| Chart event annotations (#57) already present? | `uncertainty` — `ReferenceLine`/`annotation` matches many unrelated files. Verify before sending |
| Carbon filter countdown (#25), canopy layout (#26) | `established fact` absent; both need schema — deferred by §3, not by value |
| S5 interaction cost (Pick 3's target) | `source claim` — a documented estimate in the baseline table (≥5, 1+ reselections), **not** a runtime receipt. Only S1a and S7 are automated (2/2 PASS) |
| Production applied-migration ledger | `NOT_MEASURED` — drift probe has never completed a query |
| Whether any pick is already in an unopened branch | `uncertainty` — open PRs and the merged history are clear; unopened work by other agents is not observable |
| Live production verification of any pick | `BLOCKED` — agent sessions cannot reach production (network policy 403) |

---

## 9. Verdict

`inference`, high confidence, from a direct audit of the shipping branch at `cff3efd`:

**The list's value is as a backlog, not a build order, and its best ideas are the ones it
treats as afterthoughts.** Prompt #82 — buried at position 82 of 100 — is worth more than
prompts 1 through 20 combined, because Verdant already stores every number it needs and
has never once multiplied them. Meanwhile the first twenty prompts, the ones framed as
"foundation," would do the most damage, because Verdant's foundation is already poured.

Two items should not be sent in any form: **#96 (Stripe)**, which would put a second
payment provider into a live Paddle billing system, and **#60 as written**, which would
teach the app to hide broken sensors. #60 is included here only in inverted form.

The re-audit changed two entries materially and neither was cosmetic: prompt #4's own
wording pointed at an existing page, and prompt #49 turned out to have a named,
measured target it can be held to. Both corrections came from re-reading source at the
new ref rather than trusting the previous revision — which is the argument for re-pinning
this document whenever the deploy branch moves.

I remain unconfident about one thing and will not pretend otherwise: **whether any of
these eight are sitting in an unopened branch belonging to another agent.** Merged history
and open PRs are clear; unopened work is not observable from here. Confirm before sending.

---

## 10. Revision 2 changelog

Re-audited `77d8eec` → `cff3efd`. What changed:

| Item | Revision 1 | Revision 2 |
| --- | --- | --- |
| Audited ref | `77d8eec` | `cff3efd` |
| Scale figures | "131 pages, 270 migrations, 35+ edge functions" | **129 page components, 270 migrations, 34 edge functions** (revision 1 counted directory entries, including `_shared` and 2 non-`.tsx` files) |
| **Pick 4** | "Grow Room Mode" toggle | **Renamed "Night Mode"** — `src/pages/GrowRoomMode.tsx` already exists as an unrelated read-only multi-tent operator view. Guardrail sharpened with the actual `red-500` = critical badge collision |
| **Pick 3** | Efficiency argument only | Anchored to **S5** in the new B0a baseline (≥5 interactions, 1+ reselections); prompt now asks to extend the counter harness and update the baseline row. Also flagged as the **highest-collision** pick and moved to position 7 in the sequence |
| **Pick 6** | "zero hits" | Exactly one hit, in `payments-webhook/orchestrator.ts` (billing anomaly, out of domain). Sensor-side still absent |
| Collision boundaries | Tranche A + parked PRs | Adds the **live Tranche B+ surface** (B0a, B4a) and notes D4 is now partly implemented |
| Sequence | Pick 3 at position 3 | Pick 3 moved to position 7 behind the collision warning |
| Everything else | — | Re-verified unchanged: all 14 already-ships rows still ship; Paddle 233 / Stripe 20 unchanged; Picks 1, 2, 5, 7, 8 still return zero hits |
