# Relative Cultivation Timeline

Architectural foundation for Verdant's future plant-relative timeline. This
document captures *why* Verdant frames time around plant reality instead of a
generic Gregorian calendar, and pins the safety rules every later UI iteration
must respect.

> Status: **foundation only.** Stage presets, pure helpers, and tests are in
> place. No visual calendar, drag/drop, reminders, notifications, or
> persistence is built yet. See "When to build the visual timeline UI" at the
> end.

---

## Why plant-relative, not Gregorian

A generic monthly calendar tells a grower what day of the year it is. It does
not answer the questions Verdant exists to answer:

- How old is this plant?
- How far into the current stage is it?
- When did the last stage transition actually happen?
- What logs, photos, sensor snapshots, and AI Doctor notes belong to *this*
  plant's lived history?

Cultivation runs on plant-relative time:

- **Day since plant start** anchors plant age.
- **Day within current stage** anchors decisions like training, feeding shifts,
  flush, and harvest readiness.
- **Stage transitions** are the real "milestones" — not arbitrary dates on a
  wall calendar.

A grower's mental model is "Day 24, week 2 of flower," not "May 17." Verdant's
timeline must match that mental model.

---

## Anchors

The timeline is anchored by two grower-owned dates per plant:

| Anchor              | Source                                        | Used for                          |
| ------------------- | --------------------------------------------- | --------------------------------- |
| `plantStartedAt`    | Plant record (seed pop / clone cut)           | "Day N since plant start"         |
| `stageStartedAt`    | Most recent grower-confirmed stage transition | "Day N within current stage"      |

All event times (`eventAt`) are projected against these anchors using pure
helpers in `src/lib/relativeStageTimelineRules.ts`. Invalid or missing anchors
must yield safe `null` — never a fabricated "Day 0".

---

## What appears on the future timeline

The future timeline visualizes things the grower already created. It does
**not** invent events.

Surfaced sources (read-only projections of existing data):

- Quick Logs (watering, feeding, training, notes)
- Photos
- Manual sensor snapshots (with Live / Manual / Demo / Stale / Unavailable
  labeling preserved)
- AI Doctor recommendations
- Approval-required Action Queue items
- Grower-confirmed stage transitions

Sources explicitly **not** surfaced:

- Dummy tasks
- Auto-generated "recommended" feeding schedules
- Speculative future events
- Fake live sensor data
- Anything the grower has not logged or approved

---

## Autoflowers and timeline flexibility

Autoflowers do not respect light schedules to switch stages. A plant may
pre-flower earlier or later than the strain's stated window. The timeline
**must** tolerate this:

- Stage durations are *suggestions*, not contracts.
- Visual stage bands stretch and shrink based on the grower-confirmed
  `stageStartedAt`, not the preset's suggested range.
- "Behind" or "ahead" of expected timing is presented as observation, never
  as failure.

---

## Phase shifts are grower-approved

Verdant may *observe* a plant looks ready for a new stage (e.g. early
pre-flower in the photo, symptom log, or grower note). It may build a
**stage shift recommendation draft** via
`buildStageShiftRecommendationDraft(...)`.

The draft is hard-locked to safe behavior:

- `requiresApproval: true` always.
- Never mutates `plants.stage` directly.
- Never emits device commands.
- Never suggests nutrient, irrigation, or environmental changes on its own.
- Copy stays cautious ("Review whether this plant should move into Flower.").

A stage transition only happens when the grower confirms it. This is the same
approval contract the Action Queue uses, applied to plant lifecycle data.

---

## No dummy tasks, no fake events

The timeline reflects what the grower actually did and what sensors actually
reported. Verdant must not:

- Pre-populate "Day 14: top your plant" tasks.
- Insert fake watering events to fill empty space.
- Show predicted sensor readings as if they were measured.
- Render demo data on the same visual track as live data without clear
  labeling.

This rule protects the trust contract: if it's on the plant timeline, the
grower (or a verified sensor source) put it there.

---

## Stage presets

Defined in `src/lib/relativeStageTimelineRules.ts`. Each preset is stable
across releases (stable `key`, stable color token, stable sort order):

| Key        | Label      | Color direction              |
| ---------- | ---------- | ---------------------------- |
| seedling   | Seedling   | Soft Mint Green              |
| clone      | Clone      | Vibrant Teal                 |
| vegetation | Vegetation | Lush Emerald Green           |
| flower     | Flower     | Deep Ultraviolet / Magenta   |
| dry        | Dry        | Amber / Gold                 |
| cure       | Cure       | Rich Earthy Brown            |

Suggested duration ranges are advisory only and never used to auto-shift
stages.

---

## Out of scope for this foundation

Deferred until a later, scoped task:

- `calendar_events` table
- Reminders / notification tables
- Email or push provider integrations
- Drag-and-drop calendar library
- Any automatic stage mutation
- Any device control surface
- Any `service_role` usage

The static guardrail in
`src/test/relative-cultivation-timeline-guardrail.test.ts` enforces these.

---

## When to build the visual timeline UI

The visual timeline is a Gate-2 feature. Build it only after:

1. **QuickLog Gate 1 is frictionless** — the 30-second log path is fast,
   protected by tests, and free of regressions on Plant Detail, Dashboard,
   and Daily Check.
2. **Daily Grow Check** surfaces remain stable (calculation basis,
   consistency card, post-submit flows).
3. **Manual sensor snapshot quality guardrails** (advisor + review step +
   change context + history list) are shipped and used.
4. **Action Queue approval contract** has not regressed.

Until those gates hold, the timeline lives as pure rules + tests only. A
half-built visual timeline that competes with QuickLog for attention would
hurt the core loop.
