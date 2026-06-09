# AI Doctor Phase 1 Contract

> **Status:** Foundation-complete. Phase 1 is deterministic, offline, and does not call models, Edge Functions, Supabase, or device APIs.
>
> **Last validated:** 74/74 passed, 0 failed.

---

## 1. Phase 1 Pipeline

The AI Doctor Phase 1 pipeline is a four-step deterministic transform:

```
compilePlantContextFromRows
    → generateMultimodalDiagnosisPhase1
    → calculateAiDoctorConfidence
    → buildAiDoctorPhase1ViewModel
```

| Step | Function | File | Role |
|------|----------|------|------|
| 1 | `compilePlantContextFromRows` | `src/lib/aiDoctorContextCompiler.ts` | Compiles raw plant, event, and sensor rows into a typed `PlantContextPayload`. |
| 2 | `generateMultimodalDiagnosisPhase1` | `src/lib/aiDoctorEngine.ts` | Produces a cautious `Phase1DiagnosisResult` from context + optional vision stub. |
| 3 | `calculateAiDoctorConfidence` | `src/lib/aiDoctorConfidenceAdapter.ts` | Scores the diagnosis + context into a conservative `AiDoctorConfidenceResult`. |
| 4 | `buildAiDoctorPhase1ViewModel` | `src/lib/aiDoctorPhase1ViewModel.ts` | Presents diagnosis, confidence, and context into a UI-ready view model. |

**Phase 1 guarantees:**
- No external model or API calls.
- No Supabase reads or writes.
- No Edge Function invocation.
- No Action Queue writes.
- No alerts generated.
- No device control commands emitted.
- Deterministic output for identical inputs (including injected `now`).

---

## 2. Source-Truth Rules

Every sensor reading carries a `source_tag`. Phase 1 treats these labels as immutable truth.

| Source | Confidence support | Description |
|--------|-------------------|-------------|
| `live` | ✅ Trustworthy | Real-time sensor data from a connected source (EcoWitt, MQTT, bridge, etc.). |
| `manual` | ✅ Trustworthy | Grower-entered snapshot or observation. |
| `csv` | ❌ Historical only | Imported historical data. Used for context, never for live confidence. |
| `demo` | ❌ Sample data | Fixture/sample data. Must never increase confidence or be described as live. |
| `stale` | ❌ Limitation | Reading is outdated. Must never feed healthy averages. |
| `invalid` | ❌ Limitation | Reading failed validation. Must never feed healthy averages or be described as healthy. |

**Non-negotiable rules:**
- `demo` and `csv` must never be described as `live`.
- `stale` and `invalid` must never be described as healthy.
- `stale` and `invalid` must never feed the `averages_7d` trusted-current-state bucket.
- Source labels are preserved verbatim. The compiler never merges `csv`/`manual`/`demo` into the `live` bucket.

---

## 3. Context Compiler Contract (`compilePlantContextFromRows`)

### Time windows
- **Grow events:** last 14 days (`FOURTEEN_DAYS_MS`).
- **Sensor readings:** last 7 days (`SEVEN_DAYS_MS`).

### Source-separated groups
Readings are bucketed into groups in this order:

1. `live`
2. `manual`
3. `csv`
4. `demo`
5. `stale`
6. `invalid`

Each group exposes:
- `source` — the tag
- `sample_count` — number of readings in the window
- `averages` — per-metric averages within that bucket
- `readings` — the full list of readings (frozen, stable-sorted)

### Trustworthy-only `averages_7d`
The top-level `averages_7d` is computed **only** from `live` and `manual` readings. `stale`, `invalid`, `demo`, and `csv` are deliberately excluded so bad or sample telemetry never produces a "healthy" current value.

### Determinism guarantees
- Sorting is stable with explicit tie-breakers (`captured_at` desc, then `metric` asc).
- Averages are rounded to 3 decimal places.
- Future-dated timestamps are dropped.
- Unparseable values are dropped (`toFiniteNumber` filters `NaN`, `Infinity`, non-numeric).
- `now` is injectable; defaulting to `new Date()` is the only non-deterministic path.

