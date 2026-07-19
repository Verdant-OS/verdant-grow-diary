import { describe, expect, it } from "vitest";
import {
  ROOT_ZONE_OBSERVATION_CAP,
  ROOT_ZONE_PRODUCT_CAP,
  buildRootZoneDiaryDetails,
  buildRootZoneObservationFromGrowEvent,
  buildRootZoneObservationsFromRows,
  normalizeRootZoneMetricsV1,
  sortAndBoundRootZoneObservations,
  type RootZoneGrowEventRowLike,
  type RootZoneObservationV1,
  type RootZoneSource,
} from "@/lib/rootZoneObservationRules";

const metrics = (
  volumeMl: number,
  overrides: Partial<RootZoneObservationV1["metrics"]> = {},
): RootZoneObservationV1["metrics"] => ({
  schemaVersion: 1,
  volumeMl,
  inputPh: null,
  inputEcMsCm: null,
  outputEcMsCm: null,
  runoffMl: null,
  runoffPh: null,
  runoffEcMsCm: null,
  waterTempC: null,
  nutrientLine: null,
  products: [],
  ...overrides,
});

const observation = (
  occurredAt: string,
  eventType: RootZoneObservationV1["eventType"],
  volumeMl: number,
  source: RootZoneSource = "manual",
): RootZoneObservationV1 => ({
  occurredAt,
  eventType,
  source,
  metrics: metrics(volumeMl),
});

