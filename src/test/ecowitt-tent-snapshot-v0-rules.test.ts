/**
 * EcoWitt tent Snapshot V0 — Sensor Truth tagging + quiet bridge + stuck extremes.
 */
import { describe, expect, it } from "vitest";
import {
  classifyEcowittTentSnapshotV0BridgeQuiet,
  classifyEcowittTentSnapshotV0Source,
  ECOWITT_TENT_SNAPSHOT_V0_NO_LIVE_DATA,
  evaluateEcowittTentSnapshotV0Metric,
  isConstitutionSensorTruthSource,
  isForbiddenSensorTruthSourceToken,
  isStuckZeroOrHundredPct,
  mapEcowittTentSnapshotV0MetricKey,
  resolveEcowittTentSnapshotV0TempCelsius,
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
  const capturedAt = overrides.captured_at ?? FRESH_AT;
  return {
    tent_id: TENT,
    source: overrides.source ?? "live",
    captured_at: capturedAt,
    metric: overrides.metric ?? "temperature_c",
    value: overrides.value ?? 24,
    raw_payload:
      overrides.raw_payload ??
      ({ vendor: "ecowitt", dateutc: capturedAt } as Record<string, unknown>),
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

  it.each([
    "ecowitt",
    "ha",
    "homeassistant",
    "home_assistant",
    "mqtt",
    "esp32",
    "webhook",
  ] as const)("never promotes transport/vendor source=%s to live via freshness", (source) => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({ source, captured_at: FRESH_AT }),
        now: NOW,
      }),
    ).toBe("invalid");
    expect(isForbiddenSensorTruthSourceToken(source)).toBe(true);
  });

  it("ages live from packet dateutc even when captured_at is fresher", () => {
    expect(
      classifyEcowittTentSnapshotV0Source({
        row: row({
          source: "live",
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", dateutc: STALE_AT },
        }),
        now: NOW,
      }),
    ).toBe("stale");
  });

  it("never displays forbidden tokens as Sensor Truth badge labels", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({ source: "ecowitt", metric: "temperature_c", value: 24 }),
        row({ source: "mqtt", metric: "humidity_pct", value: 55 }),
        row({ source: "webhook", metric: "soil_moisture_pct", value: 40 }),
      ],
      { tentId: TENT, now: NOW },
    );
    const forbidden = ["ecowitt", "ha", "mqtt", "esp32", "webhook", "homeassistant"];
    for (const m of vm.metrics) {
      expect(m.truthSource === "none" || isConstitutionSensorTruthSource(m.truthSource)).toBe(true);
      for (const token of forbidden) {
        expect(m.badgeLabel.toLowerCase()).not.toContain(token);
      }
    }
    expect(vm.overallBadgeLabel.toLowerCase()).not.toMatch(/ecowitt|mqtt|webhook|esp32|\bha\b/);
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
      { tentId: TENT, now: NOW },
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

describe("ecowittTentSnapshotV0Rules — Safe-by-Design temperature units", () => {
  it("rejects Fahrenheit-looking temperature_c as invalid (never Live 77 °C)", () => {
    expect(evaluateEcowittTentSnapshotV0Metric("temp", 77).valid).toBe(false);
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temperature_c", value: 77, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.truthSource).toBe("invalid");
    expect(temp?.badgeLabel).toBe("Invalid");
    expect(temp?.value).toBeNull();
    expect(temp?.unit).toBe("°C");
  });

  it("converts temp_f Fahrenheit to Celsius before Live display", () => {
    expect(mapEcowittTentSnapshotV0MetricKey("temp_f")).toBe("temp");
    const resolved = resolveEcowittTentSnapshotV0TempCelsius("temp_f", 77);
    expect(resolved.fromFahrenheit).toBe(true);
    expect(resolved.celsius).toBeCloseTo(25, 5);
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temp_f", value: 77, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBeCloseTo(25, 5);
    expect(temp?.unit).toBe("°C");
    expect(temp?.badgeLabel).toBe("Live");
    expect(temp?.value).not.toBe(77);
  });

  it("keeps plausible Celsius temperature_c as Live", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temperature_c", value: 24, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBe(24);
    expect(temp?.badgeLabel).toBe("Live");
  });
});

describe("ecowittLatestSnapshotFilter — vendor ecowitt never resolves to live", () => {
  it.each([
    ["live", "live"],
    ["ecowitt", "invalid"],
    ["ha", "invalid"],
    ["mqtt", "invalid"],
    ["esp32", "invalid"],
    ["webhook", "invalid"],
    ["manual", "manual"],
    ["csv", "csv"],
    ["demo", "demo"],
    ["stale", "stale"],
    ["invalid", "invalid"],
    [null, "invalid"],
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
