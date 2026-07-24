import { describe, it, expect } from "vitest";
import {
  selectEcowittCandidates,
  buildEcowittLatestSnapshot,
  type EcowittSensorReadingRow,
} from "@/lib/ecowittLatestSnapshotFilter";

const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z";
const NEWER_AT = "2026-06-04T12:25:00Z";
const STALE_AT = "2026-06-04T10:00:00Z";

const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const PLANT_1 = "33333333-3333-3333-3333-333333333333";

function row(
  overrides: Partial<EcowittSensorReadingRow> = {},
  payload: Record<string, unknown> = { temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
): EcowittSensorReadingRow {
  return {
    tent_id: TENT_A,
    plant_id: null,
    source: "ecowitt",
    captured_at: FRESH_AT,
    raw_payload: payload,
    ...overrides,
  };
}

describe("ecowittLatestSnapshotFilter", () => {
  it("returns empty candidates when there are no rows", () => {
    expect(selectEcowittCandidates([], { tentId: TENT_A })).toEqual([]);
  });

  it("filters by tent_id and never bleeds another tent's newer reading in", () => {
    const rows: EcowittSensorReadingRow[] = [
      row(
        { tent_id: TENT_A, captured_at: FRESH_AT },
        { temp1f: 70, humidity1: 50, dateutc: FRESH_AT },
      ),
      row(
        { tent_id: TENT_B, captured_at: NEWER_AT },
        { temp1f: 90, humidity1: 80, dateutc: NEWER_AT },
      ),
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });
    expect(vm.hasReading).toBe(true);
    expect(vm.metrics.humidity_pct).toBe(50);
  });

  it("filters by plant_id when provided", () => {
    const rows: EcowittSensorReadingRow[] = [
      row(
        { plant_id: PLANT_1, captured_at: FRESH_AT },
        { temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
      ),
      row(
        { plant_id: null, captured_at: NEWER_AT },
        { temp1f: 80, humidity1: 60, dateutc: NEWER_AT },
      ),
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A, plantId: PLANT_1 }, { now: NOW });
    expect(vm.metrics.humidity_pct).toBe(55);
  });

  it("renders empty-state when no EcoWitt rows match", () => {
    const rows: EcowittSensorReadingRow[] = [row({ source: "manual", raw_payload: null })];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });
    expect(vm.hasReading).toBe(false);
    expect(vm.emptyStateMessage).toBe(
      "No EcoWitt readings yet. Send a local test payload to verify the integration.",
    );
  });

  it("treats source=ecowitt + fresh as Live and labels Ecowitt", () => {
    const vm = buildEcowittLatestSnapshot([row()], { tentId: TENT_A }, { now: NOW });
    expect(vm.source).toBe("live");
    expect(vm.sourceLabel?.label).toBe("Ecowitt");
  });

  it.each([
    ["live", "live"],
    ["ecowitt", "live"],
    ["manual", "manual"],
    ["csv", "csv"],
    ["demo", "demo"],
    ["stale", "stale"],
    ["invalid", "invalid"],
    [null, "invalid"],
    ["webhook", "invalid"],
    ["mystery", "invalid"],
  ] as const)(
    "resolves persisted source %s to candidate source %s without vendor promotion",
    (source, expectedSource) => {
      const candidates = selectEcowittCandidates(
        [
          row(
            { source },
            {
              vendor: "ecowitt",
              temp1f: 77,
              humidity1: 55,
              dateutc: FRESH_AT,
            },
          ),
        ],
        { tentId: TENT_A },
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.source).toBe(expectedSource);
    },
  );

  it.each([null, "webhook", "invalid"] as const)(
    "fails closed for %s provenance and withholds derived VPD",
    (source) => {
      const vm = buildEcowittLatestSnapshot(
        [
          row(
            { source },
            {
              vendor: "ecowitt",
              temp1f: 77,
              humidity1: 55,
              dateutc: FRESH_AT,
            },
          ),
        ],
        { tentId: TENT_A },
        { now: NOW },
      );

      expect(vm.hasReading).toBe(true);
      expect(vm.source).toBe("invalid");
      expect(vm.sourceLabel?.label).toBe("Invalid");
      expect(vm.invalid).toBe(true);
      expect(vm.unavailableReason).toBe("Reading provenance is missing or unrecognized.");
      expect(vm.derivedVpdKpa).toBeNull();
      expect(vm.metrics.vpd_kpa).toBeUndefined();
    },
  );

  it.each([
    ["csv", "CSV"],
    ["stale", "Stale"],
  ] as const)("keeps %s provenance in the snapshot view-model", (source, label) => {
    const vm = buildEcowittLatestSnapshot(
      [
        row(
          { source },
          {
            vendor: "ecowitt",
            temp1f: 77,
            humidity1: 55,
            dateutc: FRESH_AT,
          },
        ),
      ],
      { tentId: TENT_A },
      { now: NOW },
    );

    expect(vm.source).toBe(source);
    expect(vm.sourceLabel?.label).toBe(label);
    expect(vm.invalid).toBe(false);
    expect(vm.derivedVpdKpa).toBeNull();
    expect(vm.metrics.vpd_kpa).toBeUndefined();
  });

  it("demotes stale listener readings to Stale (never Live)", () => {
    const vm = buildEcowittLatestSnapshot(
      [row({ captured_at: STALE_AT }, { temp1f: 77, humidity1: 55, dateutc: STALE_AT })],
      { tentId: TENT_A },
      { now: NOW },
    );
    expect(vm.sourceLabel?.label).toBe("Stale");
    expect(vm.sourceLabel?.label).not.toBe("Live");
  });

  it("labels manual EcoWitt rows as Manual, never Live", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT_A,
          source: "manual",
          captured_at: FRESH_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
        },
      ],
      { tentId: TENT_A },
      { now: NOW },
    );
    expect(vm.source).toBe("manual");
    expect(vm.sourceLabel?.label).toBe("Manual");
  });

  it("withholds derived VPD from an aged manual snapshot", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT_A,
          source: "manual",
          captured_at: STALE_AT,
          raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: STALE_AT },
        },
      ],
      { tentId: TENT_A },
      { now: NOW },
    );

    expect(vm.source).toBe("manual");
    expect(vm.freshness).toBe("stale");
    expect(vm.derivedVpdKpa).toBeNull();
    expect(vm.metrics.vpd_kpa).toBeUndefined();
  });

  it("recognises EcoWitt lineage via raw_payload.vendor when source label is generic", () => {
    const rows: EcowittSensorReadingRow[] = [
      {
        tent_id: TENT_A,
        source: "webhook",
        captured_at: FRESH_AT,
        raw_payload: { vendor: "ecowitt", temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
      },
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });
    expect(vm.hasReading).toBe(true);
  });

  it("recognises EcoWitt lineage from nested metadata on canonical live rows", () => {
    const rows: EcowittSensorReadingRow[] = [
      {
        tent_id: TENT_A,
        source: "live",
        captured_at: FRESH_AT,
        raw_payload: {
          source: "webhook",
          metrics: { temp_f: 78.6, humidity_pct: 56.2 },
          captured_at: FRESH_AT,
          metadata: { transport_source: "ecowitt" },
        },
      },
    ];
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });
    expect(vm.hasReading).toBe(true);
    expect(vm.sourceLabel?.label).toBe("Ecowitt");
  });

  it("renders persisted sensor-ingest-webhook EcoWitt metric bags as latest snapshots", () => {
    const rows: EcowittSensorReadingRow[] = [
      {
        tent_id: TENT_A,
        source: "live",
        captured_at: FRESH_AT,
        raw_payload: {
          source: "ecowitt",
          vendor: "ecowitt",
          captured_at: FRESH_AT,
          metrics: {
            temp_f: 78.6,
            humidity_pct: 56.2,
            soil_moisture_pct: 45,
            co2_ppm: 966,
            vpd_kpa: 1.46,
          },
          metadata: {
            transport: "mqtt_local_test",
            test_sender: true,
          },
        },
      },
    ];

    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });

    expect(vm.hasReading).toBe(true);
    expect(vm.source).toBe("live");
    expect(vm.sourceLabel?.label).toBe("Ecowitt");
    expect(vm.metrics.temp_f).toBeCloseTo(78.6, 1);
    expect(vm.metrics.humidity_pct).toBe(56.2);
    expect(vm.metrics.soil_moisture_pct).toBe(45);
    expect(vm.metrics.co2_ppm).toBe(966);
    expect(vm.snapshot?.rawPayload).toMatchObject({
      test_sender: true,
      transport: "mqtt_local_test",
      dateutc: FRESH_AT,
    });
  });

  it("does not coerce absent or blank metric-bag values into zero evidence", () => {
    const candidates = selectEcowittCandidates(
      [
        row(
          { source: "live" },
          {
            vendor: "ecowitt",
            captured_at: FRESH_AT,
            metrics: {
              temp_f: null,
              temperature_c: undefined,
              humidity_pct: "",
              soil_moisture_pct: "   ",
              co2_ppm: "950",
            },
          },
        ),
      ],
      { tentId: TENT_A },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.payload).toMatchObject({ co2: 950, dateutc: FRESH_AT });
    expect(candidates[0]?.payload).not.toHaveProperty("temp1f");
    expect(candidates[0]?.payload).not.toHaveProperty("humidity1");
    expect(candidates[0]?.payload).not.toHaveProperty("soilmoisture1");
  });

  it("keeps confidence=test Windows-listener packets visible as Demo, never live", () => {
    const rows: EcowittSensorReadingRow[] = [
      {
        tent_id: TENT_A,
        source: "live",
        captured_at: FRESH_AT,
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          captured_at: FRESH_AT,
          metrics: { temp_f: 78.6, humidity_pct: 56.2 },
          metadata: {
            confidence: "test",
            verdant_source: "live",
          },
        },
      },
    ];

    const candidates = selectEcowittCandidates(rows, { tentId: TENT_A });
    const vm = buildEcowittLatestSnapshot(rows, { tentId: TENT_A }, { now: NOW });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source).toBe("demo");
    expect(vm.hasReading).toBe(true);
    expect(vm.source).toBe("demo");
    expect(vm.sourceLabel?.label).toBe("Demo");
    expect(vm.sourceLabel?.label).not.toBe("Ecowitt");
  });

  it.each(["manual", "csv", "demo", "stale", "invalid"] as const)(
    "applies the testbench provenance fence before canonical source=%s",
    (source) => {
      const rows: EcowittSensorReadingRow[] = [
        row(
          { source },
          {
            vendor: "ecowitt_windows_testbench",
            temp1f: 77,
            humidity1: 55,
            dateutc: FRESH_AT,
            metadata: { confidence: "test" },
          },
        ),
      ];

      expect(selectEcowittCandidates(rows, { tentId: TENT_A })[0]?.source).toBe("demo");
    },
  );

  it("treats the canonical verdant_source=live mirror without physical proof as Demo", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT_A,
          source: "live",
          captured_at: FRESH_AT,
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            captured_at: FRESH_AT,
            metrics: { temp_f: 78.6, humidity_pct: 56.2 },
            metadata: {
              transport: "windows_listener",
              verdant_source: "live",
            },
          },
        },
      ],
      { tentId: TENT_A },
      { now: NOW },
    );

    expect(vm.hasReading).toBe(true);
    expect(vm.source).toBe("demo");
    expect(vm.sourceLabel?.label).toBe("Demo");
  });

  it("allows physical Windows-listener lineage with preserved live source and gateway markers", () => {
    const vm = buildEcowittLatestSnapshot(
      [
        {
          tent_id: TENT_A,
          source: "live",
          captured_at: FRESH_AT,
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            captured_at: FRESH_AT,
            metrics: { temp_f: 78.6, humidity_pct: 56.2 },
            metadata: {
              transport: "windows_listener",
              reported_verdant_source: "live",
              raw_payload: {
                stationtype: "GW2000A_V3.2.4",
                model: "GW2000A",
                dateutc: "2026-06-04 12:20:00",
              },
            },
          },
        },
      ],
      { tentId: TENT_A },
      { now: NOW },
    );

    expect(vm.hasReading).toBe(true);
    expect(vm.source).toBe("live");
    expect(vm.sourceLabel?.label).toBe("Ecowitt");
  });

  it("preserves raw payload on the chosen snapshot", () => {
    const payload = { temp1f: 77, humidity1: 55, dateutc: FRESH_AT };
    const vm = buildEcowittLatestSnapshot([row({}, payload)], { tentId: TENT_A }, { now: NOW });
    expect(vm.snapshot?.rawPayload).toBe(payload);
  });
});
