# EcoWitt Dry-Run Operator Runbook

**Read-only. Nothing is sent. No Supabase writes. No Edge calls. No bridge tokens. No AI. No alerts. No Action Queue. No automation. No device control.**

This runbook explains how an operator uses the read-only EcoWitt ingest dry-run preview at `/operator/ecowitt-tent-preview` to inspect what Verdant *would* send to a future real ingest path — **without sending anything now**.

---

## 1. Purpose

The dry-run preview exists to:

- Let operators review canonical EcoWitt tent snapshots before any real ingest is built or enabled.
- Prove exactly what Verdant *would* send later, with zero risk of sending now.
- Verify canonical snapshot quality: source label, freshness, degraded state, invalid state, required metrics, optional metrics, and identity context.
- Verify that the dry-run payload taxonomy (`blocked_reasons` and `warnings`) catches sensor-truth violations.
- Verify deterministic export payload shape for QA, partner demos, and future ingest planning.
- Protect **sensor truth**: prevent fake-live data, prevent unknown telemetry from being classified as healthy, and prevent placeholder identity from being mistaken for real ingest context.

The dry-run preview is **not** an ingest, **not** a webhook, **not** a Supabase write, **not** an Action Queue write, **not** an alert, **not** an AI call, and **not** a device command. It builds a JSON object client-side and shows it to you.

---

## 2. Operator workflow

Step through these in order.

### A. Open the preview

Navigate to `/operator/ecowitt-tent-preview`.

### B. Select or inspect an EcoWitt tent snapshot

- Pick a tent: **Flower**, **Seedling**, or **Vegetation**.
- Pick a sample payload (`valid`, `degraded`, `invalid`, `just-fresh`, `just-stale`).
- Confirm the visible **tent label**, **provider**, and **captured_at** are what you expect.

### C. Confirm canonical snapshot status

- Look at the **Source** badge.
- Look at metric rows for Air / RH / Soil T / Soil M1 / Soil M2.
- Look at **Root-zone confidence**.
- Look at **Degraded reasons** and **Invalid reasons** sections, if present.

### D. Review the source label

Accepted Verdant source labels:

| Label      | Meaning |
|------------|---------|
| `live`     | Fresh, plausible telemetry. |
| `manual`   | Operator-entered. Never describe as live. |
| `csv`      | Imported history. Never describe as live. |
| `demo`     | Demo/fixture data. Never describe as live. |
| `stale`    | Telemetry too old to trust as current. |
| `invalid`  | Telemetry is unusable. Never label as healthy. |
| `degraded` | Partially usable. Surfaces warning(s) but may be sendable. |

EcoWitt canonical snapshots emit `live | degraded | invalid`. Any future widening (`manual`, `csv`, `demo`) must continue to fail the "is this live?" check.

### E. Review the identity overrides

The **Dry-run identity overrides** panel exposes four preview-only inputs:

- `tent_id`
- `plant_id`
- `device_identity`
- `source_identity`

### F. Confirm the overrides are preview-only

- They are **not persisted**.
- They are **not validated** against Supabase.
- They **do not** imply that any real database row, device, or sensor source exists.
- Empty `plant_id`, `device_identity`, and `source_identity` serialize to `null`.
- A blank `tent_id` falls back to the placeholder `preview-only-tent-id` and surfaces a warning (or a blocked reason if `require_real_tent_id` is set).

### G. Review the canonical → ingest mapping panel

For each ingest metric, the panel shows the source field, whether it is required, the current value, and a status (`mapped`, `missing_required`, `missing_optional`, `blocked`, `warning`).

### H. Check required metrics

Both must be present and non-null:

- `air_temp_f`
- `humidity_pct`

If either is missing, the dry-run is **blocked** and cannot be marked as future-ingest-ready.

### I. Review warnings

