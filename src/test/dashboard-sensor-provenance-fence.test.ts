import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDashboardStabilityReadings,
  dashboardSnapshotForHealthyCues,
  evaluateDashboardSensorQuality,
  groupDashboardSensorReadings,
  selectDashboardSensorEvidenceRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { computeEnvironmentStability } from "@/lib/environmentStabilityRules";
import { snapshotFromReadings, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { isSnapshotPersistable } from "@/lib/environmentAlertPersistence";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const FRESH = "2026-07-17T11:55:00.000Z";
const DASHBOARD = readFileSync(resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
const LATEST_SNAPSHOT_HOOK = readFileSync(
  resolve(__dirname, "../hooks/useLatestSensorSnapshot.ts"),
  "utf8",
);

const DIAGNOSTIC_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    confidence: "test",
    verdant_source: "live",
  },
};

const PHYSICAL_GATEWAY_PAYLOAD = {
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

function row(overrides: Partial<DashboardSensorEvidenceRow> = {}): DashboardSensorEvidenceRow {
  return {
    tent_id: "tent-1",
    ts: FRESH,
    metric: "vpd_kpa",
    value: 1.05,
    source: "live",
    quality: "ok",
    raw_payload: null,
    ...overrides,
  };
}

describe("Dashboard sensor provenance fence", () => {
  it("excludes canonical-live Windows diagnostics but keeps physical gateway evidence", () => {
    const diagnostic = row({ raw_payload: DIAGNOSTIC_PAYLOAD });
    const physical = row({
      ts: "2026-07-17T11:56:00.000Z",
      raw_payload: PHYSICAL_GATEWAY_PAYLOAD,
    });

    expect(selectDashboardSensorEvidenceRows([diagnostic, physical])).toEqual([physical]);
  });

  it("keeps diagnostics out of charts and strips raw provenance from chart objects", () => {
    const grouped = groupDashboardSensorReadings([
      row({
        metric: "vpd_kpa",
        value: 1.8,
        raw_payload: DIAGNOSTIC_PAYLOAD,
      }),
      row({
        metric: "temperature_c",
        value: 24,
        raw_payload: PHYSICAL_GATEWAY_PAYLOAD,
      }),
    ]);

    expect(grouped).toEqual([
      {
        ts: FRESH,
        tentId: "tent-1",
        temp: 24,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        source: "live",
        status: "usable",
        capturedAt: FRESH,
      },
    ]);
    expect("raw_payload" in grouped[0]).toBe(false);
  });

  it("labels every chart point and rejects mixed source cohorts at one timestamp", () => {
    expect(
      groupDashboardSensorReadings([row({ source: "manual", raw_payload: null })])[0],
    ).toMatchObject({ source: "manual", status: "usable", capturedAt: FRESH });

    expect(
      groupDashboardSensorReadings([
        row({ metric: "temperature_c", source: "live" }),
        row({ metric: "humidity_pct", source: "manual" }),
      ]),
    ).toEqual([]);
  });

  it("cannot let diagnostic VPD rows improve the stability rollup", () => {
    const diagnosticInputs = buildDashboardStabilityReadings([
      row({ raw_payload: DIAGNOSTIC_PAYLOAD }),
    ]);
    const physicalInputs = buildDashboardStabilityReadings([
      row({ raw_payload: PHYSICAL_GATEWAY_PAYLOAD }),
    ]);

    expect(diagnosticInputs).toEqual([]);
    expect(
      computeEnvironmentStability(diagnosticInputs, {
        stage: "veg",
        now: NOW,
      }).status,
    ).toBe("unavailable");
    expect(physicalInputs).toHaveLength(1);
    expect(physicalInputs[0]).toMatchObject({
      ts: FRESH,
      vpd: 1.05,
      source: "live",
    });
  });

  it("keeps explicit invalid and stale sources from stability evidence", () => {
    for (const source of ["invalid", "stale", "sim", "testbench"] as const) {
      const result = computeEnvironmentStability(
        buildDashboardStabilityReadings([row({ source })]),
        { stage: "veg", now: NOW },
      );
      expect(result.status).toBe("unavailable");
    }
  });

  it("rejects every explicit non-ok quality from counts, charts, snapshots, and stability", () => {
    for (const quality of ["degraded", "stale", "invalid", "unknown"] as const) {
      const flagged = row({ quality, raw_payload: PHYSICAL_GATEWAY_PAYLOAD });
      expect(selectDashboardSensorEvidenceRows([flagged])).toEqual([]);
      expect(groupDashboardSensorReadings([flagged])).toEqual([]);
      expect(buildDashboardStabilityReadings([flagged])).toEqual([]);
    }
  });

  it("rejects demo, stale, invalid, and unknown sources before ordinary Dashboard display", () => {
    for (const source of ["demo", "sim", "stale", "invalid", "unavailable", "mystery_bridge", ""]) {
      expect(selectDashboardSensorEvidenceRows([row({ source })])).toEqual([]);
    }
    expect(selectDashboardSensorEvidenceRows([row({ source: null })])).toEqual([]);
  });

  it("allows a physically proven live EcoWitt row to build a redacted snapshot", () => {
    const selected = selectDashboardSensorEvidenceRows([
      row({ raw_payload: PHYSICAL_GATEWAY_PAYLOAD }),
    ]);
    const snapshot = snapshotFromReadings(
      selected.map(({ ts, metric, value, source }) => ({
        ts,
        metric,
        value: value as number,
        source,
      })),
    );

    expect(snapshot?.source).toBe("live");
    expect(snapshot).not.toHaveProperty("raw_payload");
  });

  it("caps plausible unverified and simulated snapshots at review, never healthy/green", () => {
    const base: SensorSnapshot = {
      source: "unverified",
      ts: FRESH,
      temp: 24,
      rh: 55,
      vpd: 1.05,
      co2: 800,
      soil: 45,
      soil_ec: 1.2,
      soil_temp: 23,
      ppfd: 600,
    };

    for (const source of ["unverified", "sim", "diary", "csv"] as const) {
      const snapshot = { ...base, source };
      expect(evaluateDashboardSensorQuality(snapshot, NOW.getTime())).toMatchObject({
        quality: "watch",
        headline: "Sensor data needs review",
      });
      expect(dashboardSnapshotForHealthyCues(snapshot)).toBeNull();
    }

    expect(dashboardSnapshotForHealthyCues({ ...base, source: "live" })).not.toBeNull();
    expect(dashboardSnapshotForHealthyCues({ ...base, source: "manual" })).not.toBeNull();
  });

  it("gives diary and unverified snapshots no target or alert-persistence source", () => {
    const base: SensorSnapshot = {
      source: "diary",
      ts: FRESH,
      temp: 24,
      rh: 55,
      vpd: 1.05,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
    };
    const targets = { temp: { min: 20, max: 28 } };

    for (const source of ["diary", "unverified"] as const) {
      const safeSnapshot = dashboardSnapshotForHealthyCues({ ...base, source });
      expect(safeSnapshot).toBeNull();
      expect(compareSnapshotToTargets(safeSnapshot, targets).status).toBe("unavailable");
      expect(
        isSnapshotPersistable({
          snapshot: safeSnapshot,
          quality: "watch",
          now: NOW.getTime(),
        }),
      ).toBe(false);
    }
  });

  it("filters quality and provenance before the latest snapshot is assembled", () => {
    expect(LATEST_SNAPSHOT_HOOK).toMatch(
      /select\("id,ts,metric,value,quality,source,tent_id,created_at,raw_payload"\)/,
    );
    const filterIndex = LATEST_SNAPSHOT_HOOK.indexOf(
      "selectDashboardSensorEvidenceRows(data ?? [])",
    );
    const assemblyIndex = LATEST_SNAPSHOT_HOOK.lastIndexOf("snapshotFromReadings(");
    expect(filterIndex).toBeGreaterThan(-1);
    expect(assemblyIndex).toBeGreaterThan(filterIndex);
  });

  it("wires the evidence-only rows into counts, charts, snapshots, and per-tent stability", () => {
    expect(DASHBOARD).toContain(
      "const dashboardSensorRows = selectDashboardSensorEvidenceRows(rawReadings)",
    );
    expect(DASHBOARD).toContain(
      "const readings = groupDashboardSensorReadings(dashboardSensorRows)",
    );
    expect(DASHBOARD).toContain("const tentRows = selectDashboardSensorEvidenceRows(");
    expect(DASHBOARD).toContain("const rs = buildDashboardStabilityReadings(tentRows)");
    expect(DASHBOARD).toContain("tentRows as BuildTentSnapshotInput[]");
    expect(DASHBOARD).toContain("sensorReadingCount: dashboardSensorRows.length");
    expect(DASHBOARD).toContain("sensorSnapshotCount={dashboardSensorRows.length}");
    expect(DASHBOARD).toContain("dashboardSnapshotForHealthyCues(");
    expect(DASHBOARD).toContain("evaluateDashboardSensorQuality(");
    expect(DASHBOARD).toMatch(
      /usePersistEnvironmentAlerts\(\{[\s\S]*?snapshot:\s*dashboardHealthSnapshot/,
    );
    expect(DASHBOARD).toMatch(
      /const\s+snap\s*=\s*dashboardHealthSnapshot;[\s\S]*?buildEnvironmentAlerts/,
    );
    expect(DASHBOARD).not.toContain("evaluateSensorQuality(");
    expect(DASHBOARD).not.toContain("raw_payload");
  });
});