describe("root-zone grow-event normalization", () => {
  it("normalizes an object-shaped watering relation with the exact watering metrics", () => {
    const normalized = buildRootZoneObservationFromGrowEvent({
      id: "event-id-must-not-leave-the-row",
      grow_id: "grow-id-must-not-leave-the-row",
      plant_id: "plant-id-must-not-leave-the-row",
      tent_id: "tent-id-must-not-leave-the-row",
      event_type: "watering",
      occurred_at: "2026-07-19T08:15:00-05:00",
      source: "manual_snapshot",
      note: "private note must not enter the projection",
      watering_events: {
        volume_ml: "1250",
        ph: 6.2,
        ec_ms_cm: "1.35",
        runoff_ml: 175,
        runoff_ph: "6.05",
        runoff_ec: 1.7,
        water_temp_c: 20.5,
        raw_payload: { bridge_token: "leak-marker" },
      },
      raw_payload: { service_role: "leak-marker" },
    } as RootZoneGrowEventRowLike & { raw_payload: unknown });

    expect(normalized).toEqual({
      occurredAt: "2026-07-19T13:15:00.000Z",
      eventType: "watering",
      source: "manual",
      metrics: {
        schemaVersion: 1,
        volumeMl: 1250,
        inputPh: 6.2,
        inputEcMsCm: 1.35,
        outputEcMsCm: null,
        runoffMl: 175,
        runoffPh: 6.05,
        runoffEcMsCm: 1.7,
        waterTempC: 20.5,
        nutrientLine: null,
        products: [],
      },
    });

    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toMatch(/(?:event|grow|plant|tent)[_-]?id/i);
    expect(serialized).not.toMatch(/raw_payload|bridge_token|service_role|leak-marker/i);
    expect(serialized).not.toContain("private note");
  });

  it("normalizes an array-shaped feeding relation and preserves exact input/output metrics", () => {
    const normalized = buildRootZoneObservationFromGrowEvent({
      event_type: "feeding",
      occurred_at: "2026-07-19T14:30:00.000Z",
      source: "csv_import",
      feeding_events: [
        {
          volume_ml: 950,
          ph: 5.85,
          ec_ms_cm: 9.9,
          ec_in: 1.55,
          ec_out: 2.05,
          runoff_ml: 225,
          runoff_ph: 6.1,
          runoff_ec: 2.2,
          water_temp_c: 21.25,
          line_id: "flower-week-4",
          nutrient_brand: "fallback-brand",
          products: [
            { name: "Base A", amount: 3.5, unit: "mL/L", product_id: "omit-me" },
            { name: "Base B", amount: "4", unit: "mL/L", raw_payload: "omit-me" },
          ],
        },
      ],
    });

    expect(normalized).toEqual({
      occurredAt: "2026-07-19T14:30:00.000Z",
      eventType: "feeding",
      source: "csv",
      metrics: {
        schemaVersion: 1,
        volumeMl: 950,
        inputPh: 5.85,
        inputEcMsCm: 1.55,
        outputEcMsCm: 2.05,
        runoffMl: 225,
        runoffPh: 6.1,
        runoffEcMsCm: 2.2,
        waterTempC: 21.25,
        nutrientLine: "flower-week-4",
        products: [
          { name: "Base A", amount: 3.5, unit: "mL/L" },
          { name: "Base B", amount: 4, unit: "mL/L" },
        ],
      },
    });
    expect(JSON.stringify(normalized)).not.toMatch(/product_id|raw_payload|omit-me/);
  });

  it("falls back to the typed feeding aliases without inventing absent measurements", () => {
    const normalized = buildRootZoneObservationFromGrowEvent({
      event_type: "feeding",
      occurred_at: "2026-07-19T15:00:00.000Z",
      source: "manual",
      feeding_events: {
        volume_ml: 500,
        ph: null,
        ec_in: "not-a-number",
        ec_ms_cm: 1.2,
        ec_out: null,
        nutrient_brand: "  Cautious Base Line  ",
      },
    });

    expect(normalized?.metrics).toMatchObject({
      volumeMl: 500,
      inputPh: null,
      inputEcMsCm: 1.2,
      outputEcMsCm: null,
      runoffMl: null,
      nutrientLine: "Cautious Base Line",
      products: [],
    });
  });

  it("rejects deleted, unrelated, malformed, empty, and secret-only rows without throwing", () => {
    const invalidRows: unknown[] = [
      null,
      {},
      {
        event_type: "watering",
        occurred_at: "2026-07-19T12:00:00.000Z",
        is_deleted: true,
        watering_events: { volume_ml: 500 },
      },
      {
        event_type: "photo",
        occurred_at: "2026-07-19T12:00:00.000Z",
        watering_events: { volume_ml: 500 },
      },
      {
        event_type: "watering",
        occurred_at: "not-a-date",
        watering_events: { volume_ml: 500 },
      },
      {
        event_type: "watering",
        occurred_at: "2026-07-19T12:00:00.000Z",
        watering_events: null,
      },
      {
        event_type: "watering",
        occurred_at: "2026-07-19T12:00:00.000Z",
        watering_events: { volume_ml: 0, ph: 15, ec_ms_cm: Number.NaN },
      },
      {
        event_type: "feeding",
        occurred_at: "2026-07-19T12:00:00.000Z",
        feeding_events: {
          line_id: "service_role=leak-marker",
          nutrient_brand: "api_key=leak-marker",
          products: [{ name: "secret=leak-marker", amount: null, unit: null }],
        },
      },
    ];

    for (const row of invalidRows) {
      expect(() =>
        buildRootZoneObservationFromGrowEvent(row as RootZoneGrowEventRowLike),
      ).not.toThrow();
      expect(buildRootZoneObservationFromGrowEvent(row as RootZoneGrowEventRowLike)).toBeNull();
    }
  });

  it("sanitizes products, nullable values, and secret-like strings before applying the product cap", () => {
    const products = [
      null,
      { name: "api_key=leak-marker", amount: 1, unit: "mL" },
      { name: "  Product 0  ", amount: -1, unit: " bearer leak-marker " },
      ...Array.from({ length: ROOT_ZONE_PRODUCT_CAP + 4 }, (_value, index) => ({
        name: `Product ${index + 1}`,
        amount: index + 1,
        unit: "mL/L",
        internal_id: `internal-${index}`,
      })),
    ];
    const normalized = buildRootZoneObservationFromGrowEvent({
      event_type: "feeding",
      occurred_at: "2026-07-19T16:00:00.000Z",
      source: "manual",
      feeding_events: { volume_ml: 750, products },
    });

    expect(normalized?.metrics.products).toHaveLength(ROOT_ZONE_PRODUCT_CAP);
    expect(normalized?.metrics.products[0]).toEqual({
      name: "Product 0",
      amount: null,
      unit: null,
    });
    expect(normalized?.invalidFields).toEqual(["products"]);
    expect(JSON.stringify(normalized)).not.toMatch(
      /api_key|bearer|leak-marker|internal_id|internal-/i,
    );
  });

  it("never coerces malformed JSON product amounts into real nutrient doses", () => {
    const normalized = buildRootZoneObservationFromGrowEvent({
      event_type: "feeding",
      occurred_at: "2026-07-19T16:00:00.000Z",
      source: "manual",
      feeding_events: {
        volume_ml: 750,
        products: [
          { name: "Boolean dose", amount: true, unit: "mL/L" },
          { name: "Array dose", amount: [], unit: "mL/L" },
          { name: "Object dose", amount: {}, unit: "mL/L" },
          { name: "Numeric string", amount: "2.5", unit: "mL/L" },
        ],
      },
    });

    expect(normalized?.metrics.products.map((product) => product.amount)).toEqual([
      null,
      null,
      null,
      2.5,
    ]);
    expect(normalized?.invalidFields).toEqual(["products"]);
  });

  it("normalizes existing metric envelopes and rejects incompatible or evidence-free versions", () => {
    expect(normalizeRootZoneMetricsV1(null)).toBeNull();
    expect(normalizeRootZoneMetricsV1({ schemaVersion: 2, volumeMl: 100 })).toBeNull();
    expect(
      normalizeRootZoneMetricsV1({
        schemaVersion: 1,
        nutrientLine: "service_role=leak-marker",
        products: [{ name: "api_key=leak-marker" }],
      }),
    ).toBeNull();

    expect(
      normalizeRootZoneMetricsV1({
        schemaVersion: 1,
        volumeMl: "600",
        inputPh: 7,
        inputEcMsCm: 10,
        outputEcMsCm: 0,
        runoffMl: 0,
        runoffPh: 0,
        runoffEcMsCm: 0,
        waterTempC: -10,
        nutrientLine: "service_role=leak-marker",
        products: [{ name: "api_key=leak-marker", amount: 1, unit: "mL" }],
      }),
    ).toEqual({
      schemaVersion: 1,
      volumeMl: 600,
      inputPh: 7,
      inputEcMsCm: 10,
      outputEcMsCm: 0,
      runoffMl: 0,
      runoffPh: 0,
      runoffEcMsCm: 0,
      waterTempC: -10,
      nutrientLine: null,
      products: [],
    });
  });
});

