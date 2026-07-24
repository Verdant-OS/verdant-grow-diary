import { describe, expect, it } from "vitest";

import {
  buildOperatorRootZoneCycleRows,
  OPERATOR_ROOT_ZONE_CYCLE_ARITHMETIC_CAVEAT,
  OPERATOR_ROOT_ZONE_CYCLE_CAP,
  OPERATOR_ROOT_ZONE_FUTURE_TOLERANCE_MS,
  OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT,
  OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_ROW_CAP,
  OPERATOR_ROOT_ZONE_CYCLE_NUTRIENT_CAVEAT,
  OPERATOR_ROOT_ZONE_CYCLE_SCOPE_CAVEAT,
  type OperatorRootZoneCycleInput,
} from "@/lib/operatorRootZoneCycleViewModel";

const PLANT_A = "11111111-1111-4111-8111-111111111111";
const PLANT_B = "22222222-2222-4222-8222-222222222222";
const TENT_ID = "33333333-3333-4333-8333-333333333333";

function eventIdFor(value: string): string {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `44444444-4444-4444-8444-${hash.toString(16).padStart(12, "0")}`;
}

function observation(
  occurredAt: string,
  eventType: "watering" | "feeding" = "watering",
  overrides: Omit<Partial<OperatorRootZoneCycleInput>, "metrics"> & {
    metrics?: Partial<OperatorRootZoneCycleInput["metrics"]>;
  } = {},
): OperatorRootZoneCycleInput {
  const { metrics: metricOverrides, ...rootOverrides } = overrides;
  return {
    occurredAt,
    eventType,
    eventId: eventIdFor(`${occurredAt}:${eventType}`),
    plantId: PLANT_A,
    tentId: TENT_ID,
    source: "manual",
    metrics: {
      schemaVersion: 1,
      volumeMl: 1_000,
      inputPh: 6.1,
      inputEcMsCm: 2,
      outputEcMsCm: null,
      runoffMl: 150,
      runoffPh: 6.3,
      runoffEcMsCm: 2.3,
      waterTempC: 20,
      nutrientLine: null,
      products: [],
      ...metricOverrides,
    },
    ...rootOverrides,
  };
}

function observationWithUntrustedManual(manualObservation: unknown): OperatorRootZoneCycleInput {
  return {
    ...observation("2026-07-19T10:00:00.000Z", "watering"),
    manualObservation,
  } as unknown as OperatorRootZoneCycleInput;
}