### Classification priority
The `classifySource` helper resolves tags in this priority:
1. `row.state` / `row.quality` flags (`invalid`, `stale`, `demo`, `manual`, `csv`)
2. `row.source` string matching (`invalid`, `stale`, `demo`, `demo_fixture`, `manual`, `manual_snapshot`, `csv`, `csv_import`, `import`)
3. Fallback to `live`

This ensures `invalid` and `stale` are never misclassified as `live` even if the source string says otherwise.

---

## 4. Diagnosis Contract (`generateMultimodalDiagnosisPhase1`)

### Phase 1 diagnosis is a stub
The current implementation returns deterministic placeholder output. It does **not** call a reasoning model. Real model wiring must pass golden cases before release.

### Vision analysis is descriptive only
`executeVisionAnalysisPhase1` validates the input file and returns a zero-confidence stub. It never invokes a vision model. All visual fields are empty arrays, `image_quality_score` is `0`, and `confidence` is `0`.

### Single-image diagnosis must stay low confidence
A single photo with no sensor or diary context must produce:
- `confidence` ≤ 0.2
- Empty `likely_issue`
- Explicit `missing_information`
- No aggressive recommendations.

### Missing information must be explicit
When context is thin, the diagnosis must list what is missing (e.g., "live or manual sensor readings", "grow events", "image") rather than guessing.

### No aggressive recommendations from weak evidence
The diagnosis must **not** recommend:
- Nutrient increases, flushes, or dosing changes.
- Irrigation volume or schedule changes.
- Pesticide, fungicide, or neem applications.
- Equipment changes (lights, fans, heaters, humidifiers).

### Action Queue suggestion is advisory-only
`Phase1ActionQueueSuggestion` is always:
- `action_type: "advisory"`
- `status: "pending_approval"`
- Never an executable device command.

### No writes occur
Phase 1 diagnosis does not write to:
- Supabase tables
- Action Queue
- Alert system
- Device controllers

---

## 5. Confidence Adapter Contract (`calculateAiDoctorConfidence`)

### Conservative base score
Scoring starts at `BASE_SCORE = 20`. Additive bonuses and penalties are applied, then hard caps and level thresholds are enforced.

### Hard caps
These caps are applied **after** all bonuses/penalties:

| Condition | Max score | Resulting level |
|-----------|-----------|----------------|
| No trustworthy sensors + no recent events | 35 | `very_low` or `low` |
| Only stale/invalid readings | 30 | `very_low` or `low` |
| Only demo/CSV readings | 40 | `very_low` or `low` |
| Major missing info (≥5 items) | 45 | `very_low`, `low`, or `medium` |
| Poor visual + weak context | 35 | `very_low` or `low` |

### Level thresholds
- `0–24` → `very_low`
- `25–49` → `low`
- `50–74` → `medium`
- `75–100` → `high`

### High confidence requires the "full quartet"
The `high` level is gated. Even if the raw score is ≥75, the level is downgraded to `medium` unless **all** of the following are true:
1. Recent trustworthy sensor data (`live` or `manual`)
2. Recent grow events (within 14 days)
3. Useful visual context (`image_quality_score` ≥ 0.5 and at least one observation)
4. Limited missing information (≤2 items)

### Source quality tracking
The adapter reports counts for every source tag (`live_count`, `manual_count`, `csv_count`, `demo_count`, `stale_count`, `invalid_count`) plus boolean flags for:
- `has_recent_trustworthy_sensor_data`
- `has_recent_grow_events`
- `has_visual_context`

### Safety flags
The adapter emits `safety_flags` such as:
- `weak_context`
- `avoid_overdiagnosis`
- `no_trustworthy_sensor_data`
- `no_recent_grow_events`
- `stale_or_invalid_readings_present`
- `demo_or_csv_only`
- `major_missing_information`
- `poor_visual_quality`

