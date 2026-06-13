/**
 * CSV vendor display badge tests.
 *
 * Covers:
 *   - buildSensorSourceDisplayLabel for csv + each known vendor.
 *   - Unknown CSV vendor falls back to "CSV history".
 *   - Multiple CSV vendors → "CSV history · Multiple sources".
 *   - Non-csv sources use their canonical SOURCE_LABEL entries.
 *   - Vendor lineage never promotes a reading to "Live".
 *   - summarizeCsvVendor collapses rows correctly.
 *   - snapshotFromReadings exposes csvVendor for downstream display.
 *   - Stale CSV snapshot retains its stale marker (helper does not
 *     mutate or hide staleness).
 *   - Static safety: helper code is free of writes / alerts / Action
 *     Queue / AI / device control / raw_payload field references.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSensorSourceDisplayLabel,
  summarizeCsvVendor,
} from "@/lib/sensorSourceDisplayLabel";
import {
  snapshotFromReadings,
  isStale,
  SOURCE_LABEL,
  type SensorReadingLike,
} from "@/lib/sensorSnapshot";

const TS = "2026-06-01T12:00:00.000Z";

function csvRow(
  metric: string,
  value: number,
  vendor: string | null,
  extras: Record<string, unknown> = {},
): SensorReadingLike {
  return {
    ts: TS,
    metric,
    value,
    source: "csv",
    raw_payload: { csv_import: true, source_app: vendor, ...extras },
  };
}

describe("buildSensorSourceDisplayLabel — CSV vendor badges", () => {
  it("renders CSV history · Spider Farmer", () => {
    expect(
      buildSensorSourceDisplayLabel({ source: "csv", csvVendor: "spider_farmer" }),
    ).toBe("CSV history · Spider Farmer");
  });

  it("renders CSV history · Vivosun", () => {
    expect(
      buildSensorSourceDisplayLabel({ source: "csv", csvVendor: "vivosun" }),
    ).toBe("CSV history · Vivosun");
  });

  it("renders CSV history · AC Infinity", () => {
    expect(
      buildSensorSourceDisplayLabel({ source: "csv", csvVendor: "ac_infinity" }),
    ).toBe("CSV history · AC Infinity");
  });

  it("renders CSV history when vendor unknown / null", () => {
    expect(buildSensorSourceDisplayLabel({ source: "csv" })).toBe("CSV history");
    expect(
      buildSensorSourceDisplayLabel({ source: "csv", csvVendor: null }),
    ).toBe("CSV history");
  });

  it("uses conservative 'Multiple sources' for mixed CSV vendors", () => {
    expect(
      buildSensorSourceDisplayLabel({ source: "csv", csvVendor: "multiple" }),
    ).toBe("CSV history · Multiple sources");
  });

  it("preserves existing labels for manual / live / sim / diary", () => {
    expect(buildSensorSourceDisplayLabel({ source: "manual" })).toBe("Manual");
    expect(buildSensorSourceDisplayLabel({ source: "live" })).toBe("Live sensor");
    expect(buildSensorSourceDisplayLabel({ source: "sim" })).toBe("Simulated");
    expect(buildSensorSourceDisplayLabel({ source: "diary" })).toBe(
      "Diary snapshot",
    );
  });

  it("never promotes vendor lineage to Live", () => {
    for (const vendor of ["spider_farmer", "vivosun", "ac_infinity", "multiple"] as const) {
      const label = buildSensorSourceDisplayLabel({ source: "csv", csvVendor: vendor });
      expect(label.toLowerCase()).not.toContain("live");
      expect(label.startsWith("CSV history")).toBe(true);
    }
  });

  it("unknown sources resolve to 'Unknown', not 'Live'", () => {
    expect(buildSensorSourceDisplayLabel({ source: "wat" })).toBe("Unknown");
    expect(buildSensorSourceDisplayLabel({ source: null })).toBe("Unknown");
  });
});

describe("summarizeCsvVendor", () => {
  it("returns single vendor when all CSV rows agree", () => {
    expect(
      summarizeCsvVendor([
        csvRow("temperature_c", 24, "spider_farmer"),
        csvRow("humidity_pct", 55, "spider_farmer"),
      ]),
    ).toBe("spider_farmer");
  });

  it("returns 'multiple' when CSV rows disagree", () => {
    expect(
      summarizeCsvVendor([
        csvRow("temperature_c", 24, "spider_farmer"),
        csvRow("humidity_pct", 55, "vivosun"),
      ]),
    ).toBe("multiple");
  });

  it("returns null when no CSV rows carry a known vendor", () => {
    expect(summarizeCsvVendor([])).toBeNull();
    expect(
      summarizeCsvVendor([csvRow("temperature_c", 24, "unknown_brand")]),
    ).toBeNull();
    expect(
      summarizeCsvVendor([
        { ts: TS, metric: "temperature_c", value: 24, source: "manual" },
      ]),
    ).toBeNull();
  });
});

describe("snapshotFromReadings → csvVendor passthrough", () => {
  it("attaches Spider Farmer vendor to a CSV snapshot", () => {
    const snap = snapshotFromReadings([
      csvRow("temperature_c", 24, "spider_farmer"),
      csvRow("humidity_pct", 55, "spider_farmer"),
    ]);
    expect(snap?.source).toBe("csv");
    expect(snap?.csvVendor).toBe("spider_farmer");
    expect(
      buildSensorSourceDisplayLabel({
        source: snap!.source,
        csvVendor: snap!.csvVendor,
      }),
    ).toBe("CSV history · Spider Farmer");
  });

  it("attaches 'multiple' for mixed-vendor CSV snapshot", () => {
    const snap = snapshotFromReadings([
      csvRow("temperature_c", 24, "spider_farmer"),
      csvRow("humidity_pct", 55, "vivosun"),
    ]);
    expect(snap?.csvVendor).toBe("multiple");
  });

  it("non-csv snapshots do not get a vendor label", () => {
    const snap = snapshotFromReadings([
      { ts: TS, metric: "temperature_c", value: 23, source: "manual" },
    ]);
    expect(snap?.source).toBe("manual");
    expect(snap?.csvVendor ?? null).toBeNull();
  });

  it("stale CSV snapshot still reports stale (vendor does not hide staleness)", () => {
    const oldTs = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const snap = snapshotFromReadings([
      {
        ts: oldTs,
        metric: "temperature_c",
        value: 22,
        source: "csv",
        raw_payload: { csv_import: true, source_app: "vivosun" },
      },
    ]);
    expect(snap?.source).toBe("csv");
    expect(snap?.csvVendor).toBe("vivosun");
    expect(isStale(snap?.ts ?? null)).toBe(true);
    // Display label is independent of stale; caller renders stale chip.
    expect(
      buildSensorSourceDisplayLabel({
        source: snap!.source,
        csvVendor: snap!.csvVendor,
      }),
    ).toBe("CSV history · Vivosun");
  });
});

describe("privacy — raw_payload fields never leak into display", () => {
  it("does not include device_serial / bridge_token / raw_row / row_index / sensor_id in output", () => {
    const snap = snapshotFromReadings([
      csvRow("temperature_c", 24, "spider_farmer", {
        device_serial: "SECRET-SN",
        bridge_token: "leak-token",
        raw_row: { email: "leak@example.com" },
        row_index: 42,
        sensor_id: "internal-sensor-id",
        source_file_name: "private-export.csv",
      }),
    ]);
    const label = buildSensorSourceDisplayLabel({
      source: snap!.source,
      csvVendor: snap!.csvVendor,
    });
    const serialized = JSON.stringify({ snap, label });
    for (const term of [
      "SECRET-SN",
      "bridge_token",
      "leak-token",
      "raw_row",
      "leak@example.com",
      "row_index",
      "internal-sensor-id",
      "private-export.csv",
    ]) {
      expect(serialized).not.toContain(term);
    }
  });
});

describe("static safety — display helper", () => {
  const helper = readFileSync(
    resolve(__dirname, "../lib/sensorSourceDisplayLabel.ts"),
    "utf8",
  );
  const forbidden = [
    "action_queue",
    "alerts",
    "ai-coach",
    "ai-doctor",
    "ai_doctor",
    "device_control",
    "service_role",
    "supabase",
    "fetch(",
    ".insert(",
    ".update(",
    ".delete(",
    ".rpc(",
    "raw_row",
    "device_serial",
    "bridge_token",
    "row_index",
  ];
  it("references no writes / alerts / Action Queue / AI / device / raw payload internals", () => {
    for (const term of forbidden) {
      expect(helper).not.toContain(term);
    }
  });
  it("guards source label vocabulary", () => {
    expect(SOURCE_LABEL.csv).toBe("CSV history");
  });
});
