/**
 * sensor-import-preview-copy — pure presenter tests using REAL fixtures.
 * Verifies the source-app preview → display copy mapping that powers the
 * TentCsvImportCard preview panel. No DB, no UI, no network.
 *
 * Persistence policy reminder: AC Infinity is the only source app whose
 * insert path is wired today. Spider Farmer / Vivosun / unknown must be
 * preview-only (importEnabled = false).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { summarizeImportPreview } from "@/lib/sensorImportSourceApps";
import {
  buildSourceAppPreviewCopy,
  CANONICAL_SOURCE_COPY,
  IMPORT_BLOCKED_NOT_WIRED_COPY,
  PREVIEW_PERSISTENCE_ENABLED,
  SPIDER_FARMER_SENSOR_ONLY_COPY,
  UNKNOWN_SOURCE_COPY,
  VIVOSUN_CO2_EMPTY_COPY,
} from "@/lib/sensorImportPreviewCopy";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) =>
  readFileSync(resolve(ROOT, "fixtures/sensor-csv", rel), "utf8");

const SPIDER_FULL = read("spider_farmer_primary_full_20260612214443.csv");
const SPIDER_SPARSE = read("spider_farmer_primary_sparse_20260612214427.csv");
const SPIDER_SENSOR_ONLY = read("spider_farmer_sensor_only_20260612214453.csv");
const VIVOSUN = read("vivosun_growhub_veg_tent_202606121323.csv");

const AC_INFINITY_CSV = [
  "Timestamp,Temperature (°F),Humidity (%),VPD (kPa)",
  "2026-05-26 14:00:00,77,50,1.2",
  "2026-05-26 15:00:00,78,52,1.25",
].join("\n");

const UNKNOWN_CSV = [
  "foo,bar,baz",
  "1,2,3",
  "4,5,6",
].join("\n");

describe("persistence policy", () => {
  it("ac_infinity, spider_farmer, and vivosun are wired for save", () => {
    expect(PREVIEW_PERSISTENCE_ENABLED.has("ac_infinity")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("spider_farmer")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("vivosun")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("unknown_source_app")).toBe(false);
  });
});

describe("AC Infinity preview copy", () => {
  const copy = buildSourceAppPreviewCopy(summarizeImportPreview(AC_INFINITY_CSV));

  it("detects AC Infinity and enables import", () => {
    expect(copy.sourceAppId).toBe("ac_infinity");
    expect(copy.sourceAppLabel).toBe("AC Infinity");
    expect(copy.importEnabled).toBe(true);
    expect(copy.importDisabledReason).toBeNull();
  });

  it("always carries CSV-history canonical copy", () => {
    expect(copy.canonicalSourceCopy).toBe(CANONICAL_SOURCE_COPY);
  });

  it("maps temperature + humidity + vpd metrics", () => {
    expect(copy.mappedMetrics).toEqual(
      expect.arrayContaining(["temp_f", "humidity_pct", "vpd_kpa"]),
    );
    expect(copy.acceptedRowCount).toBeGreaterThan(0);
  });
});

describe("Spider Farmer (primary, full)", () => {
  const copy = buildSourceAppPreviewCopy(summarizeImportPreview(SPIDER_FULL));

  it("detects spider_farmer with mapped metrics", () => {
    expect(copy.sourceAppId).toBe("spider_farmer");
    expect(copy.sourceAppLabel).toContain("Spider Farmer");
    expect(copy.mappedMetrics).toEqual(
      expect.arrayContaining(["temp_f", "humidity_pct", "vpd_kpa", "co2_ppm", "ppfd_umol_m2_s"]),
    );
    expect(copy.acceptedRowCount).toBeGreaterThan(0);
  });

  it("enables import (persistence wired via registry adapter)", () => {
    expect(copy.importEnabled).toBe(true);
    expect(copy.importDisabledReason).toBeNull();
  });
});

describe("Spider Farmer (primary, sparse co2/ppfd)", () => {
  const copy = buildSourceAppPreviewCopy(summarizeImportPreview(SPIDER_SPARSE));

  it("still detects spider_farmer and accepts rows", () => {
    expect(copy.sourceAppId).toBe("spider_farmer");
    expect(copy.acceptedRowCount).toBeGreaterThan(0);
    expect(copy.importEnabled).toBe(true);
  });
});

describe("Spider Farmer (sensor-only export)", () => {
  const copy = buildSourceAppPreviewCopy(
    summarizeImportPreview(SPIDER_SENSOR_ONLY),
  );

  it("detects spider_farmer but accepts zero rows", () => {
    expect(copy.sourceAppId).toBe("spider_farmer");
    expect(copy.acceptedRowCount).toBe(0);
  });

  it("surfaces sensor-only metadata notice", () => {
    expect(copy.notices).toContain(SPIDER_FARMER_SENSOR_ONLY_COPY);
  });

  it("does not enable import", () => {
    expect(copy.importEnabled).toBe(false);
  });
});

describe("Vivosun (GrowHub)", () => {
  const copy = buildSourceAppPreviewCopy(summarizeImportPreview(VIVOSUN));

  it("detects vivosun and prefers Probe metrics", () => {
    expect(copy.sourceAppId).toBe("vivosun");
    expect(copy.sourceAppLabel).toContain("Vivosun");
    expect(copy.mappedMetrics).toEqual(
      expect.arrayContaining(["temp_f", "humidity_pct", "vpd_kpa"]),
    );
  });

  it("emits CO₂ empty notice when CO₂ column has no numeric values", () => {
    expect(
      copy.warnings.some((w) => w.code === "co2_column_empty"),
    ).toBe(true);
    expect(copy.notices).toContain(VIVOSUN_CO2_EMPTY_COPY);
  });

  it("does not enable import (persistence not wired)", () => {
    expect(copy.importEnabled).toBe(false);
    expect(copy.importDisabledReason).toBe(IMPORT_BLOCKED_NOT_WIRED_COPY);
  });
});

describe("Unknown CSV", () => {
  const copy = buildSourceAppPreviewCopy(summarizeImportPreview(UNKNOWN_CSV));

  it("classifies as unknown_source_app", () => {
    expect(copy.sourceAppId).toBe("unknown_source_app");
    expect(copy.confidenceLabel).toBe("No confident match");
  });

  it("shows review-mapping notice and disables import", () => {
    expect(copy.notices).toContain(UNKNOWN_SOURCE_COPY);
    expect(copy.importEnabled).toBe(false);
    expect(copy.importDisabledReason).toBe(IMPORT_BLOCKED_NOT_WIRED_COPY);
  });
});
