# Spec — "Pro Blueprint" live target-band overlay

Status: **draft** · Owner: founder · Scope: a Pro-gated per-plant overlay that
scores each live/logged reading **green / amber / red** against the Pro-Level
Production SOP's target band **for the plant's current stage**, plus a
grower-initiated "add to Action Queue" on any red metric.

This is the highest-leverage monetization feature: it fuses the founder's #1
owned asset (the SOP's phase×metric target table) with the #1 technical moat
(live ECOWITT telemetry + auto-VPD). Static bands stay free (SEO teaser); the
**live scoring** is the Pro unlock. It reframes Pro from a commodity
("unlimited grows") into something uncopyable ("am I in the target band right
now?").

---

## 1. Reuse map — ~80% already exists

| Already built            | File                                                                           | Role                                            | Gap for Blueprint                                           |
| ------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------- |
| Multi-metric comparator  | `src/lib/environmentTargetComparison.ts` — `compareSnapshotToTargets`          | scores 7 metrics `low/in_range/high`            | compares vs **flat per-grow** `grow_targets`, not per-stage |
| Per-stage band evaluator | `src/lib/vpdTargetRules.ts` — `evaluateVpdAgainstStageTarget`                  | scores **one metric (VPD)** vs a **stage** band | VPD only                                                    |
| Stage vocabulary bridge  | `src/lib/vpdStageNormalizationRules.ts` — `normalizeToCanonicalVpdTargetStage` | legacy/canonical stage normalization            | reuse as-is                                                 |
| VPD per-stage bands      | `src/constants/vpdTargets.ts` — `VPD_STAGE_TARGETS` (+ `vpd_targets` table)    | founder-tuned VPD bands                         | **single-source VPD from here — do not fork**               |

The overlay = the stage-awareness of `vpdTargetRules` applied to the
metric-breadth of `environmentTargetComparison`, sourced from the SOP table.

---

## 2. Hard constraint: metric provenance

The seven SOP metrics come from **three** places and most growers won't have
all of them live. Graceful degradation is the core UX, and every missing
metric is a monetization nudge ("log EC/pH", "add a PPFD reading", "attach a
sensor").

| SOP metric | Live source (verified)                             | Reality                                                                                 |
| ---------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Temp, RH   | `SensorSnapshot.temp/rh` ← ECOWITT `source='live'` | ✅ genuinely live                                                                       |
| VPD        | `SensorSnapshot.vpd` (derived temp+RH)             | ✅ live (computed)                                                                      |
| PPFD       | `SensorSnapshot.ppfd`                              | ⚠️ manual/CSV only — **never from ECOWITT** (lux≠PPFD, no conversion in code)           |
| DLI        | `greenhouseLightRules.aggregateDli()`              | ⚠️ computed, needs ≥2 PPFD samples + IANA tz; not stored                                |
| EC, pH     | `feeding_events` table                             | ⚠️ **manually logged** in Quick Log → Feeding; not in `SensorSnapshot`, not time-series |

So the overlay reads from `SensorSnapshot` (temp/rh/vpd/ppfd), `feeding_events`
latest (ec/ph), and `aggregateDli` (dli). For a typical ECOWITT-only grower,
temp/RH/VPD light up live and the rest render as "no reading yet" prompts.
**Do not imply all seven are live-sensed.**

### Verified gotchas to route around

- `SensorSnapshot.soil_ec` is effectively always null (client reads metric
  `"soil_ec"`, DB only permits `"ec"`). **Do not** use the soil_ec sensor band
  for the SOP's nutrient EC — read `feeding_events` instead.
- `plants.stage` is a DB-enforced six-value set: `seedling | veg | flower |
flush | harvest | cure` (default `seedling`). Normalize it with the **live**
  `normalizeVpdStage` (`vpdStageTargetRules.ts`) — the strict
  `normalizeToCanonicalVpdTargetStage` is a dead path that rejects
  `flush`/`harvest`/`cure`. `flush → late_flower`; `harvest` & `cure → harvest`.
- `sensor_readings` has **no `plant_id`** — a plant inherits its assigned
  tent's readings (`useLatestSensorSnapshot(growId, tentIds)` /
  `usePlantTentLatestReadings(tentId)`).

---

## 3. Data model — the SOP bands (founder IP)

**Storage (MVP):** TS constants; no migration. Add a per-user override DB
table later only if growers ask to tweak.

**Keyed off the real stage vocabulary.** The band table is keyed by the
**normalized `VpdStage`** (`seedling | veg | preflower | flower | late_flower |
harvest`) that `normalizeVpdStage` produces from `plants.stage` — so a lookup
lines up 1:1 with the app's existing per-plant VPD/temp/RH classification and
never lands on `stage_unknown` for a real stored stage.

**VPD is single-sourced** from `getVpdTargetBand` (`vpdStageTargetRules.ts`) —
the same bands the live VPD panel uses — so there's one VPD truth, not two.
`harvest` is context-only there (no VPD target), which the Blueprint honors.

**Day/night temperature.** `tempC` carries separate `day` / `night` bands; the
overlay picks one from the tent's `light.on` flag (`tents.light_on`) — the only
ready per-tent day/night signal (a manual toggle; no schedule anchor time or
timezone is stored). Unknown light state → the widest merged band, so it never
false-alarms.

**Dry & cure is real value.** `harvest` (from `plants.stage` `harvest`/`cure`)
gets the SOP's dry-room bands (15–16 °C / 58–62 % RH) — the live stack treats
harvest as context-only with no target, so this is new.

Implemented in **`src/constants/blueprintTargets.ts`** — `MetricBand`,
`DayNightBand`, `BlueprintStageBands` (optional `tempC` day/night, `rh, ec, ph,
ppfd, dli`; no `vpdKpa`), and
`SOP_BLUEPRINT_TARGETS: Record<BlueprintTargetStage, BlueprintStageBands>`. Only
`seedling` (Propagation) and `harvest` (Dry & Cure) are verbatim from the SOP;
the rest interpolate and are marked **founder-to-confirm**.

---

## 4. The evaluator (step 1 — shipped)

**`src/lib/blueprintMetricRules.ts`** — pure, no I/O. Generalizes
`evaluateVpdAgainstStageTarget` (binary in/out) to any metric and adds an
**amber** zone for the traffic light:

```ts
type BlueprintClassification =
  | "in_band"                       // green, the only healthy state
  | "warn_low" | "warn_high"        // amber — just outside, within warnMargin
  | "out_low" | "out_high"          // red — further outside
  | "stage_unknown" | "no_target" | "unavailable"; // neutral, never healthy

classifyReadingAgainstBand(value, band, warnMargin = 0.15): BlueprintMetricResult
resolveBlueprintBand(stage, metricKey, bands?): MetricBand | null  // VPD ← VPD_STAGE_TARGETS
evaluateBlueprintMetric({ stage, metricKey, value, bands?, warnMargin? }): BlueprintMetricResult
```

- `warnMargin` is a fraction of band width; inside the band is green
  (`healthy`), outside-but-within-margin is amber, further is red. Band edges
  are inclusive.
- Uses the canonical `vpdTargetRules` semantics (not the legacy
  `vpdStageTargetRules` enum). VPD keeps its own existing evaluator for its
  own row; Blueprint just adds amber on top.

Tests: **`src/test/blueprint-metric-rules.test.ts`** (boundaries, amber/red
split, no_target, unavailable, degenerate band, legacy-stage mapping, VPD
single-sourcing, band-table integrity).

---

## 5. View-model (step 2)

**`src/lib/blueprintOverlayViewModel.ts`** — pure, injectable:

```ts
buildBlueprintOverlayViewModel(input: {
  stage: string | null;
  snapshot: SensorSnapshot | null;                            // temp/rh/vpd/ppfd
  latestFeeding: { ec: number|null; ph: number|null } | null; // feeding_events
  dli: number | null;                                         // aggregateDli()
  bands?: Record<CanonicalVpdTargetStage, BlueprintStageBands>;
}): {
  stageLabel: string; stageKnown: boolean;
  rows: Array<{
    metricKey; label; unit; value; band; result;             // result = BlueprintMetricResult
    provenance: "live" | "manual" | "derived" | "missing";
    nudge?: string;                                           // e.g. "Log EC/pH in Quick Log"
  }>;
  summary: { green: number; amber: number; red: number; missing: number };
}
```

Mirrors existing `*ViewModel.ts` conventions (`derivedVpdStatusViewModel.ts`).
`provenance: "missing"` rows render the upsell-adjacent nudge instead of a value.

---

## 6. Component + gating (step 3)

**`src/components/ProBlueprintOverlay.tsx`** — presenter only; renders `rows`
as labeled bands with a colored marker at the live value; missing rows show
the nudge.

**Gating — use the server-authoritative path.** Live-sensor surfaces go
through `PremiumLiveSensorGate` / `useLiveSensorServerGate`, **not** client
`canUseCapability`:

```tsx
<PremiumLiveSensorGate surface="blueprint_overlay" scope={{ plantId }}>
  <ProBlueprintOverlay vm={vm} />
</PremiumLiveSensorGate>
```

- Add `"blueprint_overlay"` to `LiveSensorSurface` and allow it in the
  `live-sensor-entitlement` edge function.
- `PremiumLiveSensorGate` supplies `paywallCopy/paywallHeadline/paywallUpgradeCopy`;
  or drop a `<PaywallCta vm={buildPaywallCtaViewModel({...})} />`. **Respect the
  banned-word list** in `paywallCtaViewModel` (no "live data"/"guaranteed").
- **Free teaser:** render the _static_ `SOP_BLUEPRINT_TARGETS` bands (no live
  marker) outside the gate, near the public VPD calculator — the SOP IP is the
  SEO hook, the live scoring is the paid unlock.

Relevant capability: `liveSensors` (`false` Free, `true` all paid) — but gated
server-side, since no live-sensor surface ships yet.

---

## 7. Action Queue integration (step 5) — grower-initiated, not auto-spam

Respect the `action_queue` invariant ("suggest-only, approval-gated") **and**
avoid alert fatigue: do **not** auto-insert cards on every excursion. Put an
"Add suggested fix" button on a red row (like the existing `addToQueue`
buttons in `Coach.tsx` / `AlertDetail.tsx`).

- New pure builder `src/lib/blueprintDeviationToActionQueueRules.ts`, modeled
  on `alertToActionQueueRules.ts` → draft
  `{ grow_id, tent_id, plant_id, action_type:"advisory", target_metric,
suggested_change, reason, risk_level, source:"blueprint",
status:"pending_approval" }`.
- Reuse the `SEVERITY_TO_RISK` idea (red→`high`, amber→`medium`); embed a
  `[blueprint:<stage>:<metric>]` back-pointer in `reason` for dedupe (matching
  the `[alert:<id>]` convention).
- Add `"blueprint"` to `ACTION_QUEUE_SOURCE_VALUES` / `ActionQueueSource`
  (`actionQueueProvenanceRules.ts`) and the `SourceFilter` union in
  `ActionQueue.tsx`. Persist via the direct-insert + `action_queue_events`
  `"created"` audit convention. Satisfies `action_queue_target_present_chk`.

---

## 8. Mount point

`PlantDetail.tsx`, adjacent to the existing VPD stage wiring (already passes
`plant.stage` into VPD components). Latest readings via
`useLatestSensorSnapshot`/`usePlantTentLatestReadings`; EC/pH via
`useRecentFeedingsForDefaults` → `buildFeedingDefaults`; DLI via
`aggregateDli`.

---

## 9. Testing

- `blueprint-metric-rules.test.ts` — **done** (26 tests).
- `blueprintOverlayViewModel.test.ts` — provenance, missing-metric nudges,
  stage normalization, summary counts.
- `blueprint-deviation-action-queue.test.ts` — draft shape + reuse the
  `action-queue-safety` / `provenance` / `raw-token-leak-guard` invariants.
- Static-safety: the overlay never writes sensors and never auto-inserts
  action-queue rows.

---

## 10. Build order

1. `blueprintMetricRules.ts` + `SOP_BLUEPRINT_TARGETS` + tests — **done (this PR)**.
2. `blueprintOverlayViewModel.ts` + tests — pure.
3. `ProBlueprintOverlay.tsx` + `PremiumLiveSensorGate` surface + edge-fn allow
   - mount in PlantDetail.
4. Free static-band teaser next to the VPD calculator (SEO).
5. Action-Queue "add fix" producer + source enum.

**MVP scope cut:** ship steps 1–4 with **VPD + Temp + RH only** (the genuinely
live metrics) — that alone delivers "am I in the band right now?" for every
ECOWITT user. Add EC/pH (manual), PPFD, DLI as they light up. Don't gate the
launch on metrics most growers can't feed yet.

---

## 11. Open decisions for the founder

1. **Confirm the interpolated band numbers** in `SOP_BLUEPRINT_TARGETS`
   (only `seedling` is verbatim; the rest are interpolated + DLI-filled).
2. **Temp day/night** — v1 uses a single day band; confirm before adding
   night-aware scoring.
3. **Pricing surface** — Blueprint as the headline Pro entitlement at the
   existing $12/mo · $99/yr, or its own higher "Craft" tier for the
   irrigation/rosin crowd?
