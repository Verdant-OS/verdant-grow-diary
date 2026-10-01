import { describe, expect, it } from "vitest";
import {
  resolveGuidedChecklistReadState,
  selectGuidedChecklistEvidence,
} from "@/lib/guidedChecklistEvidenceRules";
import { isGuidedChecklistReadingFresh } from "@/lib/guidedActionChecklistRules";
import type { SensorReadingMetric } from "@/lib/sensorReadingRangeValidation";
import type { CanonicalMetric } from "@/lib/sensorWebhookIngestRules";
const now = Date.parse("2026-09-23T12:00:00Z");
const at = (age: number) => new Date(now - age).toISOString();
const manual = {
  id: "d1",
  grow_id: "g1",
  tent_id: "t1",
  entry_at: at(3_600_000),
  details: { manual_sensor_snapshot: { source: "manual", temp_f: 77 } },
};
const row = {
  tent_id: "t1",
  source: "live",
  quality: "ok",
  metric: "temperature_c",
  value: 25,
  captured_at: at(60_000),
};
const input = { now, growId: "g1", tentIds: ["t1"], readings: [], diaryEntries: [manual] };

describe("guided evidence scope and provenance", () => {
  it("rejects recent live humidity 999 despite quality ok", () => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [],
      readings: [{ ...row, metric: "humidity_pct", value: 999 }],
    }).t1;
    expect(result).toBeNull();
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(false);
  });
  it.each([{ ph: 6.2 }, { ec: 1.2 }, { ph: 6.2, ec: 1.2 }])(
    "counts usable root-zone-only manual evidence without projecting air metrics: %j",
    (metrics) => {
      const result = selectGuidedChecklistEvidence({
        ...input,
        diaryEntries: [
          { ...manual, details: { manual_sensor_snapshot: { source: "manual", ...metrics } } },
        ],
      }).t1;
      expect(result).toEqual({ capturedAt: manual.entry_at, source: "manual", quality: "ok" });
      expect(isGuidedChecklistReadingFresh(result, now)).toBe(true);
    },
  );
  it.each([{ ph: 3 }, { ph: 9 }, { ec: 0 }, { ec: 8 }])(
    "uses the canonical root-zone presentation boundary: %j",
    (metrics) => {
      expect(
        selectGuidedChecklistEvidence({
          ...input,
          diaryEntries: [
            { ...manual, details: { manual_sensor_snapshot: { source: "manual", ...metrics } } },
          ],
        }).t1?.source,
      ).toBe("manual");
    },
  );
  it.each([
    { ph: null },
    { ph: "6.2" },
    { ph: NaN },
    { ph: Infinity },
    { ph: 2.99 },
    { ph: 9.01 },
    { ec: "1.2" },
    { ec: NaN },
    { ec: Infinity },
    { ec: -0.01 },
    { ec: 8.001 },
    { ec: 12 },
    { ec: 19.999 },
    { ec: 20 },
    { ec: 1200 },
    { ph: 2.99, ec: 12 },
  ])("does not count invalid or suspicious root-zone-only evidence: %j", (metrics) => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        diaryEntries: [
          { ...manual, details: { manual_sensor_snapshot: { source: "manual", ...metrics } } },
        ],
      }).t1,
    ).toBeNull();
  });
  it.each([
    { ph: 6.2, ec: 12 },
    { ph: 2.99, ec: 8 },
  ])("keeps fresh manual evidence when one root-zone metric is valid: %j", (metrics) => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [
        { ...manual, details: { manual_sensor_snapshot: { source: "manual", ...metrics } } },
      ],
    }).t1;
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(true);
  });
  it.each(["live", "csv", "unknown"])("never promotes a %s root-zone diary payload", (source) => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        diaryEntries: [{ ...manual, details: { manual_sensor_snapshot: { source, ph: 6.2 } } }],
      }).t1,
    ).toBeNull();
  });
  it.each([null, "invalid"])(
    "requires an observation time for root-zone evidence: %s",
    (entryAt) => {
      expect(
        selectGuidedChecklistEvidence({
          ...input,
          diaryEntries: [
            {
              ...manual,
              entry_at: entryAt,
              details: { manual_sensor_snapshot: { source: "manual", ph: 6.2 } },
            },
          ],
        }).t1,
      ).toBeNull();
    },
  );
  it("keeps the manual observation window and deterministic survivor preference for root-zone evidence", () => {
    const diary = Object.freeze({
      ...manual,
      details: Object.freeze({
        manual_sensor_snapshot: Object.freeze({ source: "manual", ph: 6.2 }),
      }),
    });
    const args = { ...input, readings: [{ ...row, quality: "degraded" }], diaryEntries: [diary] };
    const result = selectGuidedChecklistEvidence(args);
    expect(selectGuidedChecklistEvidence(args)).toEqual(result);
    expect(result.t1?.source).toBe("manual");
    expect(isGuidedChecklistReadingFresh(result.t1, now)).toBe(true);
    expect(isGuidedChecklistReadingFresh(result.t1, now + 86_400_000)).toBe(false);
  });
  it.each([{ grow_id: "other" }, { tent_id: "other" }, { tent_id: null }, { retracted_at: at(0) }])(
    "ignores diary evidence outside the selected scope or retracted: %j",
    (change) => {
      expect(
        selectGuidedChecklistEvidence({ ...input, diaryEntries: [{ ...manual, ...change }] }).t1,
      ).toBeNull();
    },
  );
  it.each([null, undefined])("handles absent arrays %j", (absent) => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        readings: absent,
        diaryEntries: absent,
        tentIds: absent,
      }),
    ).toEqual({});
  });
  it("ignores malformed records and empty or invalid manual payloads", () => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        diaryEntries: [
          null,
          [],
          1,
          { ...manual, details: {} },
          { ...manual, details: { manual_sensor_snapshot: { source: "manual", temp_f: "77" } } },
        ],
      }).t1,
    ).toBeNull();
  });
  it("does not accept manual payloads claiming live provenance", () => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        diaryEntries: [
          { ...manual, details: { manual_sensor_snapshot: { source: "live", temp_f: 77 } } },
        ],
      }).t1,
    ).toBeNull();
  });
  it("keeps generic snapshots as diary evidence, never fresh telemetry", () => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [{ ...manual, details: { sensor_snapshot: { temp: 25, rh: 55 } } }],
    }).t1;
    expect(result?.source).toBe("diary");
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(false);
  });
  it.each([
    { source: "demo" },
    { source: "constructor" },
    { source: "home_assistant" },
    { quality: "invalid" },
    { quality: "degraded" },
    { quality: "stale" },
    { quality: "unknown" },
    { raw_payload: { vendor: "ecowitt_windows_testbench" } },
    { value: null },
    { value: "" },
    { value: Infinity },
    { metric: "humidity_pct", value: 999 },
    { metric: "humidity_pct", value: 0 },
    { metric: "humidity_pct", value: 100 },
    { metric: "soil_moisture_pct", value: 0 },
    { metric: "soil_moisture_pct", value: 100 },
    { metric: "ec", value: 8.001 },
    { metric: "soil_ec_mscm", value: 8.001 },
    { metric: "reservoir_ec_mscm", value: 5.001 },
    { metric: "unknown_metric" },
    { metric: "constructor" },
    { tent_id: "other" },
  ])("cannot hide usable manual evidence with a newer unusable row: %j", (change) => {
    expect(
      selectGuidedChecklistEvidence({ ...input, readings: [{ ...row, ...change }] }).t1?.source,
    ).toBe("manual");
  });
  it("never substitutes import/creation time for missing observation time", () => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [],
      readings: [{ ...row, captured_at: null, created_at: at(0) }],
    }).t1;
    expect(result?.capturedAt).toBeNull();
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(false);
  });
  it("keeps bad captured_at invalid even when ts is recent", () => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [],
      readings: [{ ...row, captured_at: "invalid", ts: at(0) }],
    }).t1;
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(false);
  });
  it("is deterministic without mutating inputs, including ties and reversed order", () => {
    const rows = Object.freeze([Object.freeze({ ...row, source: "manual" }), Object.freeze(row)]);
    const first = selectGuidedChecklistEvidence({ ...input, readings: rows });
    expect(selectGuidedChecklistEvidence({ ...input, readings: rows })).toEqual(first);
    expect(selectGuidedChecklistEvidence({ ...input, readings: [...rows].reverse() })).toEqual(
      first,
    );
    expect(first.t1?.source).toBe("live");
  });
  it("never uses another grow without an active grow", () => {
    expect(selectGuidedChecklistEvidence({ ...input, growId: null }).t1).toBeNull();
  });
});

