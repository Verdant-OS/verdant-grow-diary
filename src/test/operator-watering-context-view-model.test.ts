import { describe, expect, it } from "vitest";
import {
  buildOperatorWateringContextViewModel,
  type OperatorWateringReadState,
} from "@/lib/operatorWateringContextViewModel";
import type {
  OperatorDiaryEntryInput,
  OperatorSensorReadingInput,
} from "@/lib/operatorAccountReadModelsViewModel";
import type { OperatorRootZoneCycleInput } from "@/lib/operatorRootZoneCycleViewModel";

const PLANT_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";

function eventIdFor(value: string): string {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `33333333-3333-4333-8333-${hash.toString(16).padStart(12, "0")}`;
}

function rootZoneObservation(
  occurredAt: string,
  eventType: "watering" | "feeding",
  overrides: Partial<OperatorRootZoneCycleInput["metrics"]> = {},
): OperatorRootZoneCycleInput {
  return {
    occurredAt,
    eventType,
    eventId: eventIdFor(`${occurredAt}:${eventType}`),
    plantId: PLANT_ID,
    tentId: TENT_ID,
    source: "manual",
    metrics: {
      schemaVersion: 1,
      volumeMl: 900,
      inputPh: 6.1,
      inputEcMsCm: 1.35,
      outputEcMsCm: null,
      runoffMl: 125,
      runoffPh: 6.2,
      runoffEcMsCm: 1.65,
      waterTempC: 20,
      nutrientLine: null,
      products: [],
      ...overrides,
    },
  };
}

function diaryEntry(
  id: string,
  entryAt: string,
  note: string,
  createdAt = entryAt,
): OperatorDiaryEntryInput {
  return {
    id,
    stage: "flowering",
    note,
    entry_at: entryAt,
    created_at: createdAt,
  };
}

function sensorReading(
  id: string,
  metric: string,
  overrides: Partial<OperatorSensorReadingInput> = {},
): OperatorSensorReadingInput {
  return {
    id,
    metric,
    value: metric === "vpd_kpa" ? 1.18 : 42,
    quality: "ok",
    source: "live",
    ts: "2026-07-19T18:00:00.000Z",
    captured_at: "2026-07-19T18:00:00.000Z",
    freshness: "fresh",
    current_live: true,
    ...overrides,
  };
}

function readyState(overrides: Partial<OperatorWateringReadState> = {}): OperatorWateringReadState {
  return {
    rootZone: {
      status: "ready",
      observations: [rootZoneObservation("2026-07-19T17:00:00.000Z", "watering")],
    },
    diary: {
      status: "ready",
      entries: [diaryEntry("diary-1", "2026-07-19T17:30:00.000Z", "Leaves are upright.")],
    },
    sensor: {
      status: "ready",
      readings: {
        soil_moisture_pct: sensorReading("sensor-soil", "soil_moisture_pct"),
      },
    },
    ...overrides,
  };
}

