# Sensors page: daily readings first, setup separate

Status: draft spec. Founder decisions D1 to D3 are in §6. This is a spec only; it changes no
application code.

Source: live grower audit 2026-11-03, finding 7. The audit says the Sensors page "mixes routine
observation with developer setup". A grower who only wants to record a handheld reading has to get
past charts, imports, source legends, bridge status, an EcoWitt testbench, diagnostics, token
minting and command examples.

Measured on the deploy branch `verdant-grow-diary` at `c03f64a`.

## 1. Collision check

Four EcoWitt and MQTT PRs are open: #2732, #2751, #2752 and #2757. None of them edits
`src/pages/Sensors.tsx`, and the page mounts none of the EcoWitt station cards that #2732
changes. `EcowittTentSnapshotV0Card` mounts only at `src/pages/TentDetail.tsx:762`.
`EcowittCustomUploadStationCard` and `EcowittCustomUploadStationMount` are new files in #2732 and
are not on base. The EcoWitt blocks Sensors does mount are `EcowittBridgeTroubleshootingPanel`
(`src/pages/Sensors.tsx:986`), `EcowittLiveProofPanel` (`:1033`) and
`EcowittIngestAuditProofPanel` (`:1039`); this spec moves them only as whole components.

## 2. What renders today (source-traced)

`src/pages/Sensors.tsx` renders this inside `Sensors()`, starting at line 472:

| Line     | Block                                                                                                                   | Group                                   | Renders when                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 475      | `PageHeader` "Sensor Data"                                                                                              | —                                       | always                                                                                                                                            |
| 479      | `SensorsCsvImportEntry` (CSV import button)                                                                             | History/Import                          | always                                                                                                                                            |
| 505      | `GrowDataSourceBadge`                                                                                                   | Daily                                   | always                                                                                                                                            |
| 522–545  | manual-history-pending notice, VPD stability notes                                                                      | Daily                                   | per data                                                                                                                                          |
| 667–850  | per-metric cards: temp, RH, VPD, soil. Each has a chart, derived-VPD notes, soil calibration badges and a stage hint    | Daily (current value) + History (chart) | per metric                                                                                                                                        |
| 867–905  | manual reading anchor, first-tent setup, required-tent-unavailable, `ManualSensorReadingCard`, `ManualSensorTrendChart` | Daily (form) + History (trend)          | per tent                                                                                                                                          |
| 915–925  | CSV import anchor                                                                                                       | History/Import                          | per tent                                                                                                                                          |
| 934–952  | source explainer, `SensorSourceLegendTooltip`, `SensorSourceLegendCompact`                                              | Daily (labels)                          | always                                                                                                                                            |
| 969–971  | `SensorsTestbenchPanel` (EcoWitt testbench, bridge tokens, command examples)                                            | Connect                                 | `canMountLiveSensorSetup` allows it: the server live-sensor gate is open for the active tent (`src/lib/entitlements/liveSensorSetupAccess.ts:27`) |
| 974–1044 | "Operator diagnostics — read-only"                                                                                      | Connect                                 | `?operator=1` and the server `operator` role (`src/lib/sensorOperatorAccessRules.ts:16`)                                                          |
| 1045     | EcoWitt live-proof unavailable notice                                                                                   | Connect                                 | no manual tent                                                                                                                                    |

**Who sees the setup material.** Operator diagnostics are already hidden from growers.
`SensorsTestbenchPanel` is not: it shows to any grower whose server live-sensor gate is open for
the tent. That is the material the audit hit, below the daily readings on the same scroll.

## 3. An inconsistency to resolve (uncertainty)

- `src/components/ManualSensorReadingCard.tsx:976` tells growers: "pH, EC/TDS, water temp, and DLI
  … aren't stored as sensor metrics yet — log them as a Quick Log feeding or observation note."
- `src/lib/manualSensorFreshnessRules.ts:10` defines manual sensor metrics as
  `"temp_f" | "humidity_percent" | "ph" | "ec"`. The plant freshness card tracks pH and EC
  freshness.

One of these is out of date, or they describe different capture paths: the tent form versus plant
manual snapshots. The implementer must trace where `ph` and `ec` freshness rows come from before
changing either. This spec does not assume an answer. The audit's statement that the form "does not
store pH, EC/TDS…" matches the form's own copy.

## 4. Safety fences

- **F1:** source labels, the source legend, stale and invalid states, and calibration badges stay
  next to every value they describe. No value moves away from its label.
- **F2:** no fake live data. Empty or unavailable states stay truthful in every section.
- **F3:** access gates are unchanged. `canMountLiveSensorSetup` and
  `canShowSensorOperatorDiagnostics` still decide what mounts. Moving a block never widens who
  sees it.
- **F4:** nothing renders a token, secret or bridge credential in the Daily section. Token minting
  stays inside the gated Connect panel.
- **F5:** no device control. Connect stays read-only and setup-only.

## 5. Requirements

- **R1:** per D1, the page has three parts: **Daily readings**, **History & import**, and
  **Connect & diagnostics**.
  - Daily readings: current values, source labels, and the manual reading form.
  - History & import: charts, the trend chart and CSV import.
  - Connect & diagnostics: the testbench, the EcoWitt bridge troubleshooting, live-proof and
    ingest-audit panels, and operator diagnostics.
- **R2:** per D2, Daily readings is first and open by default. The manual reading form is reachable
  without scrolling past charts at 390 × 844.
- **R3:** Connect & diagnostics is closed by default and keeps its gates (F3). A grower whose live
  gate is closed never sees an empty Connect section.
- **R4:** existing testids and the `#manual-reading` and `#csv-import` deep links keep working.
  Those are the anchor ids at `Sensors.tsx:864` and `:912`, with testids
  `sensors-manual-reading-anchor` and `sensors-csv-import-anchor`. A link to an anchor opens its
  section.
- **R5:** per D3, the pH/EC wording is made consistent with whatever §3's trace finds.

## 6. Founder decisions

- **D1 (layout):** three tabs (a), three collapsible sections on one page (b), or move Connect to
  its own route, such as `/sensors/connect` (c). Recommendation: **(b)**. It keeps one URL and the
  existing anchors, and it is the smallest change. (c) is cleaner long term but adds a route and
  navigation.
- **D2 (default open):** Daily only (a), or Daily plus History (b). Recommendation: **(a)**, so
  the handheld-reading path is first.
- **D3 (pH/EC):** after §3 is traced, either fix the copy if pH and EC are already storable, or
  keep the copy and open a separate spec for pH/EC as sensor metrics. This is your call once the
  trace is done. Storing new metrics would be a schema change and out of scope here.

## 7. Acceptance tests

1. At 390 × 844, the manual reading form is visible after opening Sensors, with no scrolling past
   charts. (R2)
2. Every value keeps its source label and calibration badge in its section. (F1)
3. With the live gate closed, no Connect section and no testbench render. (R3, F3)
4. With `?operator=1` but no operator role, no diagnostics render. (F3)
5. `/sensors#manual-reading` and `/sensors#csv-import` open their sections and scroll to the
   target. (R4)
6. No token or bridge credential text renders outside Connect. (F4)
7. The existing Sensors tests pass, or pins are renegotiated only where structure was asked to
   change.

## 8. File plan (after D1 to D3)

1. A pure section-assignment table in a new `src/lib/sensorsPageSectionRules.ts`, with tests.
2. Section wrappers in `src/pages/Sensors.tsx`, using the existing collapsible primitive. Mount
   blocks unchanged.
3. The §3 trace, then the D3 copy fix.
