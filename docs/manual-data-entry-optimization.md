# Manual Data Entry Optimization — Verdant Design Document

> Version: 2.0 (Draft)  
> Scope: In-app logging, QuickLog v2, grow-room workflow ergonomics, AI-ready data capture.  
> Constraint: This document is design-only. No code changes, no schema changes, no UI refactors.

---

## 1. QuickLog v2 Concept

### 1.1 Philosophy
QuickLog v2 treats every entry as a **two-phase transaction**:
1. **Fast Capture** — Get the observation on-record in < 5 seconds.
2. **Detailed Enrichment** — Add structured data later, when time and context allow.

This mirrors how growers actually work: a quick note in the grow room, details filled in on the couch.

### 1.2 Entry Lifecycle
```text
[Create] → Fast Capture → (optional) Detailed Enrichment → (optional) AI Analysis → Archive
```

### 1.3 Core Principles
- **Zero-friction first**: The default path must be one tap + one sentence.
- **Structured later**: Enrichment is encouraged, never forced.
- **Context-aware**: The app should know the grower’s current environment and pre-fill intelligently.
- **Undo-friendly**: Every entry is editable; fast-capture sloppiness is recoverable.

---

## 2. Fast Capture vs Detailed Enrichment

### 2.1 Fast Capture Mode
| Field | Behavior | Input |
|-------|----------|-------|
| `note` | Required free text | Voice or keyboard |
| `grow_id` | Pre-filled from active grow | Tap to override |
| `stage` | Pre-filled from grow stage | Tap to override |
| `photo` | Optional, one-tap camera | Camera roll or live capture |
| `event_type` | Defaults to `observation` | Tap to override |
| `timestamp` | Auto `now()` | Swipe to adjust |

**Target time-to-log: 3–5 seconds.**

### 2.2 Detailed Enrichment Mode
Triggered by:
- Tapping "Add Details" toggle in Fast Capture
- Opening any past entry for editing
- Explicit "Structured Log" entry point

Enrichment fields are context-sensitive based on `event_type`.

---

## 3. Smart Defaults

### 3.1 Grow Context Defaults
| Context | Default Value | Override Condition |
|---------|---------------|--------------------|
| Active grow | Most recently viewed grow with `status = 'active'` | User manually switches grows |
| Stage | `grows.stage` | User selects different stage |
| Tent | Tent with most recent sensor activity | User selects specific tent |
| Plant | Most recently logged plant for this grow | User selects specific plant |

### 3.2 Time Defaults
| Field | Default | Override |
|-------|---------|----------|
| `created_at` | `now()` | Time-shift ± up to 24h |
| `remind_at` | `now() + 24h` | User-defined |

### 3.3 Event Type Inference
The app should suggest `event_type` based on note content keywords:

| Keyword(s) | Suggested Event Type |
|------------|----------------------|
| "water", "watered", "H2O" | `watering` |
| "feed", "nutrients", "NPK", "bloom", "veg" | `feeding` |
| "LST", "topped", "fim", "bend" | `training` |
| "defol", "trim fan" | `defoliation` |
| "transplant", "repot", "moved to" | `transplant` |
| "pH", "EC", "PPM", "runoff" | `measurement` |
| "temp", "humidity", "RH", "VPD" | `environment` |
| "mold", "pest", "bug", "spider", "mites" | `pest_disease` |
| "harvest", "chop", "cut down" | `harvest` |
| "remind", "remember to", "don’t forget" | `reminder` |

Confidence threshold: ≥ 0.6 → auto-suggest; < 0.6 → default to `observation`.

---

## 4. Copy Last Log

### 4.1 Concept
One-tap duplication of the most recent log entry, pre-filled with all fields from the prior entry, allowing the grower to edit only what changed.

### 4.2 Use Cases
- **Watering logs**: Same amount, same nutrients, same runoff — only pH might differ.
- **Feeding logs**: Same recipe, adjusted EC.
- **Environment checks**: Same tent, readings differ slightly.

### 4.3 UX Specification
- **Entry point**: "Copy Last" button beside the primary "New Log" button.
- **Pre-fill behavior**: All fields from the most recent entry of the same `event_type` for the current `grow_id`.
- **Smart deltas**: Numeric fields (pH, EC, ml) show the previous value with ± adjustment buttons.
- **Photo handling**: Previous photo is **not** copied; a fresh photo prompt is shown.

