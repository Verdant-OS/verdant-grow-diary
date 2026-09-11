/**
 * EcoWitt tent Snapshot V0 — Sensor Truth tagging + quiet bridge + stuck extremes.
 * Post-merge QA (Testy): malformed timestamps + unit fail-closed.
 * Tent isolation lives in ecowitt-tent-snapshot-v0-isolation.test.ts (V0 VM only).
 */
import { describe, expect, it } from "vitest";
import { AIR_TEMP_C_RANGE } from "@/constants/csvValidationRanges";
import { selectEcowittCandidates } from "@/lib/ecowittLatestSnapshotFilter";
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
  resolveEcowittTentSnapshotV0TempCelsius,
} from "@/lib/ecowittTentSnapshotV0Rules";
import {
  buildEcowittTentSnapshotV0ViewModel,
  ECOWITT_TENT_SNAPSHOT_V0_UNUSED_FIELD_NAMES,
} from "@/lib/ecowittTentSnapshotV0ViewModel";

const NOW = new Date("2026-08-20T18:00:00.000Z");
const FRESH_AT = "2026-08-20T17:50:00.000Z"; // 10 min ago
const STALE_AT = "2026-08-20T16:00:00.000Z"; // 2h ago
/** Far-future vs NOW (>5 min) — classify must fail closed as invalid. */
const FUTURE_AT = "2026-08-20T18:20:00.000Z"; // 20 min ahead of NOW
/** Just over the exclusive 5-minute future grace (ageMs < -5min → invalid). */
const FUTURE_JUST_OVER_AT = "2026-08-20T18:05:01.000Z";
const TENT = "11111111-1111-4111-8111-111111111111";

