import { describe, expect, it } from "vitest";
import type { BuildTentSnapshotInput } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { buildTentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { selectTentEnvironmentSnapshotFallback } from "@/lib/tentEnvironmentSnapshotFallbackRules";

const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
const OLDER = "2026-08-20T14:30:00.000Z";
const NEWER = "2026-08-20T15:30:00.000Z";
const NOW = Date.parse(NEWER);

function sensorRow(overrides: Partial<BuildTentSnapshotInput> = {}): BuildTentSnapshotInput {
  return {
    tent_id: TENT_ID,
    ts: NEWER,
    captured_at: NEWER,
    metric: "temperature_c",
    value: 22,
    source: "live",
    ...overrides,
  };
}

function manualCard(
  overrides: Partial<ManualSnapshotTimelineCard> = {},
): ManualSnapshotTimelineCard {
  return {
    id: "manual-diary-entry",
    title: "Manual sensor snapshot",
    capturedAt: NEWER,
    sourceLabel: "Manual",
    source: "manual",
    tentId: TENT_ID,
    plantId: null,
    isTentLevel: true,
    notes: null,
    readings: [
      { field: "air_temp_c", value: 22, unit: "°C", derived: false },
      { field: "humidity_pct", value: 55, unit: "%", derived: false },
      { field: "vpd_kpa", value: 1.19, unit: "kPa", derived: true },
    ],
    severity: "ok",
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function select(overrides: Record<string, unknown> = {}) {
  return selectTentEnvironmentSnapshotFallback({
    sensorRows: [],
    sensorStatus: "success",
    manualCards: [],
    manualStatus: "success",
    now: NOW,
    ...overrides,
  });
}

describe("tent environment snapshot fallback — source precedence", () => {
  it.each([
    ["loading", "sensor_loading"],
    ["error", "sensor_unavailable"],
  ])("keeps sensor %s explicit and never consults diary evidence", (sensorStatus, kind) => {
    expect(select({ sensorStatus, manualCards: [manualCard()], manualStatus: "success" })).toEqual({
      kind,
    });
  });

  it("shows cached sensor rows with a refresh warning", () => {
    const rows = [sensorRow()];
    expect(select({ sensorRows: rows, sensorStatus: "refresh_error" })).toEqual({
      kind: "sensor",
      rows,
      refreshWarning: true,
    });
  });

  it("treats an empty sensor refresh failure as unavailable, not empty", () => {
    expect(select({ sensorStatus: "refresh_error", manualCards: [manualCard()] })).toEqual({
      kind: "sensor_unavailable",
    });
  });

  it("always gives successful real sensor rows precedence over manual diary cards", () => {
    const rows = [sensorRow()];
    expect(select({ sensorRows: rows, manualCards: [manualCard()] })).toEqual({
      kind: "sensor",
      rows,
      refreshWarning: false,
    });
  });
});

describe("tent environment snapshot fallback — manual diary states", () => {
  it.each([
    ["loading", "manual_loading"],
    ["error", "manual_unavailable"],
  ])(
    "keeps manual %s explicit rather than claiming established emptiness",
    (manualStatus, kind) => {
      expect(select({ manualStatus })).toEqual({ kind });
    },
  );

  it("shows a cached manual card with a refresh warning", () => {
    const card = manualCard();
    const result = select({ manualCards: [card], manualStatus: "refresh_error" });
    expect(result.kind).toBe("manual");
    expect(result).toMatchObject({ refreshWarning: true });
  });

  it("keeps cached empty pending while a manual snapshot refresh is in flight", () => {
    expect(select({ manualStatus: "refreshing" })).toEqual({ kind: "manual_loading" });
  });

  it("keeps a cached manual card visible with a refresh-in-progress marker", () => {
    const card = manualCard();
    const result = select({ manualCards: [card], manualStatus: "refreshing" });
    expect(result.kind).toBe("manual");
    expect(result).toMatchObject({ refreshWarning: false, refreshing: true });
  });

  it("treats an empty manual refresh failure as unavailable", () => {
    expect(select({ manualStatus: "refresh_error" })).toEqual({ kind: "manual_unavailable" });
  });

  it("returns established empty only after both successful reads have no evidence", () => {
    expect(select()).toEqual({ kind: "empty" });
  });

  it("deterministically selects the newest card even when input order is old first", () => {
    const older = manualCard({ id: "a", capturedAt: OLDER });
    const newer = manualCard({ id: "b", capturedAt: NEWER });
    const result = select({ manualCards: [older, newer] });
    expect(result.kind).toBe("manual");
    if (result.kind !== "manual") throw new Error("Expected manual fallback");
    expect(result.capturedAt).toBe(NEWER);
  });
});

describe("tent environment snapshot fallback — diary card mapping", () => {
  it("maps only direct air readings with exact manual provenance and no diary id", () => {
    const result = select({ manualCards: [manualCard()] });
    expect(result.kind).toBe("manual");
    if (result.kind !== "manual") throw new Error("Expected manual fallback");

    expect(result.rows).toEqual([
      {
        tent_id: TENT_ID,
        ts: NEWER,
        captured_at: NEWER,
        metric: "temperature_c",
        value: 22,
        source: "manual",
        quality: "ok",
      },
      {
        tent_id: TENT_ID,
        ts: NEWER,
        captured_at: NEWER,
        metric: "humidity_pct",
        value: 55,
        source: "manual",
        quality: "ok",
      },
    ]);
    expect(result.rows.every((row) => !("id" in row))).toBe(true);
  });

  it("allows explicit direct VPD but excludes derived VPD", () => {
    const card = manualCard({
      readings: [
        { field: "air_temp_c", value: 22, unit: "°C", derived: false },
        { field: "vpd_kpa", value: 1.19, unit: "kPa", derived: true },
        { field: "vpd_kpa", value: 1.08, unit: "kPa", derived: false },
      ],
    });
    const result = select({ manualCards: [card] });
    expect(result.kind).toBe("manual");
    if (result.kind !== "manual") throw new Error("Expected manual fallback");
    expect(result.rows.map((row) => [row.metric, row.value])).toEqual([
      ["temperature_c", 22],
      ["vpd_kpa", 1.08],
    ]);
  });

  it.each([
    ["warning", "degraded"],
    ["invalid", "invalid"],
  ] as const)("maps %s cards to fail-closed row quality", (severity, quality) => {
    const result = select({ manualCards: [manualCard({ severity })] });
    expect(result.kind).toBe("manual");
    if (result.kind !== "manual") throw new Error("Expected manual fallback");
    expect(result.rows.every((row) => row.quality === quality)).toBe(true);
    expect(result.rows.every((row) => row.quality !== "ok")).toBe(true);
  });

  it("preserves direct manual quality at the exact allowed future-skew boundary", () => {
    const capturedAt = new Date(NOW + LIVE_CURRENT_STATE_STALE_MS).toISOString();
    const result = select({ manualCards: [manualCard({ capturedAt })] });
    expect(result.kind).toBe("manual");
    if (result.kind !== "manual") throw new Error("Expected manual fallback");

    expect(result.capturedAt).toBe(capturedAt);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.quality === "ok")).toBe(true);
  });

  it("invalidates every direct manual row beyond allowed future skew", () => {
    const capturedAt = new Date(NOW + LIVE_CURRENT_STATE_STALE_MS + 1).toISOString();
    const result = select({
      manualCards: [
        manualCard({
          capturedAt,
          readings: [
            { field: "air_temp_c", value: 22, unit: "°C", derived: false },
            { field: "humidity_pct", value: 55, unit: "%", derived: false },
            { field: "vpd_kpa", value: 1.08, unit: "kPa", derived: false },
            { field: "vpd_kpa", value: 1.19, unit: "kPa", derived: true },
          ],
        }),
      ],
    });
    expect(result.kind).toBe("manual");
    if (result.kind !== "manual") throw new Error("Expected manual fallback");

    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((row) => row.quality === "invalid")).toBe(true);
    const view = buildTentSnapshotView(result.rows, null, NOW);
    expect(view.sourceLabel).toBe("Invalid");
    expect(view.canAssessStage).toBe(false);
    expect(view.metrics.every((item) => item.status !== "ok")).toBe(true);
    expect(view.metrics.every((item) => item.chipStatus !== "ok")).toBe(true);
  });

  it("returns an explicit unusable state for a pH-only manual card", () => {
    const result = select({
      manualCards: [
        manualCard({
          readings: [{ field: "reservoir_ph", value: 6.1, unit: "pH", derived: false }],
        }),
      ],
    });
    expect(result).toEqual({
      kind: "manual_unusable",
      severity: "ok",
      refreshWarning: false,
    });
  });

  it("normalizes nullish collections without inventing evidence", () => {
    expect(select({ sensorRows: null, manualCards: undefined })).toEqual({ kind: "empty" });
    expect(select({ sensorRows: null, manualCards: undefined })).toEqual(
      select({ sensorRows: null, manualCards: undefined }),
    );
  });
});
