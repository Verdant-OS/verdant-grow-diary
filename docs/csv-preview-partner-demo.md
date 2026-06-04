# Verdant CSV/TSV Preview — Partner Demo Package

> **Purpose:** Show hardware partners how Verdant turns their sensor exports into plant memory without API access, device control, or automation.
>
> **Safety:** This document and its sample files are read-only. No code changes, no schema changes, no database writes, no alerts, no Action Queue items, no AI calls, no device control.
>
> **Route:** `/sensors/csv-preview`

---

## Positioning (open every partner call with this)

> Verdant is **hardware-neutral**. We do not replace your hardware platform.
> Your hardware collects the data. Verdant turns it into plant memory,
> alert context, AI-grounded recommendations, and **approval-required** decisions.
>
> The grower stays in control. There is **no blind autopilot**.

For CSV/TSV preview specifically:

- Give us your export. Verdant turns it into plant memory.
- No API access required for the first proof.
- No write-back, no device control, no automation.
- Everything happens in the browser. Nothing is saved until the grower explicitly decides to import.

---

## 90-Second Demo Script

**Setup:** Open `https://verdantgrowdiary.com/sensors/csv-preview` in a browser.

1. **Drag and drop** `fixtures/sample-sensor-export-ecowitt.csv` onto the preview area.
2. **Observe:** The source label shows **csv** — never "live."
3. **Observe:** The status banner reads **"Preview only — not saved."**
4. **Scroll to mappings:** Verdant auto-mapped `temp_c` → temperature, `rh` → humidity, `vpd` → VPD, `co2` → CO₂, `soil_vwc` → VWC, `ec_ms_cm` → EC, `ph` → pH, `ppfd` → PPFD.
5. **Point to the flag:** "Humidity stuck at 100 — sensor likely saturated or faulted." Verdant caught a suspicious value before it ever touched plant memory.
6. **Show the timeline:** Time-window controls (24h / 7d / 30d / custom) and sampling options let growers review large exports without overwhelm.
7. **Show the report download:** "Download CSV Preview Report" — a local JSON summary for the grower's records. No network call.
8. **Close:** "That's it. No API keys. No device control. Just your export, mapped, flagged, and previewed. When the grower is ready, they decide whether to import."

---

## 5-Minute Walkthrough Script

### Part A — Clean file walkthrough (3 min)

1. **Open** `/sensors/csv-preview`.
2. **Drag/drop** `fixtures/sample-sensor-export-ecowitt.csv`.
3. **Review the header mapping panel:**
   - Each CSV header is listed with Verdant's suggested canonical field.
   - Click any dropdown to override the mapping locally. The override stays in browser memory only — no persistence.
4. **Review the suspicious values panel:**
   - In the clean EcoWitt sample, expect minimal or no flags.
   - Explain: "These checks run client-side, in-memory, before anything is saved."
5. **Review the timeline preview:**
   - Toggle 24h / 7d / 30d windows.
   - Toggle sampling: "Max 100 points" or "Max 500 points" or "Every Nth row."
   - Explain: "Large exports don't crash the UI. We sample deterministically so the preview stays responsive."
6. **Download the preview report:**
   - Click "Download CSV Preview Report."
   - Open the downloaded JSON. Show it contains mappings, flags, and a sample of timeline rows.
   - Emphasize: "This file never left the browser. It's generated locally from the parsed data."
7. **Scroll to the source label and status banner:**
   - "Source: csv"
   - "Status: Preview only — not saved"
   - "This is not live data. This is a preview."

### Part B — Problematic file walkthrough (2 min)

1. **Refresh the page.** Drag/drop `fixtures/sample-sensor-export-home-assistant.tsv`.
2. **Observe delimiter detection:** Verdant auto-detects TSV (tab-separated) and labels the source as **tsv**.
3. **Review the mapping panel:**
   - `lux` → **unmapped**. Explain: "Lux is not PPFD. Verdant leaves it unmapped rather than guessing."
4. **Review the suspicious values panel:**
   - **"Lux detected — Verdant treats PPFD separately. Left unmapped."** (code: `lux_not_ppfd`)
   - **"Humidity is stuck at 100 — sensor likely saturated or faulted."** (code: `humidity_stuck`)
   - **"pH outside 0–14 — value is not physically possible."** (code: `ph_out_of_range`)
   - **"EC header says mS/cm but values look like µS/cm."** (code: `ec_unit_ambiguous`)
5. **For each flag, explain the partner value:**
   - "These flags help your customers catch sensor drift, unit mismatches, and wiring faults before they make grow decisions based on bad data."
   - "Verdant won't silently substitute or correct these values. We flag them and let the grower decide."
6. **Close:**
   - "Your hardware export, our mapping intelligence, the grower's judgment. That's the loop."

---

## QA Checklist

Run before every partner demo. All items must pass.