describe("operator root-zone cycle view model", () => {
  it("projects bounded grower-recorded manual observations without presenting sensor or dryback evidence", () => {
    const [row] = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "watering", {
        manualObservation: {
          observedAt: "2026-07-19T10:00:00.000Z",
          source: "manual",
          advisoryOnly: true,
          potWeightFeel: "light",
          mediumSurface: "dry",
          drainage: "slow",
        },
      }),
    ]);

    expect(OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_ROW_CAP).toBe(3);
    expect(row.manualObservation).toEqual({
      observedAt: "2026-07-19T10:00:00.000Z",
      sourceLabel: "Manual observation",
      advisoryOnly: true,
      rows: [
        {
          key: "pot_weight_feel",
          label: "Pot/container weight feel",
          valueLabel: "Light",
        },
        { key: "medium_surface", label: "Medium surface", valueLabel: "Dry" },
        { key: "drainage", label: "Drainage", valueLabel: "Slow" },
      ],
      caveat: OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT,
    });
    expect(row.manualObservation?.rows).toHaveLength(OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_ROW_CAP);
    expect(OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT).toMatch(
      /manual observation.*not sensor.*not measured dryback/i,
    );
  });

  it("keeps valid partial categorical evidence and its fixed row order", () => {
    const [row] = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "watering", {
        manualObservation: {
          observedAt: "2026-07-19T10:00:00.000Z",
          source: "manual",
          advisoryOnly: true,
          mediumSurface: "moist",
        },
      }),
    ]);

    expect(row.manualObservation?.rows).toEqual([
      { key: "medium_surface", label: "Medium surface", valueLabel: "Moist" },
    ]);
  });

  it("fails closed on missing or malformed manual-observation envelopes", () => {
    const valid = {
      observedAt: "2026-07-19T10:00:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "moderate",
    };
    const malformed: unknown[] = [
      null,
      [],
      {},
      { ...valid, source: "live" },
      { ...valid, advisoryOnly: false },
      { ...valid, observedAt: "not-a-date" },
      { ...valid, observedAt: "2026-07-19T05:00:00-05:00" },
      { ...valid, potWeightFeel: "guess" },
      { ...valid, drainage: "fast" },
      { ...valid, potWeightFeel: null },
      {
        observedAt: "2026-07-19T10:00:00.000Z",
        source: "manual",
        advisoryOnly: true,
      },
    ];

    for (const manualObservation of malformed) {
      const [row] = buildOperatorRootZoneCycleRows([
        observationWithUntrustedManual(manualObservation),
      ]);
      expect(row).toBeDefined();
      expect(row.manualObservation).toBeNull();
    }
  });

  it("keeps event-id conflict resolution deterministic when manual evidence differs", () => {
    const eventId = "abababab-abab-4bab-8bab-abababababab";
    const manualObservation = (potWeightFeel: "light" | "heavy") => ({
      observedAt: "2026-07-19T10:00:00.000Z",
      source: "manual" as const,
      advisoryOnly: true as const,
      potWeightFeel,
    });
    const light = observation("2026-07-19T10:00:00.000Z", "watering", {
      eventId,
      manualObservation: manualObservation("light"),
    });
    const heavy = observation("2026-07-19T10:00:00.000Z", "watering", {
      eventId,
      manualObservation: manualObservation("heavy"),
    });

    const forward = buildOperatorRootZoneCycleRows([light, heavy]);
    const reversed = buildOperatorRootZoneCycleRows([heavy, light]);

    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(1);
    expect(forward[0].manualObservation).not.toBeNull();
  });

  it("rejects manual-observation evidence attached to a feeding cycle", () => {
    const [row] = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "feeding", {
        manualObservation: {
          observedAt: "2026-07-19T10:00:00.000Z",
          source: "manual",
          advisoryOnly: true,
          potWeightFeel: "light",
        },
      }),
    ]);

    expect(row.manualObservation).toBeNull();
  });

  it("rejects manual-observation evidence on a non-manual parent cycle", () => {
    const [row] = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "watering", {
        source: "csv",
        manualObservation: {
          observedAt: "2026-07-19T10:00:00.000Z",
          source: "manual",
          advisoryOnly: true,
          mediumSurface: "dry",
        },
      }),
    ]);

    expect(row.sourceLabel).toBe("CSV log");
    expect(row.manualObservation).toBeNull();
  });

  it("rejects a manual observation timestamp that differs from its cycle by one millisecond", () => {
    const [row] = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "watering", {
        manualObservation: {
          observedAt: "2026-07-19T10:00:00.001Z",
          source: "manual",
          advisoryOnly: true,
          drainage: "normal",
        },
      }),
    ]);

    expect(row.manualObservation).toBeNull();
  });

  it("shows CRONK feeding evidence, EC/PPM companions, and recorded arithmetic comparisons", () => {
    const previous = observation("2026-07-18T10:00:00.000Z");
    const feeding = observation("2026-07-19T10:00:00.000Z", "feeding", {
      metrics: {
        volumeMl: 1_000,
        inputPh: 6.1,
        inputEcMsCm: 2,
        outputEcMsCm: 2.2,
        runoffMl: 150,
        runoffPh: 6.3,
        runoffEcMsCm: 2.3,
        nutrientLine: "CRONK Bonnie & Clyde",
        products: [
          { name: "Bonnie", amount: 4, unit: "ml_per_l" },
          { name: "Clyde", amount: null, unit: null },
        ],
      },
    });

    const [row] = buildOperatorRootZoneCycleRows([previous, feeding]);

    expect(row).toMatchObject({
      eventType: "feeding",
      eventLabel: "Feeding",
      targetLabel: "Plant ref …11111111",
      sourceLabel: "Manual log",
      nutrientLine: "CRONK Bonnie & Clyde",
      products: [
        { name: "Bonnie", valueLabel: "4 mL/L" },
        { name: "Clyde", valueLabel: null },
      ],
    });
    expect(row.metrics).toEqual(
      expect.arrayContaining([
        {
          key: "input_ec",
          label: "Input EC",
          valueLabel: "2.00 mS/cm · 1000 ppm (500 scale)",
        },
        {
          key: "output_ec",
          label: "Output EC",
          valueLabel: "2.20 mS/cm · 1100 ppm (500 scale)",
        },
        {
          key: "runoff_ec",
          label: "Runoff EC",
          valueLabel: "2.30 mS/cm · 1150 ppm (500 scale)",
        },
      ]),
    );
    expect(row.comparisons).toEqual([
      {
        key: "event_interval",
        label: "Interval from prior record for this plant reference",
        valueLabel: "24 h",
      },
      {
        key: "runoff_share",
        label: "Recorded runoff ÷ applied volume",
        valueLabel: "15%",
      },
      { key: "runoff_ph_delta", label: "Runoff − input pH", valueLabel: "+0.2 pH" },
      { key: "output_ec_delta", label: "Output − input EC", valueLabel: "+0.2 mS/cm" },
      { key: "runoff_ec_delta", label: "Runoff − input EC", valueLabel: "+0.3 mS/cm" },
    ]);
  });

  it("keeps watering and feeding distinct and hides nutrient metadata from watering rows", () => {
    const watering = observation("2026-07-19T10:00:00.000Z", "watering", {
      metrics: {
        nutrientLine: "should not display",
        products: [{ name: "should not display", amount: 1, unit: "mL" }],
      },
    });
    const feeding = observation("2026-07-18T10:00:00.000Z", "feeding", {
      metrics: { nutrientLine: "CRONK", products: [] },
    });

    const rows = buildOperatorRootZoneCycleRows([feeding, watering]);

    expect(rows.map((row) => row.eventLabel)).toEqual(["Watering", "Feeding"]);
    expect(rows[0]).toMatchObject({ nutrientLine: null, products: [] });
    expect(rows[1].nutrientLine).toBe("CRONK");
  });

  it("is bounded, newest-first, deterministic, and uses the next older event for interval context", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      observation(`2026-07-${String(19 - index).padStart(2, "0")}T10:00:00.000Z`, "watering", {
        metrics: { volumeMl: 500 + index },
      }),
    );
    const first = buildOperatorRootZoneCycleRows(rows);
    const shuffled = buildOperatorRootZoneCycleRows([
      rows[5],
      rows[1],
      rows[6],
      rows[0],
      rows[4],
      rows[2],
      rows[3],
    ]);

    expect(first).toEqual(shuffled);
    expect(first).toHaveLength(OPERATOR_ROOT_ZONE_CYCLE_CAP);
    expect(first.map((row) => row.occurredAt)).toEqual(
      rows.slice(0, OPERATOR_ROOT_ZONE_CYCLE_CAP).map((row) => row.occurredAt),
    );
    expect(first.at(-1)?.comparisons[0]).toMatchObject({
      key: "event_interval",
      valueLabel: "24 h",
    });
    expect(buildOperatorRootZoneCycleRows(rows, { cap: 0 })).toEqual([]);
  });

  it("uses a locale-independent complete tie-breaker before the five-row cap", () => {
    const names = ["Éclair", "Zeta", "Ångström", "alpha", "Ωmega", "雪"];
    const sameTime = names.map((name, index) =>
      observation("2026-07-19T10:00:00.000Z", "feeding", {
        eventId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
        metrics: {
          nutrientLine: name,
          products: [{ name, amount: 1, unit: "mL/L" }],
        },
      }),
    );
    const expectedKeys = sameTime
      .map((row) => buildOperatorRootZoneCycleRows([row])[0].key)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, OPERATOR_ROOT_ZONE_CYCLE_CAP);

    const first = buildOperatorRootZoneCycleRows(sameTime);
    const shuffled = buildOperatorRootZoneCycleRows([
      sameTime[5],
      sameTime[2],
      sameTime[0],
      sameTime[4],
      sameTime[1],
      sameTime[3],
    ]);

    expect(first.map((row) => row.key)).toEqual(expectedKeys);
    expect(shuffled).toEqual(first);
  });

  it("keeps identical records for different plants separate and never compares across plants", () => {
    const sameTimeA = observation("2026-07-19T10:00:00.000Z", "watering", {
      eventId: "55555555-5555-4555-8555-555555555555",
      plantId: PLANT_A,
    });
    const sameTimeB = observation("2026-07-19T10:00:00.000Z", "watering", {
      eventId: "66666666-6666-4666-8666-666666666666",
      plantId: PLANT_B,
    });
    const olderA = observation("2026-07-18T10:00:00.000Z", "watering", {
      eventId: "77777777-7777-4777-8777-777777777777",
      plantId: PLANT_A,
    });

    const rows = buildOperatorRootZoneCycleRows([sameTimeB, olderA, sameTimeA]);

    expect(rows).toHaveLength(3);
    const plantARow = rows.find((row) => row.key.includes("55555555-5555-4555-8555-555555555555"));
    const plantBRow = rows.find((row) => row.key.includes("66666666-6666-4666-8666-666666666666"));
    expect(plantARow?.targetLabel).toBe("Plant ref …11111111");
    expect(plantARow?.comparisons).toContainEqual({
      key: "event_interval",
      label: "Interval from prior record for this plant reference",
      valueLabel: "24 h",
    });
    expect(plantBRow?.targetLabel).toBe("Plant ref …22222222");
    expect(plantBRow?.comparisons.some((row) => row.key === "event_interval")).toBe(false);
  });

  it("derives PPM from the same displayed EC and renders the canonical Quick Log dose unit", () => {
    const [row] = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "feeding", {
        metrics: {
          inputEcMsCm: 1.234,
          nutrientLine: "CRONK",
          products: [{ name: "Bonnie", amount: 4, unit: "ml_per_l" }],
        },
      }),
    ]);

    expect(row.metrics).toContainEqual({
      key: "input_ec",
      label: "Input EC",
      valueLabel: "1.23 mS/cm · 615 ppm (500 scale)",
    });
    expect(row.products).toEqual([{ name: "Bonnie", valueLabel: "4 mL/L" }]);
  });

  it("marks future timestamps and excludes them from interval arithmetic", () => {
    const now = Date.parse("2026-07-19T10:00:00.000Z");
    const future = observation("2026-07-19T10:06:00.001Z", "watering", {
      eventId: "88888888-8888-4888-8888-888888888888",
      plantId: PLANT_A,
    });
    const current = observation("2026-07-19T10:00:00.000Z", "watering", {
      eventId: "99999999-9999-4999-8999-999999999999",
      plantId: PLANT_A,
    });

    const rows = buildOperatorRootZoneCycleRows([current, future], { now });

    expect(OPERATOR_ROOT_ZONE_FUTURE_TOLERANCE_MS).toBe(300_000);
    expect(rows[0].warnings).toContain(
      "Timestamp is in the future; verify the recorded time before interpreting this record.",
    );
    expect(rows[0].comparisons.some((row) => row.key === "event_interval")).toBe(false);
    expect(rows[1].comparisons.some((row) => row.key === "event_interval")).toBe(false);
  });

  it("deduplicates exact records and warns when recorded runoff exceeds applied volume", () => {
    const row = observation("2026-07-19T10:00:00.000Z", "watering", {
      metrics: { volumeMl: 500, runoffMl: 750 },
      invalidFields: ["inputPh"],
    });
    const conflictingDuplicate = {
      ...row,
      metrics: { ...row.metrics, volumeMl: 600 },
    };

    const result = buildOperatorRootZoneCycleRows([row, row]);
    const forward = buildOperatorRootZoneCycleRows([row, conflictingDuplicate]);
    const reversed = buildOperatorRootZoneCycleRows([conflictingDuplicate, row]);

    expect(result).toHaveLength(1);
    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(1);
    expect(result[0].warnings).toEqual([
      "Some supplied measurements were rejected.",
      "Recorded runoff exceeds applied volume; verify the entry before interpreting it.",
    ]);
    expect(result[0].comparisons).toContainEqual({
      key: "runoff_share",
      label: "Recorded runoff ÷ applied volume",
      valueLabel: "150%",
    });
  });

  it("distinguishes a rejected manual observation from rejected measurements", () => {
    const [row] = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "watering", {
        invalidFields: ["manualObservation"],
      }),
    ]);

    expect(row.warnings).toContain("A grower-recorded manual observation was rejected.");
    expect(row.warnings).not.toContain("Some supplied measurements were rejected.");
  });

  it("keeps manual, CSV, demo, stale, invalid, and unknown provenance explicit", () => {
    const sources = ["manual", "csv", "demo", "stale", "invalid", "unknown"] as const;
    const rows = buildOperatorRootZoneCycleRows(
      sources.map((source, index) =>
        observation(`2026-07-19T${String(15 - index).padStart(2, "0")}:00:00.000Z`, "watering", {
          source,
        }),
      ),
    );

    expect(rows.map((row) => row.sourceLabel)).toEqual([
      "Manual log",
      "CSV log",
      "Demo log",
      "Stale source",
      "Invalid source",
    ]);
    expect(rows.every((row) => row.sourceLabel !== "Live")).toBe(true);
    expect(
      buildOperatorRootZoneCycleRows([
        observation("2026-07-19T10:00:00.000Z", "watering", {
          source: "unknown",
        }),
      ])[0].sourceLabel,
    ).toBe("Source unavailable");
  });

  it("fails closed on malformed, invalid, non-finite, and unsupported records", () => {
    const malformed = [
      null,
      {},
      { occurredAt: "not-a-date", eventType: "watering" },
      observation("2026-07-19T10:00:00.000Z", "watering", {
        metrics: { schemaVersion: 2 as 1 },
      }),
      observation("2026-07-19T11:00:00.000Z", "watering", {
        metrics: {
          volumeMl: Number.NaN,
          inputPh: null,
          inputEcMsCm: null,
          runoffMl: null,
          runoffPh: null,
          runoffEcMsCm: null,
          waterTempC: null,
        },
      }),
      { ...observation("2026-07-19T12:00:00.000Z"), eventType: "spray" },
    ] as unknown as OperatorRootZoneCycleInput[];

    expect(() => buildOperatorRootZoneCycleRows(malformed)).not.toThrow();
    expect(buildOperatorRootZoneCycleRows(malformed)).toEqual([]);
    expect(buildOperatorRootZoneCycleRows(null)).toEqual([]);
  });

  it("keeps all generated copy inside the read-only grower-decision fence", () => {
    const row = buildOperatorRootZoneCycleRows([
      observation("2026-07-19T10:00:00.000Z", "feeding", {
        metrics: { nutrientLine: "CRONK", products: [] },
      }),
    ])[0];
    const copy = [
      ...row.metrics.flatMap((metric) => [metric.label, metric.valueLabel]),
      ...row.comparisons.flatMap((comparison) => [comparison.label, comparison.valueLabel]),
      ...row.warnings,
      OPERATOR_ROOT_ZONE_CYCLE_ARITHMETIC_CAVEAT,
      OPERATOR_ROOT_ZONE_CYCLE_NUTRIENT_CAVEAT,
      OPERATOR_ROOT_ZONE_CYCLE_SCOPE_CAVEAT,
      OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT,
    ].join(" ");

    expect(copy).not.toMatch(
      /water now|skip watering|ready to water|watering schedule|target volume|increase (?:the )?volume|decrease (?:the )?volume|change nutrients|diagnos|chart adherence|action queue|automat|device command|automatic watering/i,
    );
    expect(OPERATOR_ROOT_ZONE_CYCLE_ARITHMETIC_CAVEAT).toContain("not watering targets");
    expect(OPERATOR_ROOT_ZONE_CYCLE_NUTRIENT_CAVEAT).toContain("not verification");
    expect(OPERATOR_ROOT_ZONE_CYCLE_SCOPE_CAVEAT).toContain("same plant reference");
    expect(OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT).toMatch(
      /manual observation.*not sensor.*not measured dryback/i,
    );
  });
});
