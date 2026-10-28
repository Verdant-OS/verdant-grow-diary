import { describe, expect, it } from "vitest";
import type { SensorReading } from "@/mock";
import { selectTentEnvironmentManualDisplay } from "@/lib/tentEnvironmentDisplayRules";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";

const TENT = "b7b4cec9-23d6-4c75-8e49-29efbd5b11cc";
const AT = "2026-10-24T06:25:00Z";
const NOW = Date.parse("2026-10-24T13:25:00Z");
const manual = (overrides: Partial<SensorReading> = {}): SensorReading => ({
  tentId: TENT,
  ts: AT,
  capturedAt: AT,
  source: "manual",
  status: "usable",
  temp: 23.3,
  rh: 55,
  vpd: 1.1,
  co2: 0,
  soil: 0,
  observedMetrics: ["temp", "rh", "vpd"],
  ...overrides,
});
const row = (
  metric: string,
  value: number,
  at: string,
  quality: string | null = null,
): BuildTentSnapshotInput => ({
  id: `${metric}-${at}`,
  tent_id: TENT,
  metric,
  value,
  ts: at,
  captured_at: at,
  source: "live",
  quality,
});
const select = (
  manualReadings: SensorReading[] = [manual()],
  sensorRows: BuildTentSnapshotInput[] = [],
  now = NOW,
) => selectTentEnvironmentManualDisplay({ tentId: TENT, manualReadings, sensorRows, now });

describe("VER-278 manual environment selection", () => {
  it("shows the exact observed value and sibling metrics with the manual capture time", () => {
    const selected = select()!;
    expect(selected.canonicalVpd).toMatchObject({
      kpa: 1.1,
      capturedAt: AT,
      source: "manual",
      sourceLabel: "Manual",
    });
    const view = buildTentSnapshotView(selected.rows, "veg", NOW, {
      canonicalVpd: selected.canonicalVpd,
      temperatureUnit: "celsius",
    });
    expect(view.lastUpdatedIso).toBe(AT);
    expect(view.metrics.map((m) => [m.key, m.display, m.status])).toEqual([
      ["temp", "23.3", "ok"],
      ["rh", "55.0", "ok"],
      ["vpd", "1.10", "ok"],
    ]);
  });
  it.each([
    [24 * 60 * 60 * 1000, "ok"],
    [24 * 60 * 60 * 1000 + 1, "stale"],
  ] as const)("uses the manual freshness boundary at age %i ms", (age, status) => {
    const now = Date.parse(AT) + age;
    const selected = select([manual()], [], now)!;
    const view = buildTentSnapshotView(selected.rows, "veg", now, {
      canonicalVpd: selected.canonicalVpd,
    });
    expect(view.metrics.find((m) => m.key === "vpd")?.status).toBe(status);
    if (status === "stale") {
      expect(view.canAssessStage).toBe(false);
      expect(view.metrics.find((m) => m.key === "vpd")?.chipStatus).not.toBe("ok");
    }
  });
  it("honors persisted stale lineage even inside the time window", () => {
    const selected = select([manual({ freshness: { floor: "stale", timeSources: ["manual"] } })])!;
    const view = buildTentSnapshotView(selected.rows, "veg", NOW, {
      canonicalVpd: selected.canonicalVpd,
    });
    expect(view.metrics.find((m) => m.key === "vpd")).toMatchObject({
      display: "1.10",
      status: "stale",
    });
    expect(view.canAssessStage).toBe(false);
  });
  it.each([
    { vpd: NaN },
    { vpd: -1 },
    { vpd: 99 },
    { temp: 120 },
    { rh: 150 },
    { status: "invalid" as const },
    { source: "live" as const },
    { source: "csv" as const },
    { capturedAt: "invalid-date" },
    { capturedAt: "2026-10-24T14:25:00Z" },
    { tentId: "other-tent" },
    { observedMetrics: ["temp", "rh"] as SensorReading["observedMetrics"] },
  ])("does not admit rejected/unobserved/out-of-scope manual evidence: %j", (overrides) => {
    expect(select([manual(overrides)])).toBeNull();
  });
  it("does not coalesce independent manual captures into invented temperature/RH", () => {
    const selected = select([
      manual({ observedMetrics: ["vpd"] }),
      manual({ observedMetrics: ["temp", "rh"], vpd: 0 }),
    ])!;
    expect(selected.rows.map((r) => r.metric)).toEqual(["vpd_kpa"]);
    expect(selected.rows[0].capture_ref).toBeUndefined();
  });
  it.each(["2026-10-24T06:25:00Z", "2026-10-24T07:25:00Z"])(
    "withholds an equal/older manual after rejected sensor VPD at %s",
    (at) => {
      expect(select([manual()], [row("vpd_kpa", 1.25, at, "invalid")])).toBeNull();
    },
  );
  it("withholds a manual whose unknown identity collides with a rejected sensor climate capture", () => {
    expect(select([manual()], [row("humidity_pct", 150, AT)])).toBeNull();
  });
  it("permits a strictly newer manual after a rejected capture", () => {
    expect(
      select([manual()], [row("vpd_kpa", 1.25, "2026-10-24T05:25:00Z", "invalid")])?.canonicalVpd
        .kpa,
    ).toBe(1.1);
  });
  it("preserves Detail's observed raw-header precedence", () => {
    expect(select([manual()], [row("vpd_kpa", 1.2, "2026-10-24T05:25:00Z")])).toBeNull();
  });
  it("uses a newer event observation on these displays without changing Tonight / VER-225", () => {
    const snapshot = {
      status: "ok" as const,
      snapshot: {
        ...EMPTY_SNAPSHOT,
        source: "manual" as const,
        ts: "2026-10-24T05:09:00Z",
        temp: 23.3,
        rh: 55,
        vpd: 1.29,
        diary_capture_id: "older-diary",
      },
    };
    const selected = selectTentEnvironmentManualDisplay({
      tentId: TENT,
      sensorRows: [],
      manualReadings: [manual()],
      snapshot,
      now: NOW,
    });
    expect(selected?.canonicalVpd.kpa).toBe(1.1);
    const tonight = buildTonightTentMetrics({
      rows: [],
      rowsRead: { status: "success" },
      snapshot,
      now: new Date(NOW),
    });
    expect(tonight.find((m) => m.key === "vpd")?.value).toBe(1.29);
  });
});
