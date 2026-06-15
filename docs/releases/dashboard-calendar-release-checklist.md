# Dashboard + Diary Calendar Release Checklist

## Release summary

This batch streamlines the Dashboard daily-check surface and ships a read-only diary calendar on Timeline. The goal is a clearer One-Tent Loop entry point and an at-a-glance view of grow rhythm (watering, feeding, diagnosis) grouped by date.

## What improved

- **Dashboard**: one clear daily grow-check surface
  - Removed redundant “Set your daily grow loop” onboarding card
  - Kept “Daily Grow Check” / “Start Check” as the single entry point
- **Diary Calendar** (read-only) added to Timeline
  - Groups watering, feeding, and diagnosis events by UTC date
  - Safe expanded details with an allowlist of fields; never raw JSON
  - Filter chips: All, Watering, Feeding, Diagnosis
  - Event count badges scoped to the currently visible month
  - Previous / Next month navigation
  - Today button jumps to the current month and expands the newest matching day for the active filter

## Grower-visible changes

- Dashboard shows a single “Daily Grow Check” card with “Start Check”
- No more duplicate “Set your daily grow loop” card
- Timeline includes a calendar view of past watering, feeding, and diagnosis events
- Tap a day to see safe, human-readable details
- Tap filter chips to focus on one event type; badge counts update per month
- Browse previous months and return to today with one tap

## Operator QA checklist

- [ ] Dashboard shows “Daily Grow Check”
- [ ] Dashboard shows “Start Check”
- [ ] Dashboard does **not** show “Set your daily grow loop”
- [ ] Calendar renders on Timeline
- [ ] Calendar groups events by date
- [ ] Watering filter shows watering only
- [ ] Feeding filter shows feeding only
- [ ] Diagnosis filter shows diagnosis only
- [ ] Count badges update by visible month
- [ ] Previous / Next month navigation works
- [ ] Today jumps to current month and respects active filter
- [ ] Expanded details do **not** expose raw payloads, service_role, tokens, private keys, or internal IDs
- [ ] Calendar remains read-only (no edits, no deletes, no new events from calendar)
- [ ] No fake data, device control, automation, or Action Queue writes introduced

## Safety checklist

- [ ] No schema changes
- [ ] No RLS changes
- [ ] No RPC changes
- [ ] No Edge Function changes
- [ ] No AI/model changes
- [ ] No Action Queue writes
- [ ] No alert writes
- [ ] No automation code
- [ ] No device-control code
- [ ] No service_role or token exposure in client code
- [ ] `raw_payload` is never rendered in normal UI
- [ ] Demo/manual/live/stale/invalid data labeling preserved elsewhere in app
- [ ] Calendar is strictly read-only

## Validation commands

```bash
# Type safety
bun run typecheck

# Static preview safety scan
bun run ai-doctor:preview-safety

# Dashboard daily-check tests
bunx vitest run src/test/dashboard-daily-grow-check-single-surface.test.ts
bunx vitest run src/test/dashboard-daily-grow-check-panel.test.tsx
bunx vitest run src/test/dashboard-daily-grow-check-empty-states.test.tsx
bunx vitest run src/test/dashboard-daily-grow-check-chips.test.tsx
bunx vitest run src/test/dashboard-daily-grow-check-filter.test.tsx
bunx vitest run src/test/dashboard-mobile-layout-safety.test.ts

# Diary calendar tests
bunx vitest run src/test/diary-calendar-view-model.test.ts
bunx vitest run src/test/diary-calendar-section.test.tsx
bunx vitest run src/test/diary-calendar-filters.test.tsx
bunx vitest run src/test/diary-calendar-filter-badges.test.tsx
bunx vitest run src/test/diary-calendar-expanded-details.test.tsx
bunx vitest run src/test/diary-calendar-month-nav.test.tsx
bunx vitest run src/test/diary-calendar-today.test.tsx

# Diary timeline tests
bunx vitest run src/test/diary-timeline-event-wiring.test.ts
bunx vitest run src/test/diary-timeline-empty-error-states.test.tsx
```

## Known non-goals / parked items

- Customer Mode QR guide shell
- Manual sensor UUID validation UI flow for Environment Check
- Detailed diary calendar event drawer
- **Global Fast Add revival** — Quick Log is now the single logging entry point; do not rebuild global Fast Add
- Premium diary-based grow report screen

## Rollback notes

If a critical issue is found after publish:

- **Dashboard single surface**: revert `src/pages/Dashboard.tsx` to re-add `DailyGrowCheckOnboardingCard` import and its render block; delete `src/test/dashboard-daily-grow-check-single-surface.test.ts`
- **Diary calendar filter chips/badges**: revert `src/components/DiaryCalendarSection.tsx` and `src/lib/diaryCalendarViewModel.ts` to pre-chip versions; delete related test files
- **Diary calendar month navigation / Today**: revert `src/components/DiaryCalendarSection.tsx` and `src/lib/diaryCalendarViewModel.ts` to pre-nav versions; delete `src/test/diary-calendar-month-nav.test.tsx` and `src/test/diary-calendar-today.test.tsx`
- **Mobile Quick Log single FAB**: revert `src/components/AppShell.tsx` and `src/components/QuickLogV2Fab.tsx`; delete `src/test/mobile-quick-log-single-fab.test.ts`

## Requirements / assumptions

- Calendar events come from existing `diary_entries`, `watering_logs`, `feeding_logs`, and diagnosis records
- View-model helpers are pure and deterministic; no network calls inside view-model
- Component receives events as props; parent fetches data
- All time math uses UTC date keys (`YYYY-MM-DD`) to avoid timezone drift in grouping

## Validation results

- `bun run typecheck` → OK
- `bun run ai-doctor:preview-safety` → OK (4 files scanned)
- Dashboard + diary calendar test band → **15/15 test files, 209/209 tests passed**

## Safety verdict

**SAFE** — read-only UI additions and dashboard surface cleanup. No schema, RLS, RPC, Edge, AI, Action Queue, alert, automation, or device-control changes.

## Publish-ready status

**Yes** — dashboard daily-check single surface and full diary calendar navigation/filter/detail/today behavior are green and regression-safe.