function row(
  overrides: Partial<{
    source: string | null;
    captured_at: string | null;
    metric: string;
    value: number;
    raw_payload: unknown;
  }> = {},
) {
  const capturedAt = overrides.captured_at === undefined ? FRESH_AT : overrides.captured_at;
  return {
    tent_id: TENT,
    source: overrides.source ?? "live",
    captured_at: capturedAt,
    metric: overrides.metric ?? "temperature_c",
    value: overrides.value ?? 24,
    raw_payload:
      overrides.raw_payload ??
      ({
        vendor: "ecowitt",
        dateutc: typeof capturedAt === "string" ? capturedAt : undefined,
      } as Record<string, unknown>),
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
    expect(mapEcowittTentSnapshotV0MetricKey("temp1f")).toBeNull();
    // V0 soil is pct only — refuse EC / µS / mS keys (no invented conversion).
    expect(mapEcowittTentSnapshotV0MetricKey("ec_us")).toBeNull();
    expect(mapEcowittTentSnapshotV0MetricKey("us_cm")).toBeNull();
    expect(mapEcowittTentSnapshotV0MetricKey("ms_cm")).toBeNull();
    expect(mapEcowittTentSnapshotV0MetricKey("soil_ec")).toBeNull();
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
  it("Fahrenheit-looking temperature_c must not present as healthy Live °C without convert", () => {
    const evaluation = evaluateEcowittTentSnapshotV0Metric("temp", 77);
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temperature_c", value: 77, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.unit).toBe("°C");
    const presentsFAsHealthyLiveC =
      evaluation.valid === true &&
      temp?.valid === true &&
      temp?.truthSource === "live" &&
      temp?.badgeLabel === "Live" &&
      temp?.value === 77 &&
      temp?.unit === "°C";
    expect(presentsFAsHealthyLiveC).toBe(false);
    expect(evaluation.valid).toBe(false);
    expect(temp?.truthSource).toBe("invalid");
    expect(temp?.badgeLabel).toBe("Invalid");
    expect(temp?.value).toBeNull();
  });

  it("metric temp_f Fahrenheit value must not surface as Celsius-without-convert Live", () => {
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
    expect(temp?.value).toBeCloseTo(25, 5);
    expect(temp?.unit).toBe("°C");
    expect(temp?.badgeLabel).toBe("Live");
  });

  it("rejects Fahrenheit-looking temp_c and temp keys as invalid (no silent F reinterpret)", () => {
    for (const metric of ["temp_c", "temp"] as const) {
      const resolved = resolveEcowittTentSnapshotV0TempCelsius(metric, 77);
      expect(resolved.fromFahrenheit).toBe(false);
      expect(resolved.celsius).toBe(77);
      const vm = buildEcowittTentSnapshotV0ViewModel(
        [row({ metric, value: 77, captured_at: FRESH_AT })],
        { tentId: TENT, now: NOW },
      );
      const temp = vm.metrics.find((m) => m.key === "temp");
      expect(temp?.truthSource).toBe("invalid");
      expect(temp?.value).toBeNull();
    }
  });

  it("converts temp_f before sparkline and excludes implausible converted F", () => {
    const historyAt = "2026-08-20T12:00:00.000Z";
    const implausibleAt = "2026-08-20T12:30:00.000Z";
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({ metric: "temp_f", value: 77, captured_at: FRESH_AT }),
        row({ metric: "temp_f", value: 77, captured_at: historyAt }),
        row({ metric: "temp_f", value: 212, captured_at: implausibleAt }),
      ],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBeCloseTo(25, 5);
    expect(temp?.sparkline.length).toBe(2);
    for (const point of temp?.sparkline ?? []) {
      expect(point.value).toBeCloseTo(25, 5);
      expect(point.value).not.toBe(77);
      expect(point.value).not.toBe(212);
    }
  });

  it("keeps plausible Celsius temperature_c as Live at AIR_TEMP_C_RANGE bounds", () => {
    expect(evaluateEcowittTentSnapshotV0Metric("temp", AIR_TEMP_C_RANGE.min).valid).toBe(true);
    expect(evaluateEcowittTentSnapshotV0Metric("temp", AIR_TEMP_C_RANGE.max).valid).toBe(true);
    expect(evaluateEcowittTentSnapshotV0Metric("temp", AIR_TEMP_C_RANGE.max + 0.1).valid).toBe(
      false,
    );
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temperature_c", value: 24, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBe(24);
    expect(temp?.badgeLabel).toBe("Live");
  });

  it("refuses temp1f as a V0 metric key (null map)", () => {
    expect(mapEcowittTentSnapshotV0MetricKey("temp1f")).toBeNull();
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

describe("post-merge QA — malformed / null / future timestamps fail closed (never Live)", () => {
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
    "canonical live + garbage dateutc=%j / captured_at=%j → invalid (observedMs null)",
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

  it("canonical live + null captured_at and missing dateutc → invalid (observedMs null)", () => {
    const truth = classifyEcowittTentSnapshotV0Source({
      row: row({
        source: "live",
        captured_at: null,
        raw_payload: { vendor: "ecowitt" },
      }),
      now: NOW,
    });
    expect(truth).toBe("invalid");
    expect(truth).not.toBe("live");
  });

  it("canonical live + null captured_at and garbage dateutc → invalid (observedMs null)", () => {
    const truth = classifyEcowittTentSnapshotV0Source({
      row: row({
        source: "live",
        captured_at: null,
        raw_payload: { vendor: "ecowitt", dateutc: "not-a-date" },
      }),
      now: NOW,
    });
    expect(truth).toBe("invalid");
    expect(truth).not.toBe("live");
  });

  it("canonical live + Number.NaN clocks → invalid, never live", () => {
    const truth = classifyEcowittTentSnapshotV0Source({
      row: {
        tent_id: TENT,
        source: "live",
        captured_at: Number.NaN as unknown as string,
        raw_payload: { vendor: "ecowitt", dateutc: Number.NaN },
      },
      now: NOW,
    });
    expect(truth).toBe("invalid");
    expect(truth).not.toBe("live");
  });

  it("canonical live + far-future timestamp (>5 min ahead) → invalid, never live", () => {
    const truth = classifyEcowittTentSnapshotV0Source({
      row: row({
        source: "live",
        captured_at: FUTURE_AT,
        raw_payload: { vendor: "ecowitt", dateutc: FUTURE_AT },
      }),
      now: NOW,
    });
    expect(truth).toBe("invalid");
    expect(truth).not.toBe("live");
    expect(truth).not.toBe("stale");
  });

  it("canonical live + just-over-5min future dateutc → invalid, never live", () => {
    const truth = classifyEcowittTentSnapshotV0Source({
      row: row({
        source: "live",
        captured_at: FUTURE_JUST_OVER_AT,
        raw_payload: { vendor: "ecowitt", dateutc: FUTURE_JUST_OVER_AT },
      }),
      now: NOW,
    });
    expect(truth).toBe("invalid");
    expect(truth).not.toBe("live");
  });

  it("V0 view-model: garbage / null timestamps never render as healthy Live", () => {
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
          captured_at: null,
          raw_payload: { vendor: "ecowitt", dateutc: "NaN" },
        }),
        row({
          source: "live",
          metric: "soil_moisture_pct",
          value: 40,
          captured_at: FUTURE_AT,
          raw_payload: { vendor: "ecowitt", dateutc: FUTURE_AT },
        }),
      ],
      { tentId: TENT, now: NOW },
    );
    for (const m of vm.metrics) {
      expect(m.badgeLabel).not.toBe("Live");
      expect(m.truthSource).not.toBe("live");
    }
  });
});

