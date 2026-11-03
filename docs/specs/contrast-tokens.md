# Text contrast: measured, with two token decisions

Status: draft spec. Needs founder decisions D1 and D2 (§5). Spec only, no application code.

Source: live grower audit 2026-11-03, finding 12. The audit flagged "muted gray text on dark green"
as a risk but could not measure it: "screenshots alone cannot establish WCAG conformance."

This spec measures it from the theme tokens in `src/styles.css` on the deploy branch
`verdant-grow-diary` at `c03f64a`.

## 1. Method

- Colours come from the HSL custom properties in `src/styles.css`:
  - the default dark theme in `:root`, lines 116–151
  - the light `.customer-mode` theme, lines 198–214
- Contrast ratio is WCAG 2.x: (L1 + 0.05) / (L2 + 0.05), using sRGB relative luminance.
- Opacity variants such as `text-muted-foreground/70` are alpha-blended over their background
  before the ratio is taken.
- `.glass` cards use `--gradient-glass` (line 176). The worst case is its lightest stop,
  `hsl(150 25% 14% / 0.85)`, composited over `--background`.
- AA thresholds: 4.5:1 for normal text, 3:1 for large text (≥ 18.66 px bold or ≥ 24 px).
  Most Verdant metadata is 10–12 px, so 4.5:1 applies.

These are token measurements. Rendered pages can differ where an element sits on an image, a
tinted panel (`bg-destructive/10`, `bg-primary/5`) or a nested translucent layer. Those are
NOT_MEASURED here.

## 2. Results

### 2.1 Base tokens: PASS

| Theme | Pair                                          | Ratio | AA text |
| ----- | --------------------------------------------- | ----- | ------- |
| dark  | `--muted-foreground` on `--background`        | 7.08  | PASS    |
| dark  | `--muted-foreground` on `--card`              | 6.59  | PASS    |
| dark  | `--muted-foreground` on `--muted`             | 5.67  | PASS    |
| dark  | `--muted-foreground` on `--secondary`         | 5.54  | PASS    |
| dark  | `--muted-foreground` on glass (lightest stop) | 5.72  | PASS    |
| dark  | `--foreground` on `--background`              | 16.29 | PASS    |
| dark  | `--primary` on `--background`                 | 10.04 | PASS    |
| dark  | `--primary-foreground` on `--primary`         | 9.49  | PASS    |
| light | `--muted-foreground` on `--background`        | 5.80  | PASS    |
| light | `--muted-foreground` on `--card`              | 6.22  | PASS    |
| light | `--primary` on `--background`                 | 5.21  | PASS    |
| light | `--primary-foreground` on `--primary`         | 5.59  | PASS    |

The audit's main worry, muted gray on dark green, does **not** hold for the base token.

### 2.2 `--destructive` in the dark theme: FAIL

`--destructive: 0 70% 55%` (line 139) serves two jobs. It is the error text colour
(`text-destructive`, 310 uses) and the danger button and badge fill (`bg-destructive`, 127 uses,
including `src/components/ui/button.tsx:13` and `src/components/ui/badge.tsx:15`).

| Pair                                                           | Ratio | AA text  |
| -------------------------------------------------------------- | ----- | -------- |
| `text-destructive` on `--background`                           | 4.30  | **FAIL** |
| `text-destructive` on `--card`                                 | 4.00  | **FAIL** |
| `text-destructive` on glass (lightest stop)                    | 3.47  | **FAIL** |
| `--destructive-foreground` (white) on `--destructive` (button) | 4.40  | **FAIL** |

One token cannot pass both jobs. Lighter helps the text but hurts the button. The two numbers
pull in opposite directions:

| `--destructive` lightness | text on card | white on button |
| ------------------------- | ------------ | --------------- |
| 55% (today)               | 4.00         | 4.40            |
| 60%                       | 4.60         | 3.82            |
| 65%                       | 5.41         | 3.25            |

Error text is safety copy. Examples are `tent-create-size-error` at 11 px, save errors, and
read-failure notices. A grower must be able to read it.

### 2.3 Muted text at reduced opacity: FAIL at /70 and below

| Opacity | on background | on card  | on glass |
| ------- | ------------- | -------- | -------- |
| /90     | 5.93          | 5.58     | 4.92     |
| /80     | 4.92          | 4.68     | **4.20** |
| /70     | **4.04**      | **3.89** | **3.56** |
| /60     | **3.28**      | **3.20** | **2.99** |
| /50     | **2.64**      | **2.61** | **2.49** |
| /40     | **2.11**      | **2.12** | **2.07** |

