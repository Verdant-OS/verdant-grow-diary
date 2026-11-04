# First viewport: the task before the explanation

Status: draft spec, needs founder decisions D1 to D4 (§6). Spec only, no application code.
Source: live grower audit 2026-11-03, finding 2, the parts that are still open, and the layout
half of finding 11.
Measured on the deploy branch `verdant-grow-diary` at `c03f64a`.

## 1. Problem

The audit found that several pages explain the workflow before letting the grower do it:

- **Timeline:** the first viewport shows a next-step banner, a history-limit warning, a title and
  a stage progression. No diary entry is visible.
- **AI Doctor:** the most prominent first call to action is "Review alerts". It sits above
  choosing a plant and running a review.
- **Action Queue:** with zero actions, the first viewport is two intro banners, a heading, scope
  text, filters and pagination.
- **Reports:** the page opens with "No priority review items", "No completed actions", "No
  grouped patterns" and "No recorded outcomes". The cards that do have data come later.

Already fixed or in review:

- The tent next-step dead end, in https://github.com/Verdant-OS/verdant-grow-diary/pull/2819.
- The Reports link to the diary range report, in
  https://github.com/Verdant-OS/verdant-grow-diary/pull/2825.

## 2. Root causes (source-traced)

### 2.1 Timeline: about 25 blocks render before the first entry

`src/pages/Timeline.tsx`, top-level render from line 2273. In render order:

| Line      | Block                                                                                                                | Renders when                       |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 2275      | `GrowBreadcrumbs`                                                                                                    | always                             |
| 2283      | `OneTentLoopNextStepCard` (the "next-step banner")                                                                   | `pageReadView.showSensorsNextStep` |
| 2308      | partial-read warning                                                                                                 | a source failed                    |
| 2335      | `timeline-manual-history-limit` (the "history-limit warning")                                                        | manual sensor history was capped   |
| 2350      | `PageHeader` (title)                                                                                                 | a grow is active                   |
| 2360–2416 | stage-tagged count + `timeline-stage-progression-scroll`                                                             | a grow is active                   |
| 2417      | unstaged Quick Log note                                                                                              | grow events exist                  |
| 2428      | `PhenoHuntTimelineSection`                                                                                           | URL grow                           |
| 2431      | `ScopedGrowBanner`                                                                                                   | URL grow                           |
| 2443–2650 | evidence filters: search, plant, tent, event type, dates, missing-action, entitlement notices, sensor-source toggles | always / per entitlement           |
| 2651      | results count, load older                                                                                            | always                             |
| 2784–2836 | eight `FilterChip`s                                                                                                  | always                             |
| 2847–2874 | range report and environment summary links                                                                           | always                             |
| 2881      | `TimelineCsvContextGate`                                                                                             | CSV context                        |
| 2891      | `RecentQuickLogActivityPanel`                                                                                        | always                             |
| 2903      | `DiaryCalendarSection`                                                                                               | always                             |
| 2913–2965 | Watering, Feeding, Pest/Disease, Training, Measurement and Photo history panels                                      | always                             |
| 2978–2979 | Action Queue and alert event sections                                                                                | always                             |
| ~2985     | entries feed / `TimelineEmptyState`                                                                                  | — the principal content            |

### 2.2 AI Doctor: the next-step card sits above the plant picker

`src/pages/AiDoctorStart.tsx`, render from line 182: `PageHeader` (184), then
`OneTentLoopNextStepCard current="ai-doctor"` (198), then `DoctorGrowNextStepsCard` (208), then
the review section with the plant options (`ai-doctor-start-options`, 301).

For `ai-doctor`, `resolveOneTentLoopNextStep` in `src/lib/oneTentLoopNavigationRules.ts:275-281`
points at the next loop step, Alerts. With no `alertId` it relabels the call to action
"Review alerts". So the page's first button leaves the page before the grower has run a review.

### 2.3 Action Queue: framing renders before the empty state

`src/pages/ActionQueue.tsx`, render from line 1008:

1. `GrowBreadcrumbs` (1010)
2. the landing box `one-tent-loop-action-queue-landing` (1046): "Approval-required Action Queue",
   a subtitle, and "Verdant suggests. Grower approves."
3. `OneTentLoopNextStepCard` (1069)
4. `PageHeader` with refresh and last-updated (1080)
5. the grow-context hint (1129)
6. `ScopedGrowBanner` (1148)
7. the status filters (1230)
8. pagination (1324)
9. the empty state `action-queue-empty-pending` (1485)

The landing box and the page header both name the page, which is the audit's "two intro
banners".

### 2.4 Reports: cards render in a fixed order

`src/lib/reportsHubViewModel.ts` builds five cards in this fixed order:

1. `action_outcome_learning` (98)
2. `recent_outcomes` (115)
3. `environment_alerts` (137)
4. `sensor_context` (152)
5. `timeline_activity` (168)

The first two are learning cards. They show "No grouped patterns yet" and "No recorded outcomes
yet" when empty. Above them, `src/pages/Reports.tsx` renders the review queue, which shows
`REPORTS_REVIEW_QUEUE_EMPTY_COPY` ("No priority review items…",
`src/lib/reportsHubReviewQueue.ts:238`), and the follow-up review section. The cards with data,
Sensor Context and Timeline Activity, come last.