Open the **warnings** list under the dry-run panel. See [§4 Warnings](#4-warnings).

### J. Review blocked reasons

Open the **blocked reasons** list. If any blocked reason is present, `can_send_later` is `BLOCKED`. See [§3 Blocked reasons](#3-blocked-reasons).

### K. Export the selected dry-run JSON

Click **Export dry-run ingest payload**. This downloads a single deterministic JSON file to your browser. No network call.

### L. Export all-tent dry-run JSON

Click **Export dry-run for all tents**. This downloads one deterministic JSON file per available EcoWitt tent (Flower, Seedling, Vegetation), using the currently selected sample. Identity overrides only apply to the currently selected tent; other tents serialize with `null` identity and the placeholder tent context.

### M. Confirm every payload says:

```json
{
  "not_sent": true,
  "read_only": true,
  "dry_run_payload": {
    "read_only": true,
    "not_sent": true,
    "metadata": {
      "read_only_preview": true,
      "not_sent": true
    }
  }
}
```

If any of these flags are missing, **stop**. Do not treat the payload as a valid dry-run sample.

---

## 3. Blocked reasons

Blocked reasons are emitted by `buildEcowittIngestDryRun`. If any are present, `can_send_later = false`.

| Reason | Meaning | Stop? | Correction before any future real ingest |
|--------|---------|-------|------------------------------------------|
| `source_invalid` | Canonical snapshot source is `invalid`. | Yes | Discard the snapshot. Do not classify invalid telemetry as healthy. |
| `missing_required_metric:air_temp_f` | Air temperature is `null`. | Yes | Wait for a snapshot with air temperature. |
| `missing_required_metric:humidity_pct` | Humidity is `null`. | Yes | Wait for a snapshot with humidity. Environment context (VPD) is incomplete without it. |
| `invalid_reason:<reason>` | A specific invalid-reason from the normalizer. | Yes | Investigate the cited reason at the EcoWitt channel level. |
| `stale_snapshot:age_exceeds_freshness_window` | Snapshot age exceeds the freshness window (10 minutes). | Yes | Wait for fresh telemetry. Do not present stale data as current. |
| `non_uuid_tent_id_preview_only` | Tent context is the placeholder or non-UUID (only blocks when `require_real_tent_id` is set). | Yes for real ingest | Future real ingest requires a real UUID-backed tent. |

### Examples

- `missing_required_metric:air_temp_f` — the snapshot cannot become a future ingest candidate until air temperature is present.
- `missing_required_metric:humidity_pct` — humidity is absent and VPD / environment context is incomplete.
- `stale_snapshot:age_exceeds_freshness_window` — the snapshot is too old to be treated as current.
- `non_uuid_tent_id_preview_only` — the dry-run still uses a placeholder/non-real tent context.

---

## 4. Warnings

Warnings do **not** always block the dry-run. They must be reviewed before any future real ingest path is approved.

| Warning | Meaning |
|---------|---------|
| `source_degraded` | Canonical source is `degraded` (partially trustworthy). |
| `degraded_reason:<reason>` | Specific degraded-reason from the normalizer. |
| `placeholder_device_identity` | `device_identity` is null/empty — not traceable yet. |
| `optional_metric_missing:<metric>` | An optional metric (e.g. `soil_temp_f`) is missing. |
| `manual_or_csv_not_live` | Source is not `live`. The data must not be displayed or described as live. |
| `non_uuid_tent_id_preview_only` | Tent context is placeholder/non-UUID (warning by default; blocking if `require_real_tent_id`). |

### Examples

- `manual_or_csv_not_live` — the data must not be displayed or described as live.
- `placeholder_device_identity` — device/source identity is not ready for real traceability.
- `optional_metric_missing:soil_temp_f` — soil temp is unavailable but not required to mark the dry-run sendable.

---

## 5. Canonical → ingest field mapping

The mapping panel exists so the operator can see **exactly** which canonical snapshot field would populate each future ingest metric. It also makes missing required metrics impossible to overlook.

| Ingest metric                  | Canonical snapshot source                  | Required? | Operator check |
|--------------------------------|--------------------------------------------|-----------|----------------|
| `air_temp_f`                   | `metrics.air_temp_f`                       | Yes       | Must be present; blocks if null. |
| `humidity_pct`                 | `metrics.humidity_pct`                     | Yes       | Must be present; blocks if null. |
| `vpd_kpa`                      | Derived from `air_temp_f` + `humidity_pct` | No        | Reported as missing if either input is null. |
| `soil_water_content_pct`       | `metrics.soil_moisture_pct_primary`        | No        | Warns if null. |
| `soil_water_content_pct_secondary` | `metrics.soil_moisture_pct_secondary`  | No        | Warns if null. |
| `soil_temp_f`                  | `metrics.soil_temp_f`                      | No        | Warns if null. |
| `soil_ec`                      | Not present in EcoWitt canonical today     | No        | Reported as `missing_optional` if absent. |
| `co2_ppm`                      | Not present in EcoWitt canonical today     | No        | Reported as `missing_optional` if absent. |
| `ppfd`                         | Not present in EcoWitt canonical today     | No        | Reported as `missing_optional` if absent. |
| `captured_at`                  | `captured_at`                              | Yes       | Required for ordering and freshness. |
| `source`                       | `source`                                   | Yes       | Must not be `invalid` for sendable. |
| `confidence`                   | `root_zone_confidence` (root-zone proxy)   | No        | `missing` / `partial` surfaces warning. |

Hard rules:

- **Required fields missing = blocked.**
- **Optional fields missing = warning only.**
- **Invalid or stale fields must not be called healthy.**
- **Manual / csv / demo readings must not be described as live.**

---

## 6. Export

### Selected dry-run export

Downloads one deterministic JSON file for the currently selected tent + sample + identity overrides. Filename is fixed per tent:

- `verdant-ecowitt-flower-tent-ingest-dry-run.json`
- `verdant-ecowitt-seedling-tent-ingest-dry-run.json`
- `verdant-ecowitt-vegetation-tent-ingest-dry-run.json`

### All-tent dry-run export

Downloads one deterministic JSON file per available EcoWitt tent using the currently selected sample. Identity overrides only apply to the selected tent; other tents serialize with placeholder/`null` identity.

### Properties of every export

- **Local browser download only.**
- **Does not send data to Verdant.**
- **Does not write to Supabase.**
- **Does not call any Edge Function.**
- **Does not call any AI model.**
- **Does not write to the Action Queue or alerts.**
- **Does not execute any device command.**

Exports are intended for **review**, **QA**, **partner demos**, and **future ingest planning** only.

---

## 7. Do not proceed

The operator must stop and not present a payload as future-ingest-ready when any of the following are true:

- Air temperature is missing.
- Humidity is missing.
- Source is `invalid`.
- Snapshot is stale (`stale_snapshot:*` present).
- Tent context is placeholder / non-UUID and a real ingest path is being claimed.
- `source_identity` / `device_identity` is unknown and traceability is required.
- Any secret, token, or private hardware identifier appears anywhere in the payload, UI, or export.
- Any copy implies that live ingest is already enabled.
- Any payload lacks `not_sent: true` or `read_only: true`.

---

## 8. Future real ingest gates

Real ingest is a **separate, explicitly approved phase**. Before any write path is enabled, all gates in [`ecowitt-future-real-ingest-gates.md`](./ecowitt-future-real-ingest-gates.md) must be satisfied. In summary:

1. Real UUID-backed tent context.
2. Approved bridge token authentication.
3. Validated ingest endpoint with a typed contract.
4. Server-side schema validation.
5. Idempotency on duplicate payloads.
6. Rate limiting and backoff.
7. Append-only audit trail.
8. RLS and auth review.
9. Tests proving no service-role exposure.
10. Tests proving bad telemetry cannot be inserted as healthy.
11. Explicit, recorded approval before enabling writes.

Until all of the above are in place, the dry-run preview remains the only sanctioned way to inspect EcoWitt ingest payload shape.

---

## Related

- [EcoWitt Future Real Ingest Gates](./ecowitt-future-real-ingest-gates.md)
- [EcoWitt dry-run safety checklist](./ecowitt-dry-run-safety-checklist.md)
- [EcoWitt live canary runbook](./ecowitt-live-canary-runbook.md)
- [Sensor EcoWitt / Home Assistant field mapping](./sensor-ecowitt-home-assistant-field-mapping.md)