describe("operator watering context view model", () => {
  it("presents the latest root-zone application, separate water/feed evidence, and bounded observations", () => {
    const state = readyState({
      rootZone: {
        status: "ready",
        observations: [
          rootZoneObservation("2026-07-19T18:30:00.000Z", "feeding", {
            volumeMl: 500,
            outputEcMsCm: 1.5,
            nutrientLine: "CRONK Bonnie & Clyde",
            products: [{ name: "Bonnie", amount: 4, unit: "ml_per_l" }],
          }),
          rootZoneObservation("2026-07-19T18:00:00.000Z", "watering"),
          rootZoneObservation("2026-07-18T18:00:00.000Z", "watering", { volumeMl: 700 }),
        ],
      },
      diary: {
        status: "ready",
        entries: [
          diaryEntry("oldest", "2026-07-19T14:00:00.000Z", "Old observation"),
          diaryEntry("newest", "2026-07-19T17:00:00.000Z", "Top leaves are praying."),
          diaryEntry("middle", "2026-07-19T16:00:00.000Z", "Drainage looked clear."),
          diaryEntry("hidden", "2026-07-19T15:00:00.000Z", "bearer secret-token-value"),
        ],
      },
    });

    const model = buildOperatorWateringContextViewModel(state);

    expect(model.status).toBe("context");
    expect(model.manualObservationStatus).toBe("ready");
    expect(model.typedWateringCount).toBe(2);
    expect(model.typedFeedingCount).toBe(1);
    expect(model.recentRootZoneCycles.map((row) => row.eventLabel)).toEqual([
      "Feeding",
      "Watering",
      "Watering",
    ]);
    expect(model.recentRootZoneCycles[0]).toMatchObject({
      nutrientLine: "CRONK Bonnie & Clyde",
      products: [{ name: "Bonnie", valueLabel: "4 mL/L" }],
    });
    expect(model.recentRootZoneCycles[0].metrics).toContainEqual({
      key: "output_ec",
      label: "Output EC",
      valueLabel: "1.50 mS/cm · 750 ppm (500 scale)",
    });
    expect(model.lastRootZoneApplication).toMatchObject({
      occurredAt: "2026-07-19T18:30:00.000Z",
      eventType: "feeding",
      eventLabel: "Feed",
      sourceLabel: "Manual log",
    });
    expect(model.lastConfirmedWatering).toMatchObject({
      occurredAt: "2026-07-19T18:00:00.000Z",
      eventType: "watering",
      eventLabel: "Plain water",
      sourceLabel: "Manual log",
      hasRejectedMetrics: false,
    });
    expect(model.lastConfirmedFeeding).toMatchObject({
      occurredAt: "2026-07-19T18:30:00.000Z",
      eventType: "feeding",
      eventLabel: "Feed",
    });
    expect(model.lastConfirmedWatering?.metrics).toEqual([
      { key: "volume_ml", label: "Volume", valueLabel: "900 mL" },
      { key: "input_ph", label: "Input pH", valueLabel: "6.10 pH" },
      { key: "input_ec", label: "Input EC", valueLabel: "1.35 mS/cm" },
      { key: "runoff_ml", label: "Runoff volume", valueLabel: "125 mL" },
      { key: "runoff_ph", label: "Runoff pH", valueLabel: "6.20 pH" },
      { key: "runoff_ec", label: "Runoff EC", valueLabel: "1.65 mS/cm" },
      expect.objectContaining({ key: "water_temp", label: "Water temperature" }),
    ]);
    expect(model.diaryObservationCount).toBe(4);
    expect(model.diaryObservations.map((row) => row.id)).toEqual(["newest", "middle", "hidden"]);
    expect(model.diaryObservations.at(-1)?.note).toBe("Observation text hidden.");
    expect(model.missingContext).toEqual([]);
    expect(model.decisionReminder).toBe(
      "Review the plant, pot weight or medium, drainage, and recent water or feed applications before deciding.",
    );
    expect(model.snapshotCaveat).toBe(
      "One sensor snapshot is not a dryback trend; elapsed review starts after the latest root-zone application.",
    );
    expect(model.airContextCaveat).toBe("Air readings alone do not determine watering.");
  });

  it("never treats a free-text diary note as confirmed watering history", () => {
    const model = buildOperatorWateringContextViewModel(
      readyState({
        rootZone: { status: "ready", observations: [] },
        diary: {
          status: "ready",
          entries: [
            diaryEntry(
              "generic-note",
              "2026-07-19T18:00:00.000Z",
              "Watered two liters and might water again tomorrow.",
            ),
          ],
        },
      }),
    );

    expect(model.lastConfirmedWatering).toBeNull();
    expect(model.lastRootZoneApplication).toBeNull();
    expect(model.typedWateringCount).toBe(0);
    expect(model.diaryObservationCount).toBe(1);
    expect(model.diaryObservations[0].note).toContain("Watered two liters");
    expect(model.status).toBe("insufficient");
    expect(model.missingContext).toContain("typed_root_zone_history");
  });

  it("uses a typed feed as the latest root-zone application without calling it plain water", () => {
    const model = buildOperatorWateringContextViewModel(
      readyState({
        rootZone: {
          status: "ready",
          observations: [rootZoneObservation("2026-07-19T18:00:00.000Z", "feeding")],
        },
      }),
    );

    expect(model.typedFeedingCount).toBe(1);
    expect(model.typedWateringCount).toBe(0);
    expect(model.lastConfirmedWatering).toBeNull();
    expect(model.lastRootZoneApplication).toMatchObject({
      eventType: "feeding",
      eventLabel: "Feed",
      occurredAt: "2026-07-19T18:00:00.000Z",
    });
    expect(model.lastConfirmedFeeding).toEqual(model.lastRootZoneApplication);
    expect(model.status).toBe("context");
    expect(model.missingContext).not.toContain("typed_root_zone_history");
  });

  it("does not let a future-only watering satisfy confirmed history", () => {
    const model = buildOperatorWateringContextViewModel(
      readyState({
        rootZone: {
          status: "ready",
          observations: [
            rootZoneObservation("2026-07-19T10:06:00.001Z", "watering", {
              volumeMl: 800,
            }),
          ],
        },
      }),
      { now: Date.parse("2026-07-19T10:00:00.000Z") },
    );

    expect(model.typedWateringCount).toBe(1);
    expect(model.lastConfirmedWatering).toBeNull();
    expect(model.lastRootZoneApplication).toBeNull();
    expect(model.missingContext).toContain("typed_root_zone_history");
    expect(model.recentRootZoneCycles[0].warnings).toContain(
      "Timestamp is in the future; verify the recorded time before interpreting this record.",
    );
  });

  it("anchors history to the latest non-future application when a newer feed is future-dated", () => {
    const model = buildOperatorWateringContextViewModel(
      readyState({
        rootZone: {
          status: "ready",
          observations: [
            rootZoneObservation("2026-07-19T10:06:00.001Z", "feeding"),
            rootZoneObservation("2026-07-19T09:00:00.000Z", "watering"),
          ],
        },
      }),
      { now: Date.parse("2026-07-19T10:00:00.000Z") },
    );

    expect(model.lastRootZoneApplication).toMatchObject({
      eventType: "watering",
      eventLabel: "Plain water",
      occurredAt: "2026-07-19T09:00:00.000Z",
    });
    expect(model.lastConfirmedWatering).toEqual(model.lastRootZoneApplication);
    expect(model.lastConfirmedFeeding).toBeNull();
    expect(model.status).toBe("context");
  });

  it("reports insufficient context when typed watering history is absent or soil moisture is absent", () => {
    const noHistory = buildOperatorWateringContextViewModel(
      readyState({ rootZone: { status: "ready", observations: [] } }),
    );
    const noSoil = buildOperatorWateringContextViewModel(
      readyState({
        sensor: {
          status: "ready",
          readings: {
            temperature_c: sensorReading("air-temp", "temperature_c", { value: 24 }),
            humidity_pct: sensorReading("air-rh", "humidity_pct", { value: 55 }),
          },
        },
      }),
    );

    expect(noHistory.status).toBe("insufficient");
    expect(noHistory.missingContext).toEqual(["typed_root_zone_history"]);
    expect(noSoil.status).toBe("insufficient");
    expect(noSoil.missingContext).toEqual(["soil_moisture_snapshot"]);
    expect(noSoil.sensorRows.every((row) => row.contextLabel === "Air context only")).toBe(true);
  });

  it("returns explicit loading and unavailable states without promoting partial data", () => {
    const loading = buildOperatorWateringContextViewModel(
      readyState({ rootZone: { status: "loading", observations: [] } }),
    );
    const unavailable = buildOperatorWateringContextViewModel({
      rootZone: { status: "unavailable" },
      diary: { status: "unavailable" },
      sensor: { status: "no_tent" },
    });

    expect(loading.status).toBe("loading");
    expect(loading.manualObservationStatus).toBe("loading");
    expect(loading.lastRootZoneApplication).toBeNull();
    expect(loading.lastConfirmedWatering).toBeNull();
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.manualObservationStatus).toBe("unavailable");
    expect(unavailable.summary).toContain("unavailable");
    expect(buildOperatorWateringContextViewModel(null).status).toBe("unavailable");
  });

  it("keeps core root-zone evidence usable while flagging unavailable manual observations", () => {
    const model = buildOperatorWateringContextViewModel(
      readyState({
        rootZone: {
          status: "ready",
          observations: [rootZoneObservation("2026-07-19T17:00:00.000Z", "watering")],
          manualObservationStatus: "unavailable",
        },
      }),
    );

    expect(model.status).toBe("context");
    expect(model.lastConfirmedWatering).not.toBeNull();
    expect(model.recentRootZoneCycles).toHaveLength(1);
    expect(model.manualObservationStatus).toBe("unavailable");
    expect(model.manualObservationAvailabilityNote).toMatch(
      /manual root-zone observations are unavailable.*review the source log/i,
    );
  });

  it("keeps other evidence usable while distinguishing an unavailable tent diary from no entries", () => {
    const model = buildOperatorWateringContextViewModel(
      readyState({ diary: { status: "unavailable" } }),
    );

    expect(model.status).toBe("context");
    expect(model.lastRootZoneApplication).not.toBeNull();
    expect(model.sensorRows).toHaveLength(1);
    expect(model.diaryObservationStatus).toBe("unavailable");
    expect(model.diaryObservationCount).toBe(0);
    expect(model.diaryObservations).toEqual([]);
    expect(model.diaryObservationAvailabilityNote).toBe(
      "Tent-linked observations are unavailable. Verdant cannot confirm this tent has no recent entries.",
    );
  });

  it("does not label a rejected manual observation as a rejected measurement", () => {
    const observation = {
      ...rootZoneObservation("2026-07-19T17:00:00.000Z", "watering"),
      invalidFields: ["manualObservation"] as const,
    };
    const model = buildOperatorWateringContextViewModel(
      readyState({ rootZone: { status: "ready", observations: [observation] } }),
    );

    expect(model.lastRootZoneApplication?.hasRejectedMetrics).toBe(false);
    expect(model.recentRootZoneCycles[0]?.warnings).not.toContain(
      "Some supplied measurements were rejected.",
    );
  });

  it("labels root-zone and air context while only strict fresh live readings remain current", () => {
    const model = buildOperatorWateringContextViewModel(
      readyState({
        sensor: {
          status: "ready",
          readings: {
            moisture: sensorReading("a-live", "soil_moisture_pct"),
            soilTemp: sensorReading("b-manual", "soil_temp_c", { source: "manual" }),
            ec: sensorReading("c-csv", "ec", { source: "csv", value: 1.4 }),
            temperature: sensorReading("d-demo", "temperature_c", {
              source: "demo",
              value: 24,
            }),
            humidity: sensorReading("e-stale", "humidity_pct", {
              freshness: "stale",
              value: 55,
            }),
            vpd: sensorReading("f-invalid", "vpd_kpa", {
              quality: "invalid",
              freshness: "invalid",
            }),
          },
        },
      }),
    );

    expect(model.sensorRows.map((row) => row.metric)).toEqual([
      "soil_moisture_pct",
      "soil_temp_c",
      "ec",
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
    ]);
    expect(model.sensorRows.slice(0, 3).every((row) => row.contextKind === "root_zone")).toBe(true);
    expect(model.sensorRows.slice(3).every((row) => row.contextKind === "air")).toBe(true);
    expect(model.sensorRows.filter((row) => row.currentLive).map((row) => row.id)).toEqual([
      "a-live",
    ]);
    expect(model.sensorRows.find((row) => row.id === "e-stale")?.trustTone).toBe("caution");
    expect(model.sensorRows.find((row) => row.id === "f-invalid")?.trustTone).toBe("invalid");
  });

  it("does not count an invalid or untimestamped soil reading as usable context", () => {
    const invalid = buildOperatorWateringContextViewModel(
      readyState({
        sensor: {
          status: "ready",
          readings: {
            soil: sensorReading("invalid-soil", "soil_moisture_pct", {
              source: "invalid",
              quality: "invalid",
              freshness: "invalid",
            }),
          },
        },
      }),
    );
    const untimestamped = buildOperatorWateringContextViewModel(
      readyState({
        sensor: {
          status: "ready",
          readings: {
            soil: sensorReading("untimestamped-soil", "soil_moisture_pct", {
              ts: "not-a-date",
              captured_at: null,
            }),
          },
        },
      }),
    );

    expect(invalid.status).toBe("insufficient");
    expect(invalid.sensorRows[0]).toMatchObject({ currentLive: false, trustTone: "invalid" });
    expect(untimestamped.status).toBe("insufficient");
    expect(untimestamped.sensorRows[0]).toMatchObject({ currentLive: false, capturedAt: null });
  });

  it("requires a fresh plausible soil snapshot before calling watering context sufficient", () => {
    const stale = buildOperatorWateringContextViewModel(
      readyState({
        sensor: {
          status: "ready",
          readings: {
            soil: sensorReading("stale-soil", "soil_moisture_pct", {
              freshness: "stale",
              current_live: false,
            }),
          },
        },
      }),
    );
    const freshManual = buildOperatorWateringContextViewModel(
      readyState({
        sensor: {
          status: "ready",
          readings: {
            soil: sensorReading("manual-soil", "soil_moisture_pct", {
              source: "manual",
              freshness: "fresh",
              current_live: false,
            }),
          },
        },
      }),
    );

    expect(stale.status).toBe("insufficient");
    expect(stale.missingContext).toContain("soil_moisture_snapshot");
    expect(freshManual.status).toBe("context");
    expect(freshManual.missingContext).not.toContain("soil_moisture_snapshot");
    expect(freshManual.sensorRows[0]).toMatchObject({
      freshness: "fresh",
      currentLive: false,
      trustTone: "context",
    });
  });

  it("uses complete tie-breakers so shuffled equal-time evidence is deterministic", () => {
    const at = "2026-07-19T18:00:00.000Z";
    const firstWatering = {
      ...rootZoneObservation(at, "watering", { volumeMl: 500 }),
      eventId: "44444444-4444-4444-8444-444444444444",
    };
    const secondWatering = {
      ...rootZoneObservation(at, "watering", { volumeMl: 750 }),
      eventId: "55555555-5555-4555-8555-555555555555",
    };
    const diaries = [diaryEntry("a", at, "Observation A"), diaryEntry("b", at, "Observation B")];
    const readings = {
      z: sensorReading("z", "temperature_c", { value: 24 }),
      a: sensorReading("a", "soil_moisture_pct"),
    };
    const first = buildOperatorWateringContextViewModel(
      readyState({
        rootZone: { status: "ready", observations: [firstWatering, secondWatering] },
        diary: { status: "ready", entries: diaries },
        sensor: { status: "ready", readings },
      }),
    );
    const shuffled = buildOperatorWateringContextViewModel(
      readyState({
        rootZone: { status: "ready", observations: [secondWatering, firstWatering] },
        diary: { status: "ready", entries: [...diaries].reverse() },
        sensor: { status: "ready", readings: { a: readings.a, z: readings.z } },
      }),
    );

    expect(shuffled).toEqual(first);
    expect(first.diaryObservations.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("fails closed on malformed, null, and non-finite records without throwing", () => {
    const malformed = {
      rootZone: { status: "ready", observations: [null, {}, { eventType: "watering" }] },
      diary: { status: "ready", entries: [null, {}, "bad"] },
      sensor: {
        status: "ready",
        readings: {
          nullish: null,
          nonfinite: sensorReading("nan", "soil_moisture_pct", { value: Number.NaN }),
          missing: {},
        },
      },
    } as unknown as OperatorWateringReadState;

    expect(() => buildOperatorWateringContextViewModel(malformed)).not.toThrow();
    expect(buildOperatorWateringContextViewModel(malformed)).toMatchObject({
      status: "insufficient",
      lastRootZoneApplication: null,
      lastConfirmedWatering: null,
      lastConfirmedFeeding: null,
      typedWateringCount: 0,
      diaryObservationCount: 0,
      sensorRows: [],
    });
  });

  it("keeps generated guidance inside the read-only evidence fence", () => {
    const model = buildOperatorWateringContextViewModel(readyState());
    const generatedCopy = [
      model.summary,
      model.decisionReminder,
      model.snapshotCaveat,
      model.airContextCaveat,
      model.cycleArithmeticCaveat,
      model.nutrientEvidenceCaveat,
      model.cycleScopeCaveat,
      model.growerControlNote,
    ].join(" ");

    expect(generatedCopy).not.toMatch(
      /water now|skip watering|ready to water|watering schedule|watering cadence|target volume|increase (?:the )?volume|decrease (?:the )?volume|change nutrients|action queue|device command|automatic watering/i,
    );
    expect(model.growerControlNote).toContain("read-only evidence");
    expect(model.growerControlNote).toContain("grower makes the decision");
  });
});