---

## 5. Recent Values

### 5.1 Concept
When enriching a log entry, show the last 3 recorded values for each field as inline chips. Tapping a chip fills the input with that value.

### 5.2 Applicable Fields
- `pH`
- `EC` / `PPM`
- `runoff`
- `nutrients` (text search)
- `watering` (ml)
- `training` (text search)

### 5.3 Display Rules
- Show timestamp of each recent value (e.g., "6.2 — 2d ago").
- Values outside the safe range for the current stage are flagged with a subtle warning color.
- Empty state: "No recent values" with a prompt to add one.

---

## 6. Presets

### 6.1 Concept
Grower-defined templates for recurring log patterns. A preset is a named bundle of default field values for a specific `event_type`.

### 6.2 Preset Structure
```typescript
interface LogPreset {
  id: string;
  name: string;                 // e.g., "Week 4 Bloom Feed"
  event_type: EventType;
  grow_id?: string;             // Optional: global or grow-scoped
  fields: {
    nutrients?: string;         // "Bloom A+B 4ml/L"
    ph?: string;
    ec?: string;
    watering?: string;
    training?: string;
    // ... other event-specific fields
  };
  is_default: boolean;        // Auto-selected when creating new log
}
```

### 6.3 UX Specification
- **Create**: Any log entry can be "Saved as Preset" post-submission.
- **Use**: Presets appear as chips above the form; tapping one pre-fills all applicable fields.
- **Manage**: Dedicated "Presets" section in Settings.
- **Scope**: Presets can be global (cross-grow) or grow-specific.

### 6.4 Built-in Suggestions (Seed Presets)
For new users, suggest common presets based on grow stage:

| Stage | Suggested Preset Name |
|-------|----------------------|
| Seedling | "Light Water + CalMag" |
| Veg | "Veg Feed + LST Check" |
| Flower | "Bloom A+B + pH Check" |
| Flush | "Plain Water pH 6.2" |
| Cure | "Humidity Check + Burp" |

---

## 7. Bulk Logging

### 7.1 Concept
Log the same action across multiple plants, tents, or grows in a single flow.

### 7.2 Use Cases
- Watered all 6 plants in Tent A → one flow, 6 entries.
- Same defoliation action on 3 plants → one flow, 3 entries.
- Environment check across all 4 tents → one flow, 4 entries.

### 7.3 UX Specification
- **Entry point**: "Bulk Log" toggle in QuickLog; or long-press "New Log".
- **Selection**: Checklist of plants/tents with "Select All" per tent.
- **Unified fields**: Common fields (note, event_type, photo) apply to all selected items.
- **Per-item overrides**: Optional inline expansion to adjust per-plant details (e.g., different ml per plant).
- **Confirmation**: Summary screen showing N entries before commit.
- **Undo**: Bulk actions create individual entries; each is independently editable/deletable.

---

## 8. Photo-First Logging

### 8.1 Concept
For many growers, the photo *is* the log. The note is optional enrichment.

### 8.2 UX Specification
- **Camera-first entry**: Long-press camera icon → opens camera immediately, photo taken → auto-creates draft entry with `event_type: "photo"`.
- **Photo as primary**: In the log stream, photo thumbnails are prominent; text is secondary.
- **AI-assisted caption**: (Future) Photo upload triggers on-device visual analysis suggesting event types (e.g., "Detected yellowing leaves → suggest `diagnosis`").
- **EXIF preservation**: Capture timestamp, geolocation (if permitted), and device camera metadata for provenance.

### 8.3 Mobile Optimizations
- Full-screen camera with grow/stage overlay badges.
- Swipe left/right to apply filters or compare to previous photo of same plant.
- Burst mode: Capture 3 photos rapid-fire; user picks best before saving.

---

## 9. Voice-to-Log (Future Concept)

### 9.1 Vision
Hands-free logging while working in the grow room. Speak naturally; the app transcribes, parses, and structures the log.

### 9.2 Flow
```text
[Hold mic button] → "Watered tent A, pH six point two, two liters, runoff clear" 
→ [Transcribe] → "Watered Tent A, pH 6.2, 2L, runoff clear"
→ [Parse] → event_type: watering, ph: 6.2, watering: 2000, note: "runoff clear"
→ [Confirm] → One-tap save or edit
```

