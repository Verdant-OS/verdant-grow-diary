/**
 * EcoWitt tent Snapshot V0 — Sensor Truth tagging + quiet bridge + stuck extremes.
 */
import { describe, expect, it } from "vitest";
import {
  classifyEcowittTentSnapshotV0BridgeQuiet,
  classifyEcowittTentSnapshotV0Source,
  ECOWITT_TENT_SNAPSHOT_V0_NO_LIVE_DATA,
  evaluateEcowittTentSnapshotV0Metric,
  isStuckZeroOrHundredPct,
  mapEcowittTentSnapshotV0MetricKey,
} from "@/lib/ecowittTentSnapshotV0Rules";
import {
  buildEcowittTentSnapshotV0ViewModel,
  ECOWITT_TENT_SNAPSHOT_V0_UNUSED_FIELD_NAMES,
} from "@/lib/ecowittTentSnapshotV0ViewModel";
import { selectEcowittCandidates } from "@/lib/ecowittLatestSnapshotFilter";

const NOW = new Date("2026-08-20T18:00:00.000Z");
const FRESH_AT = "2026-08-20T17:50:00.000Z"; // 10 min ago
const STALE_AT = "2026-08-20T16:00:00.000Z"; // 2h ago
const TENT = "11111111-1111-4111-8111-111111111111";

function row(
  overrides: Partial<{
    source: string | null;
    captured_at: string;
    metric: string;
    value: number;
    raw_payload: unknown;
  }> = {},
) {
  return {
    tent_id: TENT,
    source: overrides.source ?? "live",
    captured_at: overrides.captured_at ?? FRESH_AT,
    metric: overrides.metric ?? "temperature_c",
    value: overrides.value ?? 24,
    raw_payload: overrides.raw_payload ?? { vendor: "ecowitt", dateutc: FRESH_AT },
  };
}

describe("ecowittTentSnapshotV0Rules — Sensor Truth tagging", () => {
  it("tags fresh canonical live as live", () => {
    expect(classifyEcowittTentSnapshotV0Source({ row: row(), now: NOW })).toBe("live");
  });

  it("tags aged canonical live as stale", () => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({ captured_at: STALE_AT }),
        now: NOW,
      }),
    ).toBe("stale");
  });

  it("tags demo and never promotes demo to live", () => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({ source: "demo" }),
        now: NOW,
      }),
    ).toBe("demo");
  });

  it("tags testbench GET lineage as demo even when source claims live", () => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({
          source: "live",
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: { confidence: "demo", verdant_source: "demo" },
          },
        }),
        now: NOW,
      }),
    ).toBe("demo");
  });

  it("tags manual Quick Log source as manual", () => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({ source: "manual" }),
        now: NOW,
      }),
    ).toBe("manual");
  });

  it("never promotes vendor string ecowitt to live (even when fresh)", () => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({ source: "ecowitt", captured_at: FRESH_AT }),
        now: NOW,
      }),
    ).toBe("invalid");
  });

  it("never promotes unknown vendor/transport to live via freshness", () => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({ source: "webhook", captured_at: FRESH_AT }),
        now: NOW,
      }),
    ).toBe("invalid");
  });

  it("marks stuck RH 0/100 invalid", () => {
    expect(isStuckZeroOrHundredPct(0)).toBe(true);
    expect(isStuckZeroOrHundredPct(100)).toBe(true);
    expect(evaluateEcowittTentSnapshotV0Metric("rh", 0).valid).toBe(false);
    expect(evaluateEcowittTentSnapshotV0Metric("rh", 100).valid).toBe(false);
    expect(evaluateEcowittTentSnapshotV0Metric("rh", 55).valid).toBe(true);
  });

  it("marks stuck soil 0/100 invalid", () => {
    expect(evaluateEcowittTentSnapshotV0Metric("soil", 0).valid).toBe(false);
    expect(evaluateEcowittTentSnapshotV0Metric("soil", 100).valid).toBe(false);
    expect(evaluateEcowittTentSnapshotV0Metric("soil", 40).valid).toBe(true);
  });

  it("maps only known metric vocabulary; refuses invented names", () => {
    expect(mapEcowittTentSnapshotV0MetricKey("temperature_c")).toBe("temp");
    expect(mapEcowittTentSnapshotV0MetricKey("humidity_pct")).toBe("rh");
    expect(mapEcowittTentSnapshotV0MetricKey("soil_moisture_pct")).toBe("soil");
    expect(mapEcowittTentSnapshotV0MetricKey("co2_ppm")).toBeNull();
    expect(mapEcowittTentSnapshotV0MetricKey("leaf_vpd")).toBeNull();
    expect(mapEcowittTentSnapshotV0MetricKey("soilmoisture1")).toBeNull();
  });
});

