/**
 * csv-persistence-allow-list-audit — AUDIT TESTS ONLY.
 *
 * Documents the exact gap between:
 *   (a) the existing CSV persistence path (`buildCsvInsertRows`,
 *       `SUPPORTED_METRICS`, `validate_sensor_reading` DB trigger), and
 *   (b) the new source-app registry's canonical metric vocabulary
 *       (`temp_f, humidity_pct, vpd_kpa, co2_ppm, ppfd_umol_m2_s`).
 *
 * These tests freeze current behavior. They DO NOT change persistence and
 * DO NOT enable Spider Farmer / Vivosun save. The presence of these
 * assertions is the safety net: if the persistence path or DB allow-list
 * changes, these tests must be updated intentionally.
 *
 * No DB calls. No network. No UI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SUPPORTED_METRICS,
  buildCsvInsertRows,
  type NormalizedCsvRow,
  type SupportedMetric,
} from "@/lib/csvSensorImportRules";
import {
  summarizeImportPreview,
  type CanonicalMetric,
} from "@/lib/sensorImportSourceApps";
import { PREVIEW_PERSISTENCE_ENABLED } from "@/lib/sensorImportPreviewCopy";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) =>
  readFileSync(resolve(ROOT, "fixtures/sensor-csv", rel), "utf8");

const SPIDER_FULL = read("spider_farmer_primary_full_20260612214443.csv");
const VIVOSUN = read("vivosun_growhub_veg_tent_202606121323.csv");
const SPIDER_SENSOR_ONLY = read(
  "spider_farmer_sensor_only_20260612214453.csv",
);

// Mirrors the live `validate_sensor_reading` allow-list. Kept in this file
// so the gap is visible at review time. Bump this only when the DB trigger
// is intentionally widened.
const DB_METRIC_ALLOW_LIST = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "ph",
  "ec",
  "ppfd",
] as const;
type DbMetric = (typeof DB_METRIC_ALLOW_LIST)[number];

const REGISTRY_METRICS: CanonicalMetric[] = [
  "temp_f",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "ppfd_umol_m2_s",
];

describe("audit: writer SUPPORTED_METRICS vs DB allow-list", () => {
  it("writer's SUPPORTED_METRICS is a subset of the DB allow-list", () => {
    for (const m of SUPPORTED_METRICS) {
      expect(DB_METRIC_ALLOW_LIST).toContain(m as DbMetric);
    }
  });

  it("AC Infinity-era metrics persist as temperature_c (°F→°C conversion in writer)", () => {
    expect(SUPPORTED_METRICS).toEqual(
      expect.arrayContaining([
        "temperature_c",
        "humidity_pct",
        "vpd_kpa",
        "co2_ppm",
        "soil_moisture_pct",
      ]),
    );
    // Note for reviewers: `ppfd` is in the DB allow-list but the writer
    // currently flags it as `unsupportedMetrics` (parsed-not-persisted).
    expect(SUPPORTED_METRICS as readonly string[]).not.toContain("ppfd");
    expect(SUPPORTED_METRICS as readonly string[]).not.toContain("ph");
    expect(SUPPORTED_METRICS as readonly string[]).not.toContain("ec");
  });
});

describe("audit: registry canonical metrics vs writer/DB shape", () => {
  it("registry uses temp_f; writer/DB use temperature_c (conversion required)", () => {
    expect(REGISTRY_METRICS).toContain("temp_f");
    expect(SUPPORTED_METRICS as readonly string[]).not.toContain("temp_f");
    expect(DB_METRIC_ALLOW_LIST as readonly string[]).not.toContain("temp_f");
    expect(DB_METRIC_ALLOW_LIST as readonly string[]).toContain(
      "temperature_c",
    );
  });

  it("registry uses ppfd_umol_m2_s; writer rejects it, DB uses ppfd", () => {
    expect(REGISTRY_METRICS).toContain("ppfd_umol_m2_s");
    expect(SUPPORTED_METRICS as readonly string[]).not.toContain(
      "ppfd_umol_m2_s",
    );
    expect(DB_METRIC_ALLOW_LIST as readonly string[]).not.toContain(
      "ppfd_umol_m2_s",
    );
    expect(DB_METRIC_ALLOW_LIST as readonly string[]).toContain("ppfd");
  });

  it("humidity_pct / vpd_kpa / co2_ppm flow through unchanged", () => {
    for (const m of ["humidity_pct", "vpd_kpa", "co2_ppm"] as const) {
      expect(REGISTRY_METRICS).toContain(m);
      expect(SUPPORTED_METRICS as readonly string[]).toContain(m);
      expect(DB_METRIC_ALLOW_LIST as readonly string[]).toContain(m);
    }
  });
});

describe("audit: writer output preserves required provenance", () => {
  const fakeRows: NormalizedCsvRow[] = [
    {
      captured_at: "2026-05-26T14:00:00.000Z",
      readings: [
        { captured_at: "2026-05-26T14:00:00.000Z", metric: "humidity_pct", value: 50 },
      ],
    },
  ];

  it("AC Infinity insert rows preserve source tag, raw_payload, and historical timestamp", () => {
    const inserts = buildCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "ac_infinity",
      importBatchId: "batch-1",
      rows: fakeRows,
    });
    expect(inserts).toHaveLength(1);
    const [r] = inserts;
    expect(r.captured_at).toBe("2026-05-26T14:00:00.000Z");
    expect(r.source).toBe("csv_import_ac_infinity");
    expect(r.quality).toBe("ok");
    expect(r.raw_payload.csv_import).toBe(true);
    expect(r.raw_payload.source_app).toBe("ac_infinity");
    expect(r.raw_payload.import_batch_id).toBe("batch-1");
  });

  it("writer's source tag (csv_import_ac_infinity) is NOT in the DB source allow-list — pre-existing concern documented", () => {
    // The validate_sensor_reading trigger accepts `csv` but not
    // `csv_import_*`. Saving CSV rows today depends on either a more
    // permissive deployed trigger or a route that bypasses this check.
    // Flagging here so any future change addresses it intentionally and
    // does not break AC Infinity.
    const DB_SOURCE_ALLOW_LIST = [
      "manual",
      "pi_bridge",
      "sim",
      "webhook_generic",
      "node_red_bridge",
      "esp32_arduino",
      "esp32_arduino_sht31",
      "esp32_esphome",
      "esp32_mqtt_bridge",
      "home_assistant_bridge",
      "ha_forwarded",
      "ecowitt",
      "mqtt",
      "csv",
      "webhook",
    ];
    expect(DB_SOURCE_ALLOW_LIST).toContain("csv");
    expect(DB_SOURCE_ALLOW_LIST).not.toContain("csv_import_ac_infinity");
  });
});

describe("audit: registry → writer transformation gaps", () => {
  it("Spider Farmer primary maps registry metrics that overlap with the writer", () => {
    const p = summarizeImportPreview(SPIDER_FULL);
    const overlap = p.mappedMetrics.filter((m) =>
      (SUPPORTED_METRICS as readonly string[]).includes(m),
    );
    // Only humidity_pct, vpd_kpa, co2_ppm overlap directly today.
    expect(overlap).toEqual(
      expect.arrayContaining(["humidity_pct", "vpd_kpa", "co2_ppm"]),
    );
    // Temperature is mapped as temp_f → writer needs adapter to temperature_c.
    expect(p.mappedMetrics).toContain("temp_f");
    expect(overlap).not.toContain("temp_f");
    // PPFD cannot persist via the current writer.
    expect(p.mappedMetrics).toContain("ppfd_umol_m2_s");
    expect(overlap).not.toContain("ppfd_umol_m2_s");
  });

  it("Vivosun preview suffers the same temp_f / ppfd_umol_m2_s gaps", () => {
    const p = summarizeImportPreview(VIVOSUN);
    expect(p.mappedMetrics).toContain("temp_f");
    expect((SUPPORTED_METRICS as readonly string[]).includes("temp_f")).toBe(
      false,
    );
  });

  it("Sensor-only Spider Farmer export yields zero accepted rows (no insert rows possible)", () => {
    const p = summarizeImportPreview(SPIDER_SENSOR_ONLY);
    expect(p.acceptedRowCount).toBe(0);
  });

  it("Unknown source app produces no mapped metrics — writer cannot build inserts", () => {
    const p = summarizeImportPreview("foo,bar\n1,2\n");
    expect(p.sourceApp).toBe("unknown_source_app");
    expect(p.mappedMetrics).toHaveLength(0);
  });
});

describe("persistence gate after Spider Farmer / Vivosun enablement", () => {
  it("PREVIEW_PERSISTENCE_ENABLED includes ac_infinity, spider_farmer, vivosun", () => {
    const ids = [...PREVIEW_PERSISTENCE_ENABLED].sort();
    expect(ids).toEqual(["ac_infinity", "spider_farmer", "vivosun"]);
  });

  it("unknown_source_app is still blocked", () => {
    expect(PREVIEW_PERSISTENCE_ENABLED.has("unknown_source_app")).toBe(false);
  });
});
