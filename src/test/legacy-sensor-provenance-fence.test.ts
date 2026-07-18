import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SensorReadingRow } from "@/lib/db";
import {
  groupSensorReadingRows,
  mapSensorReadingRow,
  resolveSensorReadingSource,
} from "@/lib/growAdapters";
import {
  buildLegacyAiSensorEvidence,
  isHealthyLiveGrowSensorReading,
  isUsableGrowSensorReading,
} from "@/lib/growSensorEvidenceRules";
import { classifyGrowDataSource } from "@/lib/growDataSourceLabelRules";
import { computeEnvironmentStability } from "@/lib/environmentStabilityRules";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const FRESH = "2026-07-17T11:55:00.000Z";

function row(overrides: Partial<SensorReadingRow> = {}): SensorReadingRow {
  return {
    id: "row-1",
    user_id: "user-1",
    tent_id: "tent-1",
    device_id: null,
    metric: "temperature_c",
    value: 24,
    source: "live",
    quality: "ok",
    ts: FRESH,
    captured_at: FRESH,
    created_at: FRESH,
    raw_payload: null,
    ...overrides,
  };
}

const PHYSICAL_WINDOWS_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.4",
      model: "GW2000A",
      dateutc: "2026-07-17 11:55:00",
    },
  },
};

const DIAGNOSTIC_WINDOWS_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    verdant_source: "live",
    confidence: "test",
  },
};

describe("legacy sensor adapter provenance fence", () => {
  it("downgrades a fresh canonical-live Windows diagnostic row", () => {
    const mapped = mapSensorReadingRow(row({ raw_payload: DIAGNOSTIC_WINDOWS_PAYLOAD }), NOW);

    expect(mapped.source).toBe("demo");
    expect(mapped.status).toBe("needs_review");
    expect(isUsableGrowSensorReading(mapped)).toBe(false);
    expect(isHealthyLiveGrowSensorReading(mapped)).toBe(false);
    expect(
      classifyGrowDataSource(
        { source: mapped.source, value: mapped.temp, timestamp: mapped.ts },
        { now: NOW },
      ).label,
    ).toBe("Demo");
  });

  it("keeps a physical Windows gateway row live only with preserved source and gateway markers", () => {
    const physical = row({ raw_payload: PHYSICAL_WINDOWS_PAYLOAD });

    expect(resolveSensorReadingSource(physical)).toBe("live");
    const mapped = mapSensorReadingRow(physical, NOW);
    expect(mapped.source).toBe("live");
    expect(mapped.status).toBe("usable");
    expect(isHealthyLiveGrowSensorReading(mapped)).toBe(true);
    expect(
      classifyGrowDataSource(
        { source: mapped.source, value: mapped.temp, timestamp: mapped.ts },
        { now: NOW },
      ).label,
    ).toBe("Live");
  });

  it("fails closed when the Windows vendor has no preserved physical evidence", () => {
    const missingProof = row({
      raw_payload: {
        vendor: "ecowitt_windows_testbench",
        metadata: { verdant_source: "live" },
      },
    });

    expect(resolveSensorReadingSource(missingProof)).toBe("demo");
  });

  it("fails unknown persisted sources closed instead of promoting them to live", () => {
    const mapped = mapSensorReadingRow(row({ source: "mystery_bridge" }), NOW);

    expect(mapped.source).toBe("invalid");
    expect(mapped.status).toBe("invalid");
    expect(isHealthyLiveGrowSensorReading(mapped)).toBe(false);
  });

  it("keeps a valid manual row usable for presentation without calling it physical live", () => {
    const mapped = mapSensorReadingRow(row({ source: "manual", raw_payload: null }), NOW);

    expect(mapped.status).toBe("usable");
    expect(isUsableGrowSensorReading(mapped)).toBe(true);
    expect(isHealthyLiveGrowSensorReading(mapped)).toBe(false);
  });

  it("lets diagnostic provenance win across a mixed same-timestamp metric group", () => {
    const grouped = groupSensorReadingRows(
      [
        row({ raw_payload: PHYSICAL_WINDOWS_PAYLOAD }),
        row({
          id: "row-2",
          metric: "humidity_pct",
          value: 55,
          raw_payload: DIAGNOSTIC_WINDOWS_PAYLOAD,
        }),
      ],
      NOW,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      source: "demo",
      status: "needs_review",
      temp: 24,
      rh: 55,
    });
  });

  it("prevents diagnostic-only rows from producing a healthy stability result", () => {
    const diagnosticRows = groupSensorReadingRows(
      [row({ raw_payload: DIAGNOSTIC_WINDOWS_PAYLOAD, metric: "vpd_kpa", value: 1.1 })],
      NOW,
    );

    const result = computeEnvironmentStability(diagnosticRows, {
      stage: "veg",
      now: NOW,
    });
    expect(result.status).toBe("unavailable");
  });
});

describe("legacy AI Doctor sensor evidence fence", () => {
  const baseMeta = { dataSource: "supabase" as const, isDemoData: false };

  it("excludes diagnostic rows and marks their context as demo-backed", () => {
    const mapped = mapSensorReadingRow(row({ raw_payload: DIAGNOSTIC_WINDOWS_PAYLOAD }), NOW);
    const evidence = buildLegacyAiSensorEvidence([mapped], baseMeta);

    expect(evidence.trustedLiveReadings).toEqual([]);
    expect(evidence.state).toBe("untrusted_only");
    expect(evidence.sensorMeta).toEqual({
      dataSource: "mock",
      isDemoData: true,
    });
  });

  it("preserves physical live rows and the original Supabase metadata", () => {
    const mapped = mapSensorReadingRow(row({ raw_payload: PHYSICAL_WINDOWS_PAYLOAD }), NOW);
    const evidence = buildLegacyAiSensorEvidence([mapped], baseMeta);

    expect(evidence.trustedLiveReadings).toEqual([mapped]);
    expect(evidence.state).toBe("physical_live");
    expect(evidence.sensorMeta).toEqual(baseMeta);
  });

  it("caps mixed physical and diagnostic evidence as mixed", () => {
    const physical = mapSensorReadingRow(row({ raw_payload: PHYSICAL_WINDOWS_PAYLOAD }), NOW);
    const diagnostic = mapSensorReadingRow(
      row({ id: "row-2", raw_payload: DIAGNOSTIC_WINDOWS_PAYLOAD }),
      NOW,
    );
    const evidence = buildLegacyAiSensorEvidence([physical, diagnostic], baseMeta);

    expect(evidence.trustedLiveReadings).toEqual([physical]);
    expect(evidence.state).toBe("mixed");
    expect(evidence.sensorMeta).toEqual({
      dataSource: "mixed",
      isDemoData: false,
    });
  });
});

describe("legacy presenter wiring", () => {
  const root = resolve(__dirname, "../..");
  const sensors = readFileSync(resolve(root, "src/pages/Sensors.tsx"), "utf8");
  const coach = readFileSync(resolve(root, "src/pages/Coach.tsx"), "utf8");

  it("gates green stage chips behind usable provenance-resolved evidence", () => {
    expect(sensors).toContain("isUsableGrowSensorReading");
    expect(sensors).toMatch(/latest\s*&&\s*latestCountsAsUsableEvidence/);
  });

  it("feeds only trusted rows with their real captured timestamp into legacy AI context", () => {
    expect(coach).toContain("buildLegacyAiSensorEvidence");
    expect(coach).toContain("sensorEvidence.trustedLiveReadings.map");
    expect(coach).toContain("at: r.capturedAt ?? r.ts");
    expect(coach).toContain("sensorMeta: sensorEvidence.sensorMeta");
  });
});