---

## 6. View Model Contract (`buildAiDoctorPhase1ViewModel`)

### UI must consume the view model, not rebuild safety logic
React components should render `AiDoctorPhase1ViewModel` fields directly. Safety rules (source truth, confidence gating, overdiagnosis warnings) are computed here and must not be duplicated in JSX.

### Panels

| Panel | Purpose |
|-------|---------|
| `summaryCard` | Title, summary, likely issue, risk level, confidence label + score, status badges. |
| `evidencePanel` | Evidence items, context items (strain/stage/tent/grow), source quality counts, limitations. |
| `missingInfoPanel` | Boolean flag, missing items list, severity (`none`/`low`/`medium`/`high`). |
| `recommendationsPanel` | Immediate action, `what_not_to_do`, 24h follow-up, 3-day plan, monitoring priorities. |
| `actionQueuePanel` | Advisory-only display. Conversion to an Action Queue item is disabled when confidence is `low` or `very_low`. |
| `safetyPanel` | Automation warning, overdiagnosis warning (for weak context), source truth warning (for demo/csv/stale/invalid or no trustworthy data). |
| `debugMeta` | Source counts, booleans for live/manual/demo-csv-only/stale-invalid, generated timestamp, raw vs. displayed confidence level. |

### Action Queue panel is display-only
- `should_show` is `true` only when the diagnosis carries an `action_queue_suggestion`.
- `status` is always `pending_approval` or `not_applicable`.
- `action_type` is always `advisory` or `none`.
- `disabled_reason` is set when confidence is `low` or `very_low`.
- The reason text always includes "Grower approval is required before any change is made."

### Confidence display gating
The view model exposes both `raw_confidence_level` (from the adapter) and `displayed_confidence_level` (after gating). The gating rule matches the adapter's high-confidence quartet requirement.

### Warnings that must remain visible
1. **Automation warning** — always present: "Verdant does not control equipment in this view. Any equipment change is up to the grower."
2. **Overdiagnosis warning** — shown when confidence is `low`/`very_low` or `avoid_overdiagnosis` flag is set.
3. **Source truth warning** — shown when data is `demo`/`csv`-only, `stale`/`invalid` present, or no trustworthy sensors exist.

---

## 7. Non-Negotiable Forbidden Behavior

The following behaviors are **prohibited** in Phase 1 and any future integration:

1. **No fake live data** — `demo` and `csv` must never be labeled or described as `live`.
2. **No model certainty from one photo** — single-image diagnosis must stay low confidence with empty `likely_issue`.
3. **No UI-side source rewriting** — React components must not override source tags or merge buckets.
4. **No demo/CSV described as live** — repeat of rule 1; documentation and UI copy must be explicit.
5. **No stale/invalid described as healthy** — bad telemetry must be surfaced as a limitation, not hidden.
6. **No direct device commands** — no `turn on`, `turn off`, `set fan`, `set light`, `dose`, `irrigate now`, etc.
7. **No Action Queue writes in Phase 1** — the engine is read-only.
8. **No alerts generated in Phase 1** — alerting is out of scope for this slice.
9. **No automatic equipment control** — any equipment recommendation stays advisory and approval-required.
10. **No aggressive nutrient/feed/flush/pesticide/irrigation advice from weak context** — weak context → observation-only.
11. **No service_role, bridge tokens, or secrets in this flow** — Phase 1 is pure logic; no privileged credentials.

---

## 8. Golden-Case Safety Coverage

The file `src/test/fixtures/ai-doctor-golden-cases.ts` defines seven regression fixtures. Each fixture pins `now` so results are reproducible, and declares `ExpectedSafetyBehavior` that the engine must satisfy.