describe("ecowittTentSnapshotV0Rules — quiet bridge", () => {
  it("reports quiet when there are no rows", () => {
    expect(classifyEcowittTentSnapshotV0BridgeQuiet([], { now: NOW })).toBe("quiet");
  });

  it("reports has_live when a fresh live row exists", () => {
    expect(classifyEcowittTentSnapshotV0BridgeQuiet([row()], { now: NOW })).toBe("has_live");
  });

  it("reports has_non_live_only when only stale/demo/vendor rows exist", () => {
    expect(
      classifyEcowittTentSnapshotV0BridgeQuiet(
        [row({ source: "ecowitt" }), row({ source: "demo", metric: "humidity_pct", value: 50 })],
        { now: NOW },
      ),
    ).toBe("has_non_live_only");
  });
});

describe("buildEcowittTentSnapshotV0ViewModel", () => {
  it("presents exactly three metrics with badges and captured_at", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({ metric: "temperature_c", value: 24 }),
        row({ metric: "humidity_pct", value: 55 }),
        row({ metric: "soil_moisture_pct", value: 40 }),
      ],
      { tentId: TENT, now: NOW, stage: "veg" },
    );
    expect(vm.metrics).toHaveLength(3);
    expect(vm.metrics.map((m) => m.key)).toEqual(["temp", "rh", "soil"]);
    for (const m of vm.metrics) {
      expect(m.badgeLabel).toBe("Live");
      expect(m.capturedAt).toBe(FRESH_AT);
      expect(m.value).not.toBeNull();
    }
    expect(vm.quietMessage).toBeNull();
  });

  it("shows No live data when the bridge is quiet", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel([], { tentId: TENT, now: NOW });
    expect(vm.bridgeQuiet).toBe(true);
    expect(vm.quietMessage).toBe(ECOWITT_TENT_SNAPSHOT_V0_NO_LIVE_DATA);
  });

  it("shows No live data when only vendor ecowitt rows exist (never live)", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({ source: "ecowitt", metric: "temperature_c", value: 24 }),
        row({ source: "ecowitt", metric: "humidity_pct", value: 55 }),
      ],
      { tentId: TENT, now: NOW },
    );
    expect(vm.quietMessage).toBe(ECOWITT_TENT_SNAPSHOT_V0_NO_LIVE_DATA);
    expect(vm.metrics[0]?.truthSource).toBe("invalid");
  });

  it("marks stuck soil as invalid and does not show it as healthy", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "soil_moisture_pct", value: 0 })],
      { tentId: TENT, now: NOW },
    );
    const soil = vm.metrics.find((m) => m.key === "soil");
    expect(soil?.truthSource).toBe("invalid");
    expect(soil?.value).toBeNull();
    expect(soil?.reason).toMatch(/stuck/i);
  });

  it("builds 24h sparkline points and refuses unused FIELD_MAP extras", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({ metric: "temperature_c", value: 24, captured_at: FRESH_AT }),
        row({
          metric: "temperature_c",
          value: 23,
          captured_at: "2026-08-20T12:00:00.000Z",
        }),
      ],
      { tentId: TENT, now: NOW },
    );
    expect(vm.metrics[0]?.sparkline.length).toBeGreaterThanOrEqual(2);
    expect(vm.unusedFieldNamesRefused).toEqual([...ECOWITT_TENT_SNAPSHOT_V0_UNUSED_FIELD_NAMES]);
    expect(vm.unusedFieldNamesRefused).toContain("co2");
    expect(vm.unusedFieldNamesRefused).toContain("soilmoisture2");
  });
});

describe("ecowittLatestSnapshotFilter — vendor ecowitt never resolves to live", () => {
  it.each([
    ["live", "live"],
    ["ecowitt", "invalid"],
    ["manual", "manual"],
    ["csv", "csv"],
    ["demo", "demo"],
    ["stale", "stale"],
    ["invalid", "invalid"],
    [null, "invalid"],
    ["webhook", "invalid"],
  ] as const)("resolves persisted source %s to %s", (source, expected) => {
    const candidates = selectEcowittCandidates(
      [
        {
          tent_id: TENT,
          source,
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
        },
      ],
      { tentId: TENT },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source).toBe(expected);
  });
});
