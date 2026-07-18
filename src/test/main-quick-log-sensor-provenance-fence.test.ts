import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSensorSnapshot,
  buildSensorSnapshotSavePayload,
  prepareSensorSnapshotRowsForCache,
  type RawSensorRow,
} from "@/lib/latestSensorSnapshotRules";
import { buildQuickLogStripFromTentState } from "@/lib/quickLogSnapshotStripAdapter";

const NOW = new Date("2026-07-17T12:00:00.000Z");

const DIAGNOSTIC_WINDOWS_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    verdant_source: "live",
    raw_payload: { test_marker: true },
  },
};

const PHYSICAL_WINDOWS_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.4",
      model: "GW2000A",
      dateutc: "2026-07-17 11:55:00",
      PASSKEY: "classification-only-secret",
    },
  },
};

function row(overrides: Partial<RawSensorRow> = {}): RawSensorRow {
  return {
    id: "row-temperature",
    tent_id: "tent-1",
    metric: "temperature_c",
    value: 24,
    source: "live",
    quality: "ok",
    captured_at: "2026-07-17T11:55:00.000Z",
    ts: "2026-07-17T11:55:00.000Z",
    created_at: "2026-07-17T11:55:00.000Z",
    raw_payload: null,
    ...overrides,
  };
}

function diagnosticRows(): RawSensorRow[] {
  return [
    row({
      id: "diagnostic-temperature",
      captured_at: "2026-07-17T11:59:00.000Z",
      ts: "2026-07-17T11:59:00.000Z",
      created_at: "2026-07-17T11:59:00.000Z",
      value: 31,
      raw_payload: DIAGNOSTIC_WINDOWS_PAYLOAD,
    }),
    row({
      id: "diagnostic-humidity",
      metric: "humidity_pct",
      captured_at: "2026-07-17T11:59:00.000Z",
      ts: "2026-07-17T11:59:00.000Z",
      created_at: "2026-07-17T11:59:00.000Z",
      value: 88,
      raw_payload: DIAGNOSTIC_WINDOWS_PAYLOAD,
    }),
  ];
}

function physicalRows(): RawSensorRow[] {
  return [
    row({
      id: "physical-temperature",
      value: 24,
      raw_payload: PHYSICAL_WINDOWS_PAYLOAD,
    }),
    row({
      id: "physical-humidity",
      metric: "humidity_pct",
      value: 55,
      raw_payload: PHYSICAL_WINDOWS_PAYLOAD,
    }),
  ];
}