## 3. Safety fences (must hold in any option)

- **F1:** no failed, partial or stale read is hidden. The partial-read warning (Timeline 2308),
  the history-limit warning (2335) and the RPC-unavailable banner (Action Queue 1016) stay at the
  top. Truth notices are not explanations.
- **F2:** "approval-required" stays visible on Action Queue, in the header or the empty state. The
  Action Queue never reads as automatic.
- **F3:** AI Doctor never starts a review on its own and never preselects a plant. Moving
  "Review alerts" changes position only, not behaviour.
- **F4:** no remembered target. These are layout changes only. Target selection rules are
  unchanged.
- **F5:** sensor source labels and the source legend stay wherever sensor values show.

## 4. Requirements

- **R1:** on each of the four pages, the principal task or an honest empty state is reachable
  without scrolling at 390 × 844 (phone) and 1280 × 800 (desktop). Measure with Playwright
  `chromium-mocked`.
- **R2:** permanent journey framing (the One-Tent Loop next-step card, landing boxes) moves below
  the principal content, or into a compact one-line form above it, per D1.
- **R3:** the truth notices from F1 keep their current position and wording.
- **R4:** per D2, AI Doctor's first visible control is choosing a plant or starting a review.
- **R5:** per D3, Action Queue folds its landing box into the page header. When it has zero
  actions, it hides filters and pagination and shows one empty state that says the queue is
  approval-required.
- **R6:** per D4, Reports orders cards so that cards with data come first. Ties keep today's
  order. Empty learning cards and the empty review queue collapse into one compact "Not enough
  data yet" group.
- **R7:** Timeline's per-type history panels (2913–2965) collapse behind one "History by type"
  disclosure, closed by default. Diary entries come right after the filters.

## 5. Out of scope

- The unified Timeline stream (finding 5).
- Merging capture flows (finding 9).
- Contrast and keyboard work (finding 12).
- Any change to the Quick Log write path or target rules.

## 6. Founder decisions

- **D1, the next-step card:** (a) move it below the principal content on all three pages, or
  (b) keep it on top as a single compact line. Recommendation: **(a)**. The card points away from
  the page, and the audit's complaint is that it comes first.
- **D2, AI Doctor's "Review alerts":** (a) hide the next-step card on `/doctor` until a review
  has finished, or (b) keep it below the plant options per D1. Recommendation: **(b)**. It is
  simpler and consistent with D1.
- **D3, the Action Queue landing box:** (a) fold it into the page header subtitle, keeping "Verdant
  suggests. Grower approves.", or (b) keep it but show it only when the queue has actions.
  Recommendation: **(a)**. It removes the duplicate heading and keeps F2 in every state.
- **D4, Reports order:** (a) sort cards with data first and collapse the empty ones into one
  group, or (b) keep the fixed order and only collapse the empty review queue. Recommendation:
  **(a)**. It matches the audit and still shows the empty learning features, just compactly.

## 7. Acceptance tests

1. Timeline at 390 × 844 with 253 entries: the first entry card is within the viewport; the
   history panels are closed under "History by type". (R1, R7)
2. Timeline with a capped manual history and a partial read: both notices stay above the
   entries. (R3, F1)
3. `/doctor` with an active grow and plants: the plant options come before any "Review alerts"
   control in document order. (R4, D1, D2)
4. `/doctor`: no review starts and no plant is selected on load. (F3)
5. Action Queue with zero actions: one heading, no pagination, no filters, and an empty state
   that contains "approval". (R5, F2)
6. Action Queue with actions: filters and pagination are back; "Verdant suggests. Grower
   approves." is visible. (F2)
7. Reports with 253 entries, 81 readings and no outcomes: Timeline Activity and Sensor Context
   come before the learning cards; the empty learning cards and the review queue sit in one
   collapsed group. (R6)
8. Reports, a tie: with every count at zero, the order matches today's. (R6)
9. Sensor source labels still render on Timeline entries. (F5)

## 8. Test pins to renegotiate

- `src/test/action-queue-ux.test.ts:125-134` reads the page source between the filters and
  `action-queue-pagination` and `action-queue-no-results`. R5 moves or conditions those blocks, so
  this pin must follow the new structure in the same commit, as a declared renegotiation.
- The other top-of-page testids have no order pins. They are checked by presence only:
  `one-tent-loop-action-queue-landing` in 2 files, `timeline-stage-progression-scroll` in 2, and
  `ai-doctor-start-one-tent-loop-next-step-card` and `reports-card-*` in 1 each. Keep the testids.

## 9. File plan (implementation slices, after D1 to D4)

1. Reports order and empty group: `src/lib/reportsHubViewModel.ts` (pure sort with stable
   tie-break), `src/pages/Reports.tsx`, a new test.
2. Action Queue header and empty state: `src/pages/ActionQueue.tsx`, the copy constant, the
   renegotiated pin.
3. AI Doctor next-step card position: `src/pages/AiDoctorStart.tsx`, a new order test.
4. Timeline "History by type" disclosure and next-step card position: `src/pages/Timeline.tsx`, a
   new test, and a Playwright viewport check.

Each slice is its own PR, and the order above runs from smallest to largest.