describe("telemetry metric validity", () => {
  const telemetry = (change: Record<string, unknown>) =>
    selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [],
      readings: [{ ...row, ...change }],
    }).t1;

  it.each(["soil_ec_mscm", "reservoir_ec_mscm"])(
    "persisted EC regression: accepts a valid %s reading",
    (metric) => {
      expect(telemetry({ metric, value: 1.2 })).toEqual({
        capturedAt: row.captured_at,
        source: "live",
        quality: "ok",
      });
    },
  );

  // Exhaustive over the persisted/manual and webhook contracts, plus existing compatibility names.
  const supportedReadings = {
    temperature_c: 25,
    humidity_pct: 55,
    vpd_kpa: 1.2,
    co2_ppm: 450,
    soil_moisture_pct: 45,
    soil_temp_c: 20,
    soil_ec_mscm: 1.2,
    reservoir_ph: 6.2,
    reservoir_ec_mscm: 1.2,
    ppfd: 500,
    ph: 6.2,
    ec: 1.2,
    soil_ec: 1.2,
    soil_ec_ms_cm: 1.2,
  } satisfies Record<SensorReadingMetric | CanonicalMetric | "soil_ec" | "soil_ec_ms_cm", number>;
  it.each(Object.entries(supportedReadings))(
    "admits the supported persisted/webhook/compatibility metric %s",
    (metric, value) => {
      expect(telemetry({ metric, value })).toEqual({
        capturedAt: row.captured_at,
        source: "live",
        quality: "ok",
      });
    },
  );
  it.each(
    ["soil_ec_mscm", "reservoir_ec_mscm"].flatMap((metric) =>
      [null, undefined, "", " ", NaN, Infinity, "Infinity", true, {}, 100, 1200, "1200"].map(
        (value) => ({ metric, value }),
      ),
    ),
  )("rejects invalid persisted EC without conversion: $metric=$value", (change) => {
    expect(telemetry(change)).toBeNull();
  });

  it.each(
    ["humidity_pct", "soil_moisture_pct"].flatMap((metric) =>
      [0, 100, "0", "100"].map((value) => ({ metric, value })),
    ),
  )("review regression: rejects stuck $metric=$value as evidence", (change) => {
    expect(telemetry(change)).toBeNull();
  });
  it.each([0, 1.2, 8, "1.2"])("review regression: accepts canonical ec=%s", (value) => {
    const result = telemetry({ metric: "ec", value });
    expect(result).toEqual({ capturedAt: row.captured_at, source: "live", quality: "ok" });
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(true);
  });
  it.each([-0.001, 8.001, 1200, "1200"])("review regression: rejects invalid ec=%s", (value) => {
    expect(telemetry({ metric: "ec", value })).toBeNull();
  });

  const bounds = [
    ["temperature_c", ((40 - 32) * 5) / 9, ((110 - 32) * 5) / 9],
    ["vpd_kpa", 0.2, 3],
    ["co2_ppm", 0, 10_000],
    ["ec", 0, 8],
    ["soil_ec_mscm", 0, 8],
    ["reservoir_ec_mscm", 0, 5],
    ["soil_ec_ms_cm", 0, 8],
    ["soil_ec", 0, 8],
    ["soil_temp_c", ((35 - 32) * 5) / 9, ((100 - 32) * 5) / 9],
    ["reservoir_ph", 3, 9],
    ["ph", 3, 9],
    ["ppfd", 0, 2500],
  ] as const;
  it.each(
    bounds.flatMap(([metric, min, max]) => [
      { metric, value: min, valid: true },
      { metric, value: max, valid: true },
      { metric, value: min - 0.001, valid: false },
      { metric, value: max + 0.001, valid: false },
    ]),
  )("applies canonical bounds to $metric=$value (valid=$valid)", ({ metric, value, valid }) => {
    const result = telemetry({ metric, value });
    expect(result).toEqual(
      valid ? { capturedAt: row.captured_at, source: "live", quality: "ok" } : null,
    );
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(valid);
  });

  it.each(
    ["humidity_pct", "soil_moisture_pct"].flatMap((metric) =>
      [
        { value: -0.001, valid: false },
        { value: 0, valid: false },
        { value: 0.001, valid: true },
        { value: 99.999, valid: true },
        { value: 100, valid: false },
        { value: 100.001, valid: false },
      ].map((test) => ({ metric, ...test })),
    ),
  )("excludes stuck percentage bounds for $metric=$value", ({ metric, value, valid }) => {
    expect(telemetry({ metric, value })).toEqual(
      valid ? { capturedAt: row.captured_at, source: "live", quality: "ok" } : null,
    );
  });

  it.each([
    "unknown_metric",
    "temperature",
    "temperature_f",
    "temp_f",
    "humidity_percent",
    "air_temp_c",
    "ec_ms_cm",
    "substrate_temperature",
    "humidity",
    "constructor",
    "__proto__",
    "toString",
    " humidity_pct ",
    "HUMIDITY_PCT",
    "",
    " ",
    null,
    undefined,
    1,
    {},
  ])("rejects an unrecognized metric even with a plausible value: %j", (metric) => {
    expect(telemetry({ metric, value: 25 })).toBeNull();
  });

  it.each([
    null,
    undefined,
    "",
    " ",
    "not-a-number",
    "Infinity",
    "NaN",
    NaN,
    Infinity,
    -Infinity,
    true,
    false,
    [],
    {},
  ])("rejects missing or nonnumeric humidity: %j", (value) => {
    expect(telemetry({ metric: "humidity_pct", value })).toBeNull();
  });
  it.each(["999", "-0.001", "100.001", "0", "100"])(
    "validates parsed numeric strings: %s",
    (value) => {
      expect(telemetry({ metric: "humidity_pct", value })).toBeNull();
    },
  );
  it.each(["0.001", " 55 ", "99.999"])("preserves valid numeric-string evidence: %s", (value) => {
    expect(telemetry({ metric: "humidity_pct", value })).toEqual({
      capturedAt: row.captured_at,
      source: "live",
      quality: "ok",
    });
  });

  it.each([
    ["live", "live", true],
    ["pi_bridge", "live", true],
    ["manual", "manual", true],
    ["csv", "csv", false],
  ] as const)("preserves the %s source and freshness policy", (source, expectedSource, fresh) => {
    const result = telemetry({ source, metric: "humidity_pct", value: 55 });
    expect(result).toEqual({ capturedAt: row.captured_at, source: expectedSource, quality: "ok" });
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(fresh);
    expect(telemetry({ source, metric: "humidity_pct", value: 999 })).toBeNull();
  });

  it.each([
    { metric: "humidity_pct", value: 999 },
    { metric: "humidity_pct", value: 0 },
    { metric: "humidity_pct", value: 100 },
    { metric: "soil_moisture_pct", value: 0 },
    { metric: "soil_moisture_pct", value: 100 },
    { metric: "ec", value: 8.001 },
    { metric: "soil_ec_mscm", value: 8.001 },
    { metric: "reservoir_ec_mscm", value: 5.001 },
    { metric: "unknown_metric", value: 25 },
  ])("keeps the valid telemetry survivor regardless of row order: %j", (invalidMetric) => {
    const valid = Object.freeze({ ...row, captured_at: at(120_000) });
    const invalid = Object.freeze({ ...row, ...invalidMetric });
    const args = { ...input, diaryEntries: [], readings: Object.freeze([valid, invalid]) };
    const result = selectGuidedChecklistEvidence(args);
    expect(result.t1).toEqual({ capturedAt: valid.captured_at, source: "live", quality: "ok" });
    expect(isGuidedChecklistReadingFresh(result.t1, now)).toBe(true);
    expect(selectGuidedChecklistEvidence(args)).toEqual(result);
    expect(selectGuidedChecklistEvidence({ ...args, readings: [invalid, valid] })).toEqual(result);
  });
  it.each(["ec", "soil_ec_mscm", "reservoir_ec_mscm"])(
    "preserves valid %s as the survivor of newer stuck percentages",
    (metric) => {
      const ec = { ...row, metric, value: 1.2, captured_at: at(120_000) };
      const readings = [
        { ...row, metric: "humidity_pct", value: 100 },
        { ...row, metric: "soil_moisture_pct", value: 0 },
        ec,
      ];
      const args = { ...input, diaryEntries: [], readings };
      const result = selectGuidedChecklistEvidence(args);
      expect(result.t1).toEqual({ capturedAt: ec.captured_at, source: "live", quality: "ok" });
      expect(selectGuidedChecklistEvidence({ ...args, readings: [...readings].reverse() })).toEqual(
        result,
      );
    },
  );
});

