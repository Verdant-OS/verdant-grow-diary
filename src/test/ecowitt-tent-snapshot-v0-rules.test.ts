/**
 * EcoWitt tent Snapshot V0 — Sensor Truth tagging + quiet bridge + stuck extremes.
 * Post-merge QA (Testy): tent/plant isolation, malformed timestamps, unit fail-closed.
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
  parseEcowittTentSnapshotV0DateUtcMs,
} from "@/lib/ecowittTentSnapshotV0Rules";
import {
  buildEcowittTentSnapshotV0ViewModel,
  ECOWITT_TENT_SNAPSHOT_V0_UNUSED_FIELD_NAMES,
} from "@/lib/ecowittTentSnapshotV0ViewModel";
import {
  selectEcowittCandidates,
  type EcowittSensorReadingRow,
} from "@/lib/ecowittLatestSnapshotFilter";

const NOW = new Date("2026-08-20T18:00:00.000Z");
const FRESH_AT = "2026-08-20T17:50:00.000Z"; // 10 min ago
const NEWER_AT = "2026-08-20T17:55:00.000Z"; // 5 min ago — newer than FRESH_AT
const STALE_AT = "2026-08-20T16:00:00.000Z"; // 2h ago
const TENT = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const PLANT_A = "33333333-3333-4333-8333-333333333333";
const PLANT_B = "44444444-4444-4444-8444-444444444444";

function row(
  overrides: Partial<{
    source: string | null;
    captured_at: string;
    metric: string;
    value: number;
    raw_payload: unknown;
    tent_id: string | null;
    plant_id: string | null;
  }> = {},
) {
  const capturedAt = overrides.captured_at ?? FRESH_AT;
  return {
    tent_id: overrides.tent_id === undefined ? TENT : overrides.tent_id,
    plant_id: overrides.plant_id === undefined ? null : overrides.plant_id,
    source: overrides.source ?? "live",
    captured_at: capturedAt,
    metric: overrides.metric ?? "temperature_c",
    value: overrides.value ?? 24,
    raw_payload:
      overrides.raw_payload ??
      ({ vendor: "ecowitt", dateutc: capturedAt } as Record<string, unknown>),
  };
}

function filterRow(
  overrides: Partial<EcowittSensorReadingRow> = {},
  payload: Record<string, unknown> = {
    vendor: "ecowitt",
    temp1f: 77,
    humidity1: 55,
    dateutc: FRESH_AT,
  },
): EcowittSensorReadingRow {
  return {
    tent_id: TENT,
    plant_id: null,
    source: "live",
    captured_at: FRESH_AT,
    raw_payload: payload,
    ...overrides,
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

describe("post-merge QA — plant/tent scope isolation", () => {
  it("V0 view-model: newer tent B row never appears on tent A", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({
          tent_id: TENT,
          metric: "temperature_c",
          value: 24,
          captured_at: FRESH_AT,
        }),
        row({
          tent_id: TENT_B,
          metric: "temperature_c",
          value: 99,
          captured_at: NEWER_AT,
          raw_payload: { vendor: "ecowitt", dateutc: NEWER_AT },
        }),
      ],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBe(24);
    expect(temp?.capturedAt).toBe(FRESH_AT);
    expect(temp?.value).not.toBe(99);
  });

  it("V0 view-model: null tent_id rows never bleed into a scoped tent", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({
          tent_id: null,
          metric: "humidity_pct",
          value: 88,
          captured_at: NEWER_AT,
          raw_payload: { vendor: "ecowitt", dateutc: NEWER_AT },
        }),
        row({
          tent_id: TENT,
          metric: "humidity_pct",
          value: 55,
          captured_at: FRESH_AT,
        }),
      ],
      { tentId: TENT, now: NOW },
    );
    const rh = vm.metrics.find((m) => m.key === "rh");
    expect(rh?.value).toBe(55);
    expect(rh?.value).not.toBe(88);
  });

  it("selectEcowittCandidates: newer tent B never bleeds into tent A", () => {
    const candidates = selectEcowittCandidates(
      [
        filterRow(
          { tent_id: TENT, captured_at: FRESH_AT },
          { vendor: "ecowitt", temp1f: 70, humidity1: 50, dateutc: FRESH_AT },
        ),
        filterRow(
          { tent_id: TENT_B, captured_at: NEWER_AT },
          { vendor: "ecowitt", temp1f: 90, humidity1: 80, dateutc: NEWER_AT },
        ),
      ],
      { tentId: TENT },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.payload.humidity1).toBe(50);
    expect(candidates[0]?.payload.temp1f).toBe(70);
  });

  it("selectEcowittCandidates: newer plant B never leaks when plantId=plant A", () => {
    // Existing filtering suite covered plant vs null; this pins plant-vs-plant leak.
    const candidates = selectEcowittCandidates(
      [
        filterRow(
          { plant_id: PLANT_A, captured_at: FRESH_AT },
          { vendor: "ecowitt", temp1f: 72, humidity1: 52, dateutc: FRESH_AT },
        ),
        filterRow(
          { plant_id: PLANT_B, captured_at: NEWER_AT },
          { vendor: "ecowitt", temp1f: 91, humidity1: 81, dateutc: NEWER_AT },
        ),
      ],
      { tentId: TENT, plantId: PLANT_A },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.payload.humidity1).toBe(52);
    expect(candidates[0]?.payload.temp1f).toBe(72);
  });
});

describe("post-merge QA — malformed timestamps fail closed (never Live)", () => {
  it.each([
    ["", null],
    ["not-a-date", null],
    ["NaN", null],
    ["2026-13-40T99:99:99.000Z", null],
    ["totally-invalid-iso", null],
    ["2026-08-20T17:50:00.000Z", Date.parse(FRESH_AT)],
  ] as const)("parseEcowittTentSnapshotV0DateUtcMs(%j) → %s", (raw, expectedMs) => {
    const ms = parseEcowittTentSnapshotV0DateUtcMs(raw);
    if (expectedMs === null) {
      expect(ms).toBeNull();
    } else {
      expect(ms).toBe(expectedMs);
    }
  });

  it("rejects non-string garbage (NaN number, null, object)", () => {
    expect(parseEcowittTentSnapshotV0DateUtcMs(Number.NaN)).toBeNull();
    expect(parseEcowittTentSnapshotV0DateUtcMs(null)).toBeNull();
    expect(parseEcowittTentSnapshotV0DateUtcMs({ iso: FRESH_AT })).toBeNull();
    expect(parseEcowittTentSnapshotV0DateUtcMs(1724171400000)).toBeNull();
  });

  it.each([
    ["", ""],
    ["not-a-date", "not-a-date"],
    ["NaN", "NaN"],
    ["2026-13-40T99:99:99.000Z", "totally-invalid-iso"],
  ] as const)(
    "canonical live + garbage dateutc=%j / captured_at=%j is invalid, never Live",
    (dateutc, capturedAt) => {
      const truth = classifyEcowittTentSnapshotV0Source({
        row: row({
          source: "live",
          captured_at: capturedAt,
          raw_payload: { vendor: "ecowitt", dateutc },
        }),
        now: NOW,
      });
      expect(truth).toBe("invalid");
      expect(truth).not.toBe("live");
    },
  );

  it("V0 view-model: garbage timestamps never render as healthy Live", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({
          source: "live",
          metric: "temperature_c",
          value: 24,
          captured_at: "not-a-date",
          raw_payload: { vendor: "ecowitt", dateutc: "" },
        }),
        row({
          source: "live",
          metric: "humidity_pct",
          value: 55,
          captured_at: "NaN",
          raw_payload: { vendor: "ecowitt", dateutc: "not-a-date" },
        }),
      ],
      { tentId: TENT, now: NOW },
    );
    for (const m of vm.metrics) {
      expect(m.badgeLabel).not.toBe("Live");
      expect(m.truthSource).not.toBe("live");
    }
    // Unparseable observation time → row skipped from latest pick → no Live badges.
    expect(vm.metrics.every((m) => m.badgeLabel !== "Live")).toBe(true);
  });
});

describe("post-merge QA — unit ambiguity fail-closed (no C/F mix as healthy Live °C)", () => {
  /**
   * Stored convention is canonical Celsius (temperatureUnitPreference + V0 VM unit °C).
   * Fahrenheit-looking numbers must not present as healthy Live °C without conversion.
   * V0 soil is pct only — no µS/cm / mS/cm / EC / CO2 / VPD product surface here.
   *
   * PRODUCT HOLE (post-merge QA, Testy): `evaluateEcowittTentSnapshotV0Metric`
   * accepts looksLikeF (60–110) as valid, and the view-model surfaces value 77
   * with unit °C + Live. Card then assumes Celsius via convertCelsiusForDisplay.
   * Owner remains Forge for any product fix — Testy does not change rules/VM.
   * `it.fails` keeps the Safe-by-Design proof; suite turns red when the hole closes.
   */
  it.fails(
    "Fahrenheit-looking temperature_c must not present as healthy Live °C without convert",
    () => {
      const evaluation = evaluateEcowittTentSnapshotV0Metric("temp", 77);
      const vm = buildEcowittTentSnapshotV0ViewModel(
        [row({ metric: "temperature_c", value: 77, captured_at: FRESH_AT })],
        { tentId: TENT, now: NOW },
      );
      const temp = vm.metrics.find((m) => m.key === "temp");
      expect(temp?.unit).toBe("°C");

      // Safe-by-Design: either fail closed (invalid / null value) OR convert — never
      // show the raw Fahrenheit-looking number as healthy Live Celsius.
      const presentsFAsHealthyLiveC =
        evaluation.valid === true &&
        temp?.valid === true &&
        temp?.truthSource === "live" &&
        temp?.badgeLabel === "Live" &&
        temp?.value === 77 &&
        temp?.unit === "°C";
      expect(presentsFAsHealthyLiveC).toBe(false);
    },
  );

  it.fails(
    "metric temp_f Fahrenheit value must not surface as Celsius-without-convert Live",
    () => {
      expect(mapEcowittTentSnapshotV0MetricKey("temp_f")).toBe("temp");
      const vm = buildEcowittTentSnapshotV0ViewModel(
        [row({ metric: "temp_f", value: 77, captured_at: FRESH_AT })],
        { tentId: TENT, now: NOW },
      );
      const temp = vm.metrics.find((m) => m.key === "temp");
      const presentsFAsHealthyLiveC =
        temp?.valid === true &&
        temp?.truthSource === "live" &&
        temp?.badgeLabel === "Live" &&
        temp?.value === 77 &&
        temp?.unit === "°C";
      expect(presentsFAsHealthyLiveC).toBe(false);
    },
  );

  it("plausible Celsius temperature_c still tags Live when fresh", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temperature_c", value: 24, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBe(24);
    expect(temp?.unit).toBe("°C");
    expect(temp?.badgeLabel).toBe("Live");
  });
});