### 9.3 Technical Considerations
- **Privacy-first**: On-device speech recognition preferred; cloud fallback for accuracy.
- **Grow slang training**: Custom vocabulary ("LST", "FIM", "defol", "cola", "trichomes", "flush", "cure", "burp").
- **Numeric parsing**: "six point two" → `6.2`; "two fifty ppm" → `250`.
- **Ambiguity handling**: If parsing confidence < 0.7, show transcription for manual tagging.

### 9.4 Offline Capability
Voice notes are stored as raw audio blobs locally; transcription and parsing queue for when connectivity returns.

---

## 10. AI-Ready Symptom Intake

### 10.1 Concept
Structure grower observations so they can be consumed by future AI diagnostic tools without requiring free-text NLP at inference time.

### 10.2 Intake Fields (Symptom Mode)
When `event_type` is `diagnosis` or `pest_disease`, present structured intake:

| Field | Type | Options / Format |
|-------|------|------------------|
| `affected_area` | Multi-select | Leaves, Stem, Buds, Roots, Whole Plant |
| `symptom_location` | Select | Upper canopy, Lower canopy, Tips, Margins, Veins, Internodes |
| `symptom_type` | Multi-select | Yellowing, Browning, Spotting, Curling, Wilting, Droop, Stretching, Holes, Webbing, Slime |
| `progression` | Select | Sudden (24h), Fast (2–3d), Gradual (1w+), Stable |
| `environmental_changes` | Multi-select | Temperature swing, Humidity spike, New nutrients, Transplant, Light change, Pest sighting |
| `severity` | Scale 1–5 | 1 = Cosmetic, 5 = Plant death risk |
| `photos` | Array | Close-up, whole plant, affected area, environment |

### 10.3 AI Output Target
Structured intake produces a JSON payload that can be fed to:
- On-device diagnosis models
- Backend AI coach (`ai-coach` edge function)
- Community expert review queue

### 10.4 Backward Compatibility
All structured fields are stored inside `details` JSONB. Existing free-text `note` remains primary. AI intake is additive, never replacing narrative.

---

## 11. Mobile Grow-Room Workflow

### 11.1 Context
Growers log while:
- Hands are wet/dirty.
- Lighting is dim (red/blue spectrum).
- Wearing gloves.
- Moving between tents.

### 11.2 Design Requirements

| Challenge | Solution |
|-----------|----------|
| Wet/dirty hands | Large tap targets (min 48×48 dp). Voice-to-log fallback. |
| Dim lighting | High-contrast UI, OLED black mode, red-light-safe color palette. |
| Gloves | Swipe gestures over precise taps. Haptic feedback on actions. |
| Moving between tents | NFC/QR tent tags → auto-switch grow context on scan. |
| No free hand | One-handed mode: all controls reachable within thumb zone. |
| Offline | Full offline queue with conflict resolution on sync. |

### 11.3 One-Handed Mode Specification
- Primary action button anchored to bottom-right (thumb zone).
- Form fields stack vertically; no horizontal scrolling.
- Photo capture: volume-button shutter (system default).
- Swipe-to-save: up-swipe on primary button commits entry.

### 11.4 Tent Tag System (Future)
- NFC sticker or QR code on each tent.
- Scan → auto-selects tent, loads recent logs, pre-fills environment snapshot.
- Reduces context-switching friction to zero.

---

## 12. Required vs Optional Fields by Event Type

### 12.1 Watering

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `event_type` | Auto | `watering` | — |
| `grow_id` | Yes | Active grow | — |
| `stage` | Yes | Grow stage | — |
| `note` | No | — | Optional narrative |
| `photo` | No | — | Visual confirmation |
| `details.watering` | No | Last value | Volume in ml or L |
| `details.ph` | No | Last value | Target range: 6.0–6.8 |
| `details.ec` | No | Last value | Optional for plain water |
| `details.runoff` | No | — | Description or pH |
| `details.nutrients` | No | — | If feeding simultaneously |
| `details.remind_at` | No | — | Next watering reminder |

