# QuickLog Gate 1 — Friction Audit

Audit of Verdant's 30-second QuickLog path. The Relative Cultivation Timeline
foundation (docs + pure rules) is shipped; the visual timeline must wait until
this gate is **clean and regression-protected**.

Audit type: **read-only review.** No QuickLog write payloads, no Daily Grow
Check calculation, no sensor ingestion, no Action Queue, no automation, no
device control, no RPC, no `service_role` was touched.

---

## Entry points inventoried

| # | Surface                                | File                                              | Route pattern                                                          | Method hint |
| - | -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1 | Dashboard Daily Check quick actions    | `src/components/DashboardDailyGrowCheckPanel.tsx` | `/daily-check?plantId=…&from=dashboard&method=note\|sensor`            | note, sensor |
| 2 | Plants page Daily Check quick actions  | `src/pages/Plants.tsx`                            | `/daily-check?plantId=…&from=plants&method=note\|sensor`               | note, sensor |
| 3 | Plant Detail consistency quick actions | `src/components/PlantDailyGrowCheckConsistencyCard.tsx` | `/daily-check?plantId=…&from=plant-detail&method=note\|sensor`     | note, sensor |
| 4 | Plant Detail header CTA                | `src/pages/PlantDetail.tsx`                       | `/daily-check?plantId=…&from=plant-detail`                             | none (lets user choose) |
| 5 | Plant Detail history card CTA          | `src/components/PlantDailyGrowCheckHistoryCard.tsx` | `/daily-check?plantId=…&from=plant-detail`                           | none |
| 6 | Generic `/daily-check?plantId=<id>`    | `src/pages/DailyCheck.tsx`                        | `/daily-check?plantId=…`                                               | optional |
| 7 | Dashboard top CTA                      | `src/pages/Dashboard.tsx`                         | `/daily-check`                                                         | unscoped — picks plant on page |
| 8 | Grow Room Mode CTA                     | `src/pages/GrowRoomMode.tsx`                      | `/daily-check`                                                         | unscoped |
| 9 | Mobile nav More-sheet                  | `src/components/MobileNav.tsx`                    | `/daily-check`                                                         | unscoped |
| 10 | Status card CTA                       | `src/components/DailyGrowCheckStatusCard.tsx`     | `/daily-check`                                                         | unscoped |

All scoped entries route through `buildDailyCheckEntryHref(...)` or an
equivalent literal that includes `plantId` + `from`. All quick-action entries
include a `method` hint (`note` or `sensor`); generic CTAs intentionally omit
`method` so the grower picks on the page.

---

## Evaluation against the friction checklist

| # | Criterion                                              | Status | Notes |
| - | ------------------------------------------------------ | ------ | ----- |
| 1 | Time-to-log path clarity                               | OK     | Quick-action chips ("Add note", "Add sensor snapshot") land directly on the right step. |
| 2 | Tap count entry → submit                               | OK     | Quick-action surfaces: 2 taps (chip → submit). Generic surfaces: 3–4 (pick plant → method → submit). |
| 3 | Plant prefilled correctly                              | OK     | `resolveDailyCheckPlantSelection` honors `plantId`, falls back to user-owned plants only. |
| 4 | Grow/tent context clear                                | OK     | `PlantStatusStrip` and tent badge shown on entry. |
| 5 | Note vs sensor methods obvious                         | OK     | Method chips render with icons; route applies `method=` exactly once. |
| 6 | No-tent sensor guard clear                             | OK     | `ManualSensorReadingCard` shows safe no-tent message; covered by existing tests. |
| 7 | Success confirmation clear                             | OK     | `DAILY_CHECK_SUCCESS_TITLE` / `_BODY` rendered post-submit with timestamp. |
| 8 | Return path matches source                             | OK     | `buildDailyCheckPostSubmitActions` honors `from=plant-detail \| plants \| dashboard`. |
| 9 | Logged-at time appears                                 | OK     | Post-submit card shows formatted timestamp; consistency card mirrors method. |
| 10 | Dashboard / Plants / Plant Detail refresh after submit | OK     | `daily-grow-check:refresh` + `plants:refresh` events wired; covered by `daily-check-refresh.test.tsx`. |
| 11 | Mobile layout usable in grow room                     | OK     | Chips meet 44px touch target; sticky bottom action bar present on `/daily-check`. |
| 12 | Copy short and non-technical                          | OK     | "Add note", "Add sensor snapshot", "Review whether…" — covered by mobile-copy-pass test. |
| 13 | No silent wrong-plant pick                            | OK     | `resolveDailyCheckPlantSelection` returns `invalid` instead of falling back. |
| 14 | Invalid/out-of-scope `plantId` blocked                | OK     | Out-of-scope plant renders `EmptyState`, not the form. |
| 15 | No fake local checked state                           | OK     | Quick-action chips are `<Link>` only; no optimistic `setChecked`. |

---

## Findings

- **No blocking defects found.** All scoped entry points carry `plantId` +
  `from` + (where appropriate) `method`. Out-of-scope plant IDs are rejected
  upstream of the form. No quick-action surface fakes a checked state.
- **No QuickLog write payload was touched.** No persistence, schema, RPC, or
  ingestion change was made.
- **No calendar / reminder / notification / email creep detected** in the
  audited surfaces.

No code change was required. This audit pins the contract via a static
contract test (`src/test/quicklog-gate-1-friction-audit.test.ts`).

---

## Verdict

**QuickLog Gate 1 is ready** for visual-timeline work to begin in a follow-up
task, with these prerequisites still respected:

- Daily Grow Check calculation basis unchanged.
- Manual sensor advisor / review step / change context / history list
  unchanged.
- Relative Cultivation Timeline foundation untouched.

The visual timeline can be approached as a strictly read-only projection of
existing Quick Logs, photos, manual snapshots, AI Doctor output, and
approval-required Action Queue items — anchored to `plantStartedAt` /
`stageStartedAt` via the pure helpers already shipped in
`src/lib/relativeStageTimelineRules.ts`.