describe("source-specific freshness", () => {
  it.each([
    ["manual", 86_400_000, true],
    ["manual", 86_400_001, false],
    ["live", 900_000, true],
    ["live", 900_001, false],
    ["live", -1, false],
    ["manual", -1, false],
    ["csv", 0, false],
    ["diary", 0, false],
  ] as const)("%s at %i ms old => %s", (source, age, expected) => {
    expect(isGuidedChecklistReadingFresh({ source, capturedAt: at(age), quality: "ok" }, now)).toBe(
      expected,
    );
  });
  it("rejects invalid clocks and missing observations", () => {
    expect(isGuidedChecklistReadingFresh({ source: "manual", capturedAt: at(0) }, NaN)).toBe(false);
    expect(isGuidedChecklistReadingFresh({ source: "live", capturedAt: null }, now)).toBe(false);
  });
});

describe("completed read gate", () => {
  it("requires completed alerts even if all query arrays exist", () => {
    expect(resolveGuidedChecklistReadState([{ data: [] }], "idle")).toBe("pending");
  });
  it("holds cached results while refreshing", () => {
    expect(resolveGuidedChecklistReadState([{ data: [], isFetching: true }], "ok")).toBe("pending");
  });
  it("does not interpret null as completed empty", () => {
    expect(resolveGuidedChecklistReadState([{ data: null }], "ok")).toBe("error");
  });
  it("accepts successfully completed empty reads", () => {
    expect(resolveGuidedChecklistReadState([{ data: [] }], "ok")).toBe("ready");
  });
});
