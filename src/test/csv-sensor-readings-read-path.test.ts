/**
 * Read-path verification for CSV (Spider Farmer / Vivosun) sensor rows.
 *
 * Confirms:
 *  - snapshotFromReadings does NOT classify source="csv" rows as live.
 *  - SOURCE_LABEL exposes a "CSV history" label.
 *  - Vendor lineage helper surfaces Spider Farmer / Vivosun / AC
 *    Infinity from raw_payload.source_app.
 *  - Old CSV rows are still flagged as stale via isStale().
 *  - Manual rows still win over CSV at the same ts (CSV history must
 *    not overwrite a true manual entry).
 *  - Helpers ignore unknown / missing vendors and never leak
 *    raw_payload internals.
 *  - Static safety: helper code does not reference automation, alerts,
 *    Action Queue, AI model calls, RLS, or device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  snapshotFromReadings,
  SOURCE_LABEL,
  isStale,
  STALE_THRESHOLD_MS,
  type SensorReadingLike,
} from "@/lib/sensorSnapshot";
import {
  getCsvVendorLineage,
  getCsvVendorLabel,
} from "@/lib/sensorReadingVendorLineage";

const TS = "2026-06-01T12:00:00.000Z";

function csvRow(metric: string, value: number): SensorReadingLike {
  return { ts: TS, metric, value, source: "csv" };
}

describe("snapshotFromReadings — CSV (Spider Farmer / Vivosun) classification", () => {
  it("classifies all-CSV rows as 'csv', never 'live'", () => {
    const snap = snapshotFromReadings([
      csvRow("temperature_c", 24.1),
      csvRow("humidity_pct", 55),
      csvRow("vpd_kpa", 1.1),
    ]);
    expect(snap?.source).toBe("csv");
    expect(snap?.source).not.toBe("live");
    expect(snap?.temp).toBe(24.1);
  });

  it("mixed CSV + (no live/manual) still resolves to 'csv', not 'live'", () => {
    const snap = snapshotFromReadings([
      csvRow("temperature_c", 22),
      { ts: TS, metric: "humidity_pct", value: 50, source: null },
    ]);
    expect(snap?.source).toBe("csv");
    expect(snap?.source).not.toBe("live");
  });

  it("manual rows still win over CSV at the same ts (manual not relabeled)", () => {
    const snap = snapshotFromReadings([
      { ts: TS, metric: "temperature_c", value: 23, source: "manual" },
      csvRow("humidity_pct", 60),
    ]);
    expect(snap?.source).toBe("manual");
  });

  it("CSV-only snapshot still flags as stale when ts is older than 30m", () => {
    const oldTs = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const snap = snapshotFromReadings([
      { ts: oldTs, metric: "temperature_c", value: 22, source: "csv" },
    ]);
    expect(snap?.source).toBe("csv");
    expect(isStale(snap?.ts ?? null)).toBe(true);
    expect(STALE_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });
});

describe("SOURCE_LABEL — csv label", () => {
  it('labels csv as "CSV history" (never "Live sensor")', () => {
    expect(SOURCE_LABEL.csv).toBe("CSV history");
    expect(SOURCE_LABEL.csv).not.toBe("Live sensor");
    expect(SOURCE_LABEL.csv.toLowerCase()).not.toContain("live");
  });
});

describe("getCsvVendorLineage — Spider Farmer / Vivosun / AC Infinity", () => {
  it("returns Spider Farmer lineage from raw_payload.source_app", () => {
    const v = getCsvVendorLineage({
      source: "csv",
      raw_payload: { csv_import: true, source_app: "spider_farmer" },
    });
    expect(v?.sourceApp).toBe("spider_farmer");
    expect(v?.vendorLabel).toBe("Spider Farmer");
    expect(v?.badgeLabel).toBe("CSV history · Spider Farmer");
    expect(getCsvVendorLabel({ source: "csv", raw_payload: { source_app: "spider_farmer" } }))
      .toBe("Spider Farmer");
  });

  it("returns Vivosun lineage from raw_payload.source_app", () => {
    const v = getCsvVendorLineage({
      source: "csv",
      raw_payload: { csv_import: true, source_app: "vivosun" },
    });
    expect(v?.sourceApp).toBe("vivosun");
    expect(v?.vendorLabel).toBe("Vivosun");
    expect(v?.badgeLabel).toBe("CSV history · Vivosun");
  });

  it("returns AC Infinity lineage from raw_payload.source_app", () => {
    const v = getCsvVendorLineage({
      source: "csv",
      raw_payload: { csv_import: true, source_app: "ac_infinity" },
    });
    expect(v?.vendorLabel).toBe("AC Infinity");
  });

  it("returns null for unknown / missing vendors and non-CSV rows", () => {
    expect(getCsvVendorLineage({ source: "csv", raw_payload: {} })).toBeNull();
    expect(
      getCsvVendorLineage({ source: "csv", raw_payload: { source_app: "unknown_brand" } }),
    ).toBeNull();
    expect(
      getCsvVendorLineage({ source: "live", raw_payload: { source_app: "spider_farmer" } }),
    ).toBeNull();
    expect(getCsvVendorLineage({ source: null, raw_payload: null })).toBeNull();
  });

  it("does not return any other raw_payload fields (privacy)", () => {
    const v = getCsvVendorLineage({
      source: "csv",
      raw_payload: {
        csv_import: true,
        source_app: "spider_farmer",
        device_serial: "SECRET-123",
        bridge_token: "should-never-leak",
        raw_row: { user_email: "leak@example.com" },
      },
    });
    expect(v).not.toBeNull();
    const serialized = JSON.stringify(v);
    expect(serialized).not.toContain("SECRET-123");
    expect(serialized).not.toContain("bridge_token");
    expect(serialized).not.toContain("should-never-leak");
    expect(serialized).not.toContain("leak@example.com");
  });
});

describe("static safety — vendor lineage helper", () => {
  const helper = readFileSync(
    resolve(__dirname, "../lib/sensorReadingVendorLineage.ts"),
    "utf8",
  );

  it("does not reference alerts / Action Queue / AI / device control / RLS", () => {
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
    ];
    for (const term of forbidden) {
      expect(helper).not.toContain(term);
    }
  });
});