describe("main Quick Log sensor provenance fence", () => {
  it("turns fresh canonical-live Windows diagnostics into no data before auto-attach", () => {
    const snapshot = buildSensorSnapshot(diagnosticRows(), {
      tentId: "tent-1",
      now: NOW,
    });
    const strip = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot,
      hasTent: true,
      now: NOW,
    });

    expect(snapshot.status).toBe("empty");
    expect(snapshot.freshness).toBe("unknown");
    expect(snapshot.source).toBeNull();
    expect(snapshot.usable).toBe(false);
    expect(strip.status).toBe("no_data");
    expect(strip.trustBadge.attachable).toBe(false);
    expect(strip.classification.isHealthyEvidence).toBe(false);
    expect(buildSensorSnapshotSavePayload(snapshot)).toBeNull();
  });

  it("keeps a physical Windows gateway eligible and strips classification payload", () => {
    const snapshot = buildSensorSnapshot(physicalRows(), {
      tentId: "tent-1",
      now: NOW,
    });
    const strip = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot,
      hasTent: true,
      now: NOW,
    });
    const saved = buildSensorSnapshotSavePayload(snapshot);

    expect(snapshot.status).toBe("fresh_live");
    expect(snapshot.usable).toBe(true);
    expect(snapshot.metrics.temp_f).toBeCloseTo(75.2, 5);
    expect(snapshot.metrics.humidity_pct).toBe(55);
    expect(strip.status).toBe("usable");
    expect(strip.trustBadge.attachable).toBe(true);
    expect(saved?.status).toBe("fresh_live");
    expect(JSON.stringify(snapshot)).not.toMatch(/raw_payload|PASSKEY|classification-only-secret/i);
    expect(JSON.stringify(saved)).not.toMatch(/raw_payload|PASSKEY|classification-only-secret/i);
  });

  it("keeps proven legacy listener-source rows eligible after provenance redaction", () => {
    const cachedRows = prepareSensorSnapshotRowsForCache(
      physicalRows().map((candidate) => ({
        ...candidate,
        source: "ecowitt_windows_testbench",
      })),
    );
    const snapshot = buildSensorSnapshot(cachedRows, {
      tentId: "tent-1",
      now: NOW,
    });

    expect(cachedRows.every((candidate) => candidate.source === "live")).toBe(true);
    expect(snapshot.status).toBe("fresh_live");
    expect(snapshot.usable).toBe(true);
    expect(JSON.stringify(cachedRows)).not.toMatch(/raw_payload|classification-only-secret/i);
  });

  it("omits newer diagnostics before choosing the physical cohort", () => {
    for (const rows of [
      [...diagnosticRows(), ...physicalRows()],
      [...physicalRows(), ...diagnosticRows()].reverse(),
    ]) {
      const snapshot = buildSensorSnapshot(rows, { tentId: "tent-1", now: NOW });

      expect(snapshot.status).toBe("fresh_live");
      expect(snapshot.metrics.temp_f).toBeCloseTo(75.2, 5);
      expect(snapshot.metrics.humidity_pct).toBe(55);
    }
  });

  it("selects one deterministic source cohort instead of mixing metrics", () => {
    const mixed = [
      row({
        id: "older-live-humidity",
        metric: "humidity_pct",
        value: 91,
        source: "live",
        captured_at: "2026-07-17T11:58:00.000Z",
        ts: "2026-07-17T11:58:00.000Z",
        created_at: "2026-07-17T11:58:00.000Z",
      }),
      row({
        id: "newer-manual-temperature",
        value: 23,
        source: "manual",
        captured_at: "2026-07-17T11:59:00.000Z",
        ts: "2026-07-17T11:59:00.000Z",
        created_at: "2026-07-17T11:59:00.000Z",
      }),
    ];

    const a = buildSensorSnapshot(mixed, { tentId: "tent-1", now: NOW });
    const b = buildSensorSnapshot([...mixed].reverse(), { tentId: "tent-1", now: NOW });

    expect(a).toEqual(b);
    expect(a.source).toBe("manual");
    expect(a.status).toBe("fresh_non_live");
    expect(a.metrics.temp_f).toBeCloseTo(73.4, 5);
    expect(a.metrics.humidity_pct).toBeNull();
  });

  it("recomputes freshness from redacted cached rows instead of freezing live status", () => {
    const cachedRows = prepareSensorSnapshotRowsForCache(physicalRows());
    const fresh = buildSensorSnapshot(cachedRows, {
      tentId: "tent-1",
      now: NOW,
    });
    const later = buildSensorSnapshot(cachedRows, {
      tentId: "tent-1",
      now: new Date("2026-07-17T13:00:00.000Z"),
    });

    expect(fresh.status).toBe("fresh_live");
    expect(later.status).toBe("stale");
    expect(JSON.stringify(cachedRows)).not.toMatch(
      /raw_payload|PASSKEY|classification-only-secret/i,
    );
  });

  it("caches only the redacted projection after provenance classification", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/sensor.ts"), "utf8");

    expect(source).toMatch(/useQuery<SensorSnapshotCacheRow\[\]>/);
    expect(source).toMatch(/queryFn:[\s\S]*return prepareSensorSnapshotRowsForCache/);
    expect(source).toMatch(/snapshot:\s*buildSensorSnapshot\(rows/);
    expect(source).not.toMatch(/return\s+\(data\s*\?\?\s*\[\]\)\s+as\s+RawSensorRow/);
  });
});