There are 41 uses at /70 or below in `src/components` and `src/pages`:

| Count  | File                                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 21     | `PlantQuickStatusStrip.tsx`                                                                                                                                                                                                  |
| 4      | `PlantRelativeTimelineSection.tsx`                                                                                                                                                                                           |
| 4      | `PhenoFightNight.tsx`                                                                                                                                                                                                        |
| 3      | `PlantManualSensorFreshnessCard.tsx`                                                                                                                                                                                         |
| 1 each | `Upgrade.tsx`, `Pricing.tsx`, `OperatorSupportInbox.tsx`, `Glossary.tsx`, `BlueprintTargetsGuide.tsx`, `TimelineMemorySection.tsx`, `QuickLogSensorSnapshotStrip.tsx`, `PhenoContendersBoard.tsx`, `HarvestTimelineCard.tsx` |

- Many /40 uses are `aria-hidden` separators, for example `PlantQuickStatusStrip.tsx:155,196,208,229`.
  They are decorative and exempt.
- **Sensor-truth concern:** `PlantManualSensorFreshnessCard.tsx:53-54` draws the **stale**
  freshness state at /60 (3.28) and **missing** at /50 (2.64). Those labels tell a grower that a
  reading is old or absent. They must be the easiest text on the card to read, not the hardest.
- `QuickLogSensorSnapshotStrip.tsx:279` draws sensor metric labels at /70 (4.04).

## 3. Safety fences

- **F1:** stale, missing, invalid, error and read-failure text meets AA (4.5:1) on every surface it
  can render on, glass included.
- **F2:** no change makes a stale or missing state look like a healthy one. Colour is never the
  only signal; the existing words ("Stale", "Missing", the badges) stay.
- **F3:** decorative `aria-hidden` glyphs may stay faint.

## 4. Requirements

- **R1:** per D1, error text passes AA on background, card and glass in the dark theme, and danger
  buttons keep AA for their white label.
- **R2:** per D2, text that carries meaning uses `text-muted-foreground` at /80 or stronger. Only
  `aria-hidden` decoration may go fainter.
- **R3:** `PlantManualSensorFreshnessCard` stale and missing states meet F1 under either D2 option.
  This is the first fix to ship.
- **R4:** a contrast guard test computes the §2 ratios from the resolved tokens in
  `src/styles.css`, per `AGENTS.md` §10 (assert resolved values). It fails if a meaningful pair
  drops below 4.5:1.

## 5. Founder decisions

**D1: fix `--destructive`.**

- **(a) Split it (recommended).** Add `--destructive-text: 0 85% 68%` for text, which measures
  6.29 on background, 5.85 on card and 5.08 on glass. Darken the fill to `--destructive: 0 70% 48%`,
  which gives white text 5.06. `text-destructive` maps to the text token and `bg-destructive` to
  the fill. The visible change: error text gets a little lighter, danger buttons a little darker.
- **(b) Keep one token at 58%.** Text measures 4.67 on background but 4.34 on card, so it still
  fails, and the button drops to 4.05. Not recommended.

**D2: muted opacity policy.**

- **(a) Floor at /80 for meaningful text (recommended).** Replace the /70-and-below text uses
  with base `text-muted-foreground` or /80. Keep /40–/60 only on `aria-hidden` decoration. Add a
  lint or test guard.
- **(b) Fix only the sensor-truth uses now.** That means the freshness card and the snapshot strip
  labels. The rest goes later.

## 6. Acceptance tests

1. Guard test: every pair in §2.1 is ≥ 4.5 from the resolved `src/styles.css` tokens. (R4)
2. Under D1(a): error text is ≥ 4.5 on background, card and glass, and white on the danger
   fill is ≥ 4.5. (R1)
3. The freshness card's stale and missing labels are ≥ 4.5 on card and glass, and still say
   "Stale" or "Missing". (R3, F1, F2)
4. Under D2(a): no `text-muted-foreground/[1-7]0` on an element without `aria-hidden`. (R2)
5. The light theme still passes everything in §2.1. (R4)

## 7. Out of scope

- Keyboard flow, focus order, screen-reader announcements, touch targets and nested scrolling
  (the rest of finding 12). Each needs its own measured pass.
- Rendered-page contrast over images and tinted panels.

## 8. File plan (after D1 and D2)

1. `src/components/PlantManualSensorFreshnessCard.tsx` (R3) plus a test. This is the smallest
   slice and needs no decision.
2. `src/styles.css` (D1 tokens), the Tailwind colour mapping in the same file (lines 40–41), and the
   guard test.
3. The D2 sweep of the 41 uses, plus the lint or test guard.