### 12.2 Feeding

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `event_type` | Auto | `feeding` | — |
| `grow_id` | Yes | Active grow | — |
| `stage` | Yes | Grow stage | — |
| `note` | No | — | Recipe notes, observations |
| `photo` | No | — | Mix color, runoff, plant response |
| `details.nutrients` | Yes | Last value | Brand + dosage |
| `details.ph` | Yes | Last value | Post-mix pH |
| `details.ec` | Yes | Last value | Target EC/PPM |
| `details.watering` | No | Last value | Total mix volume |
| `details.runoff` | No | — | Runoff EC/pH |
| `details.remind_at` | No | — | Next feed reminder |

### 12.3 Photo

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `event_type` | Auto | `photo` | — |
| `grow_id` | Yes | Active grow | — |
| `stage` | Yes | Grow stage | — |
| `photo_url` | Yes | — | At least one photo |
| `note` | No | — | Caption |
| `details.plant_id` | No | — | Which plant |
| `details.tent_id` | No | — | Which tent |
| `details.sensor` | No | Current snapshot | Auto-attach environment |

### 12.4 Training

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `event_type` | Auto | `training` | — |
| `grow_id` | Yes | Active grow | — |
| `stage` | Yes | Grow stage | — |
| `note` | No | — | What was done, why |
| `photo` | No | — | Before/after |
| `details.training` | Yes | — | Technique: LST, topping, FIM, etc. |
| `details.plant_id` | No | — | Which plant(s) |
| `details.remind_at` | No | — | Follow-up check |

### 12.5 Observation

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `event_type` | Auto | `observation` | — |
| `grow_id` | Yes | Active grow | — |
| `stage` | Yes | Grow stage | — |
| `note` | Yes | — | Core of the log |
| `photo` | No | — | Evidence |
| `details.plant_id` | No | — | Subject |
| `details.health` | No | — | Subjective assessment |

### 12.6 Environment Check

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `event_type` | Auto | `environment` | — |
| `grow_id` | Yes | Active grow | — |
| `stage` | Yes | Grow stage | — |
| `note` | No | — | Anomalies, changes |
| `photo` | No | — | Sensor display, equipment |
| `details.sensor` | No | Auto-filled | Tent snapshot: temp, RH, VPD, CO2 |
| `details.temp` | No | Snapshot | Override if manual reading |
| `details.rh` | No | Snapshot | Override if manual reading |
| `details.vpd` | No | Snapshot | Calculated or manual |
| `details.co2` | No | Snapshot | Override if manual reading |

---

## 13. Open Questions & Future Work

| Question | Priority | Status |
|----------|----------|--------|
| Should voice-to-log be real-time streaming or record-then-process? | Medium | Open |
| NFC/QR tent tag MVP — sticker printing integration or DIY? | Low | Open |
| AI symptom intake — on-device model or edge function? | Medium | Open |
| Bulk log undo — batch delete UI or individual per-entry? | Low | Open |
| Preset sharing — community preset marketplace? | Low | Open |
| Photo-first offline queue — raw image storage limits? | Medium | Open |
| Red-light-safe theme — separate color palette or adaptive? | Low | Open |

---

## 14. Appendix: Field Reference Quick-Lookup

| Field Key | Type | Applicable Event Types | Validation |
|-----------|------|------------------------|------------|
| `note` | Text | All | Max 2000 chars |
| `photo_url` | String | All | Storage path reference |
| `stage` | Enum | All | `seedling`, `veg`, `flower`, `flush`, `harvest`, `cure` |
| `event_type` | Enum | All | See `EVENT_TYPES` registry |
| `details.ph` | Number | Watering, Feeding, Measurement | 0–14, 2 decimal places |
| `details.ec` | Number | Watering, Feeding, Measurement | ≥ 0, 2 decimal places |
| `details.watering` | Number | Watering, Feeding | ml, integer |
| `details.nutrients` | Text | Feeding | Max 500 chars |
| `details.runoff` | Text | Watering, Feeding | Max 500 chars |
| `details.training` | Text | Training | Max 500 chars |
| `details.sensor` | JSONB | Photo, Environment | See `SensorSnapshot` type |
| `details.remind_at` | ISO8601 | Watering, Feeding, Training | Must be future date |
| `details.plant_id` | UUID | Photo, Training, Observation | FK to plants table |
| `details.tent_id` | UUID | Photo, Environment | FK to tents table |

*Document maintained by the Verdant Product & Engineering team.  
Last updated: 2026-05-18*