describe("root-zone ordering, deduplication, and bounds", () => {
  it("sorts newest-first, deduplicates exact content, clamps the cap, and honors cap=0", () => {
    const newest = observation("2026-07-19T18:00:00.000Z", "watering", 300);
    const middle = observation("2026-07-19T17:00:00.000Z", "feeding", 200);
    const oldest = observation("2026-07-19T16:00:00.000Z", "watering", 100);
    const input = [oldest, newest, middle, { ...newest, metrics: { ...newest.metrics } }];

    expect(sortAndBoundRootZoneObservations(input, 2)).toEqual([newest, middle]);
    expect(sortAndBoundRootZoneObservations(input, 0)).toEqual([]);
    expect(sortAndBoundRootZoneObservations(input, -5)).toEqual([]);
    expect(sortAndBoundRootZoneObservations(input, ROOT_ZONE_OBSERVATION_CAP + 50)).toHaveLength(3);
    expect(input).toEqual([oldest, newest, middle, { ...newest, metrics: { ...newest.metrics } }]);
  });

  it("uses complete tie-breakers so shuffled equal-time observations normalize identically", () => {
    const at = "2026-07-19T18:00:00.000Z";
    const manual = observation(at, "watering", 500, "manual");
    const csv = observation(at, "watering", 500, "csv");
    const feeding = observation(at, "feeding", 500, "manual");

    const first = sortAndBoundRootZoneObservations([manual, csv, feeding]);
    const shuffled = sortAndBoundRootZoneObservations([feeding, csv, manual]);

    expect(shuffled).toEqual(first);
  });

  it("normalizes, deduplicates, sorts, and caps rows through the public rows helper", () => {
    const rows: RootZoneGrowEventRowLike[] = Array.from(
      { length: ROOT_ZONE_OBSERVATION_CAP + 5 },
      (_value, index) => ({
        event_type: "watering",
        occurred_at: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        source: "manual",
        watering_events: { volume_ml: index + 100 },
      }),
    );
    rows.push({ ...rows.at(-1)! });

    const normalized = buildRootZoneObservationsFromRows(rows);

    expect(normalized).toHaveLength(ROOT_ZONE_OBSERVATION_CAP);
    expect(normalized[0].occurredAt).toBe("2026-07-25T12:00:00.000Z");
    expect(normalized.at(-1)?.occurredAt).toBe("2026-07-06T12:00:00.000Z");
  });

  it("builds only the established diary metric aliases and no operational fields", () => {
    const rootZone = observation("2026-07-19T18:00:00.000Z", "feeding", 800, "manual");
    rootZone.metrics = metrics(800, {
      inputPh: 5.9,
      inputEcMsCm: 1.4,
      outputEcMsCm: 1.8,
      runoffMl: 120,
      runoffPh: 6.1,
      runoffEcMsCm: 2,
      waterTempC: 21,
      nutrientLine: "flower-week-2",
      products: [{ name: "Base", amount: 2, unit: "mL/L" }],
    });

    expect(buildRootZoneDiaryDetails(rootZone)).toEqual({
      root_zone_v1: rootZone.metrics,
      watering_amount_ml: 800,
      ph: 5.9,
      ec: 1.4,
      ec_out: 1.8,
      runoff_ml: 120,
      runoff_ph: 6.1,
      runoff_ec: 2,
      water_temp_c: 21,
      nutrient_line_id: "flower-week-2",
      recipe: "flower-week-2",
      nutrients: [{ name: "Base", amount: 2, unit: "mL/L" }],
    });
    expect(buildRootZoneDiaryDetails(null)).toEqual({});
    expect(JSON.stringify(buildRootZoneDiaryDetails(rootZone))).not.toMatch(
      /grow_id|plant_id|tent_id|event_id|raw_payload/i,
    );
  });
});