describe("post-merge QA — unit ambiguity (V0 temperature_c displayed as-is)", () => {
  /**
   * V0 maps temperature_c / temp_f → temp and displays the number with unit °C.
   * No µS/cm / mS/cm / EC / VPD product surface in V0 — do not invent.
   *
   * #1183 fail-closed/convert: Fahrenheit-looking temperature_c is invalid;
   * temp_f converts to °C. The two unit-ambiguity pins are live (not it.fails).
   */
  it("Fahrenheit-looking temperature_c must not present as healthy Live °C without convert", () => {
      const evaluation = evaluateEcowittTentSnapshotV0Metric("temp", 77);
      const vm = buildEcowittTentSnapshotV0ViewModel(
        [row({ metric: "temperature_c", value: 77, captured_at: FRESH_AT })],
        { tentId: TENT, now: NOW },
      );
      const temp = vm.metrics.find((m) => m.key === "temp");
      expect(temp?.unit).toBe("°C");

      // Safe-by-Design: fail closed or convert — never raw F-looking number as Live °C.
      const presentsFAsHealthyLiveC =
        evaluation.valid === true &&
        temp?.valid === true &&
        temp?.truthSource === "live" &&
        temp?.badgeLabel === "Live" &&
        temp?.value === 77 &&
        temp?.unit === "°C";
      expect(presentsFAsHealthyLiveC).toBe(false);
  });

  it("metric temp_f Fahrenheit value must not surface as Celsius-without-convert Live", () => {
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
  });

  it("temp1f is not a V0 metric key (refused — no silent °C promotion)", () => {
    expect(mapEcowittTentSnapshotV0MetricKey("temp1f")).toBeNull();
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temp1f", value: 77, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBeNull();
    expect(temp?.badgeLabel).not.toBe("Live");
  });

  it("raw_payload temp1f does not replace stored temperature_c as the V0 °C display", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        row({
          metric: "temperature_c",
          value: 24,
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, dateutc: FRESH_AT },
        }),
      ],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBe(24);
    expect(temp?.value).not.toBe(77);
    expect(temp?.unit).toBe("°C");
    expect(temp?.unit).not.toBe("°F");
  });

  it("soil moisture stays pct — V0 has no µS/cm or mS/cm surface", () => {
    expect(mapEcowittTentSnapshotV0MetricKey("us_cm")).toBeNull();
    expect(mapEcowittTentSnapshotV0MetricKey("ms_cm")).toBeNull();
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "soil_moisture_pct", value: 40, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const soil = vm.metrics.find((m) => m.key === "soil");
    expect(soil?.value).toBe(40);
    expect(soil?.unit).toBe("%");
    expect(soil?.unit.toLowerCase()).not.toMatch(/µs|us\/cm|ms\/cm|ms_cm/);
  });

  it("Celsius temperature_c is displayed as-is in °C, not converted to Fahrenheit", () => {
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [row({ metric: "temperature_c", value: 24, captured_at: FRESH_AT })],
      { tentId: TENT, now: NOW },
    );
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp?.value).toBe(24);
    expect(temp?.unit).toBe("°C");
    expect(temp?.unit).not.toBe("°F");
    // 24°C in Fahrenheit is 75.2 — V0 must not silently convert.
    expect(temp?.value).not.toBe(75.2);
  });

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
