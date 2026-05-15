# Verdant MVP Integrity Pass 2

**Goal:** Make Calendar, Reports, Ask My Grow, plant detail tabs, and diary relationships feel real — not decorative. No redesign, no new product surfaces, no payments/SMS/device control/marketplace/community/packet sniffing.

---

## 1. Calendar integrity (`src/pages/app/CalendarPage.tsx`)

**Problems today**
- Day cells render events but are not clickable.
- Calendar shows diary entries inline but provides no way to open them.
- `addEvent` (when fired from "mark complete" flows) does not create a paired diary entry.

**Fixes**
- Wrap each day cell in a `Popover` trigger. Popover content lists that day's diary entries + events with:
  - Type badge using the same `colors` map (single source of truth — extract to `src/lib/eventColors.ts`).
  - Plant name (link to `/app/plants/:plantId`).
  - For diary entries: link to `/app/diary/:id`.
  - For events: link to `/app/diary/:sourceId` when present, else show inline detail.
- In `store/verdant.tsx`, update `addEvent` so that when an event is marked completed it calls `logEvent` (new helper) which creates a matching `DiaryEntry` with `refId = event.id` and stamps `event.diaryEntryId` back. Bidirectional link.
- Today cell: keep ring, add "Today" pill so it reads at a glance on mobile.

## 2. Reports integrity (`src/pages/app/Reports.tsx`)

**Problems today**
- Stats counts are real, but chart silently uses `v.snapshots` filtered by plant — when none exist, the chart block is hidden with no message.
- Risk list misses several mediums and never references diagnoses or training.
- Nothing labels demo seed data vs. real user data.

**Fixes**
- For each plant, compute weekly buckets (last 4 weeks) for: waterings, feedings, training events, photos, diagnoses, snapshots, harvest yield (if logged).
- Replace the single Recharts line block with two: env trend (temp/RH/VPD) and activity bars (water/feed/train counts/week). When data length < 2 show `EmptyState` with one CTA: "Capture snapshot" / "Log watering".
- Expand `risks[]` rules:
  - soil: warn if waterings/week > 4
  - coco: warn if no feeding in last 3 days
  - peat: warn if no runoff EC logged in last week
  - hydro: warn if no res EC/pH snapshot in last 48h
  - autoflower: warn if heavy training event in last 7 days
- Add `SourceBadge` (`demo` vs `manual`) to each plant header based on `plant.source`.

## 3. Ask My Grow (`src/pages/app/AskMyGrow.tsx`)

**Problems today**
- Context preview only assembles diary + latest snapshot even when user toggles watering/feeding/training/photos/harvest.
- "MVP placeholder response" label is good; keep it but make the data bundle complete.

**Fixes**
- Build `assembleContext(plantId, selectedCtx)` in `src/lib/askContext.ts` that returns a typed bundle pulling last N records per selected category:
  - diary (5), watering (5), feeding (5), training (5), photos (3 — id + caption only), snapshots (3), diagnosis (3), harvest (all).
- Render the bundle as a collapsible JSON/structured preview (not just a string), grouped by category, so the user can verify what would be sent.
- Banner at top: "Shell mode — no AI provider connected. Connect in Settings → AI." Link to `/app/settings`.
- Remove the canned suggested-question that implies certainty ("Is this autoflower stressed?") — replace with neutral framing: "What context should I review for this autoflower?"

## 4. Relationship validation

**Store changes (`src/store/verdant.tsx`)**
- Add `resolveRef(entry: DiaryEntry)` helper returning the typed source record (`{ kind, record }`) by inspecting `entry.type` + `entry.refId`. Centralizes lookup.
- Add `validateRelationships()` dev helper that scans:
  - diary entries with `refId` pointing to nothing
  - watering/feeding/training/diagnosis/harvest records missing a back-link diary entry
  - photos without `diaryEntryId`
  - snapshots referenced by diary entries that no longer exist
  Returns a list of `{ kind, id, issue }`.

**UI changes**
- `PlantDetail.tsx`: each tab (Watering, Feeding, Training, Photos, Snapshots, Diagnosis, Harvest) row gets a "View diary entry" link when a back-link exists, "Link to diary" action when missing (creates one via existing log helpers).
- Diary card "Linked from" chip: replace static badge with a `Link` resolved via `resolveRef` to `/app/plants/:plantId?tab=...#refId`.
- Photo modal: replace `/app/diary` link with `/app/diary/:photo.diaryEntryId`.

## 5. MVP QA checklist page

**New route:** `/app/qa` (operator-only, hidden from sidebar by default; reachable from Settings → "MVP QA Checklist").

**File:** `src/pages/app/QAChecklist.tsx`

**Contents (rendered as a static checklist + live signals)**
- Passed flows: list each verified flow with a green check (Diary↔Photos, Diary↔Snapshots, Diagnosis save, Plant tabs render real data, Diary detail route, Calendar shows entries).
- Failed flows: read from `validateRelationships()` and render any current breakages.
- Missing relationships: live count of orphaned refs.
- Next 10 fixes: static list mirroring the prioritized backlog (snapshot→diary entry, calendar click-through, NewSnap plantId prefill, inline snapshot in NewEntry, photo→diary deep link, in-place PhotoView in plant detail, diary "linked from" deep link, day grouping + jump-to-today, diagnosis CTA to AI settings, `resolveRef` rollout).

No styling overhaul — reuse `glass`, `PageHeader`, `EmptyState`, badges already in the system.

---

## Out of scope (explicit)
Payments, real SMS sending, live device control, marketplace, public community, Spider Farmer packet sniffing, redesign, new navigation entries beyond `/app/qa` (linked from Settings only).

## Acceptance
- Click any calendar day → see its diary + events; click an event → opens `/app/diary/:id` or plant detail.
- Reports show real activity bars + env trend, with empty states + medium-aware risks.
- Ask My Grow shows a structured, complete context bundle for every selected category and never implies real AI is answering.
- Every plant detail tab row links to its diary entry; every diary card "Linked from" chip deep-links back.
- `/app/qa` renders live pass/fail counts driven by `validateRelationships()`.

## Technical notes
- Extract event color map to `src/lib/eventColors.ts`; import in `CalendarPage`, `Diary`, `DiaryEntryDetail`.
- `resolveRef` and `validateRelationships` live in `src/store/verdant.tsx` next to existing selectors.
- No schema migrations — all fields (`refId`, `diaryEntryId`, `sourceId`, `snapshotId`, `photoIds`) already exist on the types.