| # | Check | How to verify |
|---|-------|---------------|
| 1 | Route loads | Navigate to `/sensors/csv-preview`. Page renders without error. |
| 2 | CSV drag/drop works | Drop `fixtures/sample-sensor-export-ecowitt.csv`. Parse completes within 2 seconds. |
| 3 | TSV drag/drop works | Drop `fixtures/sample-sensor-export-home-assistant.tsv`. Delimiter detected as tab. |
| 4 | Source label shows `csv` or `tsv` | After drop, source badge reads "csv" or "tsv" — never "live." |
| 5 | Status shows "Preview only — not saved" | Banner is visible on first load and after every drop. |
| 6 | "Not live data" copy appears | Page contains text like "CSV source, not live data" or equivalent. |
| 7 | Mapping overrides work | Click a mapping dropdown, select a different canonical field. Preview updates immediately. |
| 8 | Suspicious fields are flagged | At least one flag renders with severity (warn / error) and human message. |
| 9 | Time-window controls work | Click 24h / 7d / 30d. Timeline preview filters accordingly. |
| 10 | Sampling controls work | Click "Max 100 points" / "Max 500 points" / "Every Nth row." Preview updates. |
| 11 | Report download works | Click "Download CSV Preview Report." File downloads as `.json`. Contains mappings and flags. |
| 12 | No save/import button exists | Confirm there is no button labeled "Save," "Import," "Ingest," or "Persist." |
| 13 | Empty/invalid CSV shows safe error | Drop a file with only headers or garbage text. Error message is friendly and safe. |
| 14 | No network writes occur | Open browser DevTools → Network. Confirm no `supabase.co`, `fetch` to API, or `functions.invoke` calls on drop or download. |
| 15 | Large file handling (>10,000 rows) | Generate a large CSV (or use a script). Drop it. UI remains responsive. Sampling kicks in automatically. |

---

## Partner Framing

Use these talking points verbatim when asked about the integration model:

> **"Give us your export. Verdant turns it into plant memory."**
>
> Hardware partners do not need to build an API integration for the first proof. A CSV or TSV export is enough. Verdant's preview shows the grower exactly how their data maps, what looks suspicious, and what the timeline would look like — before anything is saved.

> **"No API access required for the first proof."**
>
> The partner demo runs entirely in the browser. No API keys, no OAuth, no webhook endpoints, no cloud-to-cloud sync. The grower drags their file in and sees the preview immediately.

> **"No write-back, no device control, no automation."**
>
> Verdant does not send commands back to hardware. The preview is read-only. Even after future import, the Action Queue remains approval-required. There is no path from a CSV drop to an automated equipment change.

---

## Follow-Up Email Template

**Subject:** Verdant CSV Preview — Sample Export Request

```
Hi [Partner Name],

Thanks for the call. As discussed, Verdant can preview your sensor exports
without any API integration. To build the mapping, we need:

1. Sample export file (CSV or TSV)
   - 20–50 rows is enough
   - Include all columns your export typically contains
   - Fake/demo data only — no real user data or tokens

2. Header definitions
   - What each column means
   - Units for every numeric column (°C/°F, %, ppm, mS/cm, µS/cm, etc.)

3. Timestamp format and timezone
   - Example: ISO 8601 UTC, or local time with offset

4. Source/vendor identifiers
   - How you label the device/gateway in the export
   - Any firmware version fields

Safety notes:
- Verdant parses everything client-side in the browser.
- Nothing is saved or sent to our backend during the preview.
- Source labels stay honest: csv / tsv / mqtt / api — never mislabeled as "live."
- Suspicious values (stuck sensors, unit mismatches, impossible pH) are flagged
  before they reach plant memory.

Send the sample to [email] and we'll reply with a mapped preview within 48 hours.

— The Verdant Team
```

---

## Sample Files

| File | Format | Purpose |
|------|--------|---------|
| `fixtures/sample-sensor-export-ecowitt.csv` | CSV | Clean walkthrough — realistic values, minimal flags |
| `fixtures/sample-sensor-export-home-assistant.tsv` | TSV | Problem walkthrough — flags for lux→PPFD, stuck humidity, bad pH, EC unit mismatch |

Both files:
- Use **demo/sample data only**. No real user data, no secrets, no tokens.
- Include a `source` column (or equivalent notes) with value `csv` or `tsv`.
- Include temperature, humidity, VPD, CO₂, soil moisture/VWC, EC, pH, PPFD, and timestamp.
- Include at least one suspicious row to trigger flagging.
- Are clearly labeled as demo/sample in header comments.

---

## Safety Guarantees

This demo package enforces the following constraints:

1. **No code changes.** This is documentation + fixtures only.
2. **No schema changes.** No database migrations.
3. **No writes.** No `insert`, `update`, `upsert`, `delete`, or `rpc` calls.
4. **No Supabase calls.** No `supabase.from`, `supabase.auth`, or `supabase.storage`.
5. **No Edge Functions.** No `functions.invoke`.
6. **No alerts.** No alert creation or trigger logic.
7. **No Action Queue writes.** No queue item creation or status changes.
8. **No AI calls.** No `ai-doctor`, `coach`, or `gpt` invocations.
9. **No automation.** No scheduled jobs, triggers, or background processing.
10. **No device control.** No fan, light, pump, heater, humidifier, or dosing commands.
11. **Honest source labels.** Demo data is labeled `csv` or `tsv`, never `live`.
12. **No fake live data.** The preview explicitly states the data is not live.

---

## Version

- **Package version:** 1.0.0
- **Created:** 2026-06-04
- **Compatible with:** Verdant CSV/TSV Preview v2 (`/sensors/csv-preview`)
- **Route verified:** `/sensors/csv-preview`