| Case | ID | Scenario | Key safety expectation |
|------|-----|----------|------------------------|
| A | `blurry-leaf-no-context` | Single blurry leaf photo, no logs, no sensors | `maxConfidence: 0.2`, empty `likely_issue`, no "deficiency" claims. |
| B | `yellowing-no-history` | Yellowing leaf, no pH/EC/watering/feed history | `maxConfidence: 0.2`, no "nitrogen deficiency" or "feed more". |
| C | `drooping-no-water-history` | Drooping plant, no watering log, no soil moisture | `maxConfidence: 0.2`, no "overwatering"/"underwatering" or irrigation volume. |
| D | `leaf-spots-no-closeup` | Leaf spotting, no pest inspection, no closeups | `maxConfidence: 0.2`, no pest/disease certainty, no pesticide prescription. |
| E | `stale-invalid-only` | Only stale/invalid readings in last 7 days | `maxConfidence: 0.2`, no "healthy" or "stable" claims; may emit advisory recheck. |
| F | `demo-and-csv-only` | Only demo/CSV readings | `maxConfidence: 0.2`, no "data is live" or "based on live" phrasing. |
| G | `conflicting-weak-signals` | Yellowing + one manual humidity + one old CSV temp | `maxConfidence: 0.3`, no "single cause" or "root cause is" phrasing. |

**Universal forbidden phrases** (all cases):
- `turn on`, `turn off`, `set fan`, `set light`, `dose`, `flush immediately`, `increase nutrients`, `guaranteed`, `definitely`, `certainly`

These tests are **regression protection against overdiagnosis**. Any future model or engine change must continue to pass all seven cases.

---

## 9. Validation Commands

### Full Phase 1 suite

```bash
bunx vitest run \
  src/test/ai-doctor-engine-phase1.test.ts \
  src/test/ai-doctor-context-compiler.test.ts \
  src/test/ai-doctor-golden-cases.test.ts \
  src/test/ai-doctor-confidence-adapter.test.ts \
  src/test/ai-doctor-phase1-view-model.test.ts
```

### Latest known result

```
74/74 passed, 0 failed
```

### CI expectation
All five test files must pass before any Phase 1 code is considered valid. Golden-case tests must never be skipped or loosened.

---

## 10. Future Integration Notes

### UI integration
- Mount `buildAiDoctorPhase1ViewModel` output directly.
- Do not rebuild confidence logic, source truth rules, or safety warnings in JSX.
- Use `displayed_confidence_level` for UI labels, not `raw_confidence_level`.

### Real model wiring
- Before release, the real model pipeline must pass all seven golden cases.
- Model output must conform to `Phase1DiagnosisResult` shape.
- Model self-reported confidence must be overridden by `calculateAiDoctorConfidence` conservative scoring.

### Edge Function confidence integration
- If an Edge Function is used for advanced confidence scoring in the future, it must preserve:
  - Hard caps (no trustworthy sensors + no events → max 35, etc.)
  - Level thresholds (0–24, 25–49, 50–74, 75–100)
  - High-confidence quartet gating
- The local `calculateAiDoctorConfidence` serves as a conservative fallback if the Edge Function is unavailable.

### Action Queue integration
- Any future handoff from AI Doctor to Action Queue must stay:
  - User-initiated (not automatic)
  - Approval-required
  - Advisory-only (no executable device commands)
- `actionQueuePanel.disabled_reason` must be respected when confidence is `low` or `very_low`.

### Live sensor integration
- Any new sensor source must be classified into the six tags (`live`, `manual`, `csv`, `demo`, `stale`, `invalid`).
- `stale` and `invalid` handling must be preserved.
- New sources do not automatically become `live`; classification logic must be updated explicitly.

---

## Related Documents

- [`docs/ai-doctor-output-contract.md`](docs/ai-doctor-output-contract.md) — Legacy AI Doctor output shape and field-level contract.
- [`docs/sensor-truth-rules.md`](docs/sensor-truth-rules.md) — Sensor source labeling and healthy-data rules.
- [`docs/action-queue-safety-rules.md`](docs/action-queue-safety-rules.md) — Approval-required Action Queue behavior.
