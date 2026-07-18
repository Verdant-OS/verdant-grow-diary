import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
  type CsvHistorySensorRowLike,
} from "@/lib/aiDoctorCsvHistoryContextRules";
import { AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP } from "@/lib/aiDoctorReviewRequestPacket";
import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import {
  buildImportedSensorHistoryAiDoctorHandoff,
  resolveImportedHistoryHandoffReadStatus,
  type BuildImportedSensorHistoryAiDoctorHandoffInput,
} from "@/lib/importedSensorHistoryAiDoctorHandoffRules";

function row(
  capturedAt: string,
  overrides: Partial<CsvHistorySensorRowLike> = {},
): CsvHistorySensorRowLike {
  return {
    source: "csv",
    captured_at: capturedAt,
    metric: "temperature_c",
    value: 24,
    unit: "C",
    quality: "ok",
    ...overrides,
  };
}

const ELIGIBLE_ROWS = [
  row("2026-07-01T10:00:00.000Z"),
  row("2026-07-02T10:00:00.000Z", { value: 25 }),
] as const;

function input(
  overrides: Partial<BuildImportedSensorHistoryAiDoctorHandoffInput> = {},
): BuildImportedSensorHistoryAiDoctorHandoffInput {
  return {
    tentId: "tent-1",
    historyStatus: "success",
    readings: ELIGIBLE_ROWS,
    plantStatus: "success",
    plants: [{ id: "plant-1", name: "North Star", isArchived: false }],
    ...overrides,
  };
}

describe("imported sensor history AI Doctor handoff rules", () => {
  it.each([
    [{ isError: true, isFetching: true, hasRows: false }, "error"],
    [{ isError: true, isFetching: false, hasRows: true }, "error"],
    [{ isError: false, isFetching: true, hasRows: false }, "loading"],
    [{ isError: false, isFetching: true, hasRows: true }, "success"],
    [{ isError: false, isFetching: false, hasRows: false }, "success"],
  ] as const)("resolves cached-row read status %#", (readState, expected) => {
    expect(resolveImportedHistoryHandoffReadStatus(readState)).toBe(expected);
  });

  it.each([
    ["loading", "history_loading"],
    ["error", "history_error"],
    ["success", "history_empty"],
  ] as const)("distinguishes %s history as %s", (historyStatus, expectedState) => {
    const result = buildImportedSensorHistoryAiDoctorHandoff(
      input({ historyStatus, readings: [] }),
    );

    expect(result.state).toBe(expectedState);
    expect(result.validObservationCount).toBe(0);
    expect(result.distinctTimestampCount).toBe(0);
    expect(result.choices).toEqual([]);
  });

  it("fails closed when exact rows contain too few valid observations", () => {
    const secretPayload = { bridge_token: "must-not-leak" };
    const result = buildImportedSensorHistoryAiDoctorHandoff(
      input({
        readings: [
          row("2026-07-01T10:00:00.000Z", { raw_payload: secretPayload }),
          row("2026-07-02T10:00:00.000Z", { value: "not-a-number" }),
          row("2026-07-03T10:00:00.000Z", { source: "manual" }),
          row("2026-07-04T10:00:00.000Z", { quality: "invalid" }),
        ],
      }),
    );

    expect(result).toMatchObject({
      state: "too_few_valid_observations",
      validObservationCount: 1,
      distinctTimestampCount: 1,
      caveat: AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
      choices: [],
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("bridge_token");
  });

  it("distinguishes several valid observations at one historical timestamp", () => {
    const capturedAt = "2026-07-01T10:00:00.000Z";
    const result = buildImportedSensorHistoryAiDoctorHandoff(
      input({
        readings: [
          row(capturedAt),
          row(capturedAt, { metric: "humidity_pct", value: 55, unit: "%" }),
        ],
      }),
    );

    expect(result).toMatchObject({
      state: "single_timestamp",
      validObservationCount: 2,
      distinctTimestampCount: 1,
      choices: [],
    });
  });

  it.each([
    ["loading", "plants_loading"],
    ["error", "plants_error"],
  ] as const)("distinguishes %s plant reads as %s", (plantStatus, expectedState) => {
    const result = buildImportedSensorHistoryAiDoctorHandoff(input({ plantStatus }));

    expect(result.state).toBe(expectedState);
    expect(result.validObservationCount).toBe(2);
    expect(result.distinctTimestampCount).toBe(2);
    expect(result.choices).toEqual([]);
  });

  it("reports no active plants after filtering null, blank, and archived IDs", () => {
    const result = buildImportedSensorHistoryAiDoctorHandoff(
      input({
        plants: [
          { id: null, name: "Missing" },
          { id: "   ", name: "Blank" },
          { id: "archived", name: "Old", isArchived: true },
          { id: "archived-row", name: "Old row", is_archived: true },
        ],
      }),
    );

    expect(result.state).toBe("no_active_plants");
    expect(result.choices).toEqual([]);
  });

  it("builds the exact encoded Plant Detail review path for one active plant", () => {
    const result = buildImportedSensorHistoryAiDoctorHandoff(
      input({
        tentId: " tent 1/x ",
        plants: [{ id: " plant 1/a ", name: "  North   Star  " }],
      }),
    );

    expect(result.state).toBe("single_active_plant");
    expect(result.choices).toEqual([
      {
        plantId: "plant 1/a",
        plantName: "North Star",
        label: "Review North Star",
        href: `/plants/plant%201%2Fa?tentId=tent+1%2Fx#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`,
      },
    ]);
  });

  it("returns every multiple-plant choice in normalized-name then ID order without a default", () => {
    const result = buildImportedSensorHistoryAiDoctorHandoff(
      input({
        plants: [
          { id: "z-plant", name: " beta " },
          { id: "b-plant", name: "Alpha" },
          { id: "a-plant", name: " alpha " },
          { id: "archived", name: "Aardvark", isArchived: true },
          { id: "a-plant", name: "Duplicate" },
        ],
      }),
    );

    expect(result.state).toBe("multiple_active_plants");
    expect(result.choices.map((choice) => [choice.plantName, choice.plantId])).toEqual([
      ["alpha", "a-plant"],
      ["Alpha", "b-plant"],
      ["beta", "z-plant"],
    ]);
    expect(
      result.choices.every((choice) =>
        choice.href.endsWith(`?tentId=tent-1#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`),
      ),
    ).toBe(true);
    for (const choice of result.choices) {
      expect(choice).not.toHaveProperty("selected");
      expect(choice).not.toHaveProperty("isDefault");
    }
  });

  it("uses a safe fallback name without discarding a valid plant ID", () => {
    const result = buildImportedSensorHistoryAiDoctorHandoff(
      input({ plants: [{ id: "plant-unnamed", name: " \n\t " }] }),
    );

    expect(result.choices[0]).toMatchObject({
      plantId: "plant-unnamed",
      plantName: "Unnamed plant",
      label: "Review Unnamed plant",
    });
  });

  it("is deterministic across shuffled rows, plants, and duplicate IDs", () => {
    const readings = [
      row("2026-07-03T10:00:00.000Z", { metric: "humidity_pct", value: 50 }),
      row("2026-07-01T10:00:00.000Z"),
      row("2026-07-02T10:00:00.000Z", { value: 25 }),
    ];
    const plants = [
      { id: "p-2", name: "Zulu" },
      { id: "p-1", name: "Alpha" },
      { id: "p-1", name: "Zulu duplicate" },
    ];

    const forward = buildImportedSensorHistoryAiDoctorHandoff(input({ readings, plants }));
    const reversed = buildImportedSensorHistoryAiDoctorHandoff(
      input({ readings: [...readings].reverse(), plants: [...plants].reverse() }),
    );

    expect(reversed).toEqual(forward);
  });

  it("uses the review-packet row cap for evidence counts", () => {
    const readings = Array.from({ length: AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP + 7 }, (_, index) =>
      row(new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(), {
        value: index,
      }),
    );
    const result = buildImportedSensorHistoryAiDoctorHandoff(input({ readings }));

    expect(result.validObservationCount).toBe(AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP);
    expect(result.distinctTimestampCount).toBe(AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP);
  });

  it("fails safely for missing tent context and never emits an unscoped link", () => {
    const result = buildImportedSensorHistoryAiDoctorHandoff(input({ tentId: null }));

    expect(result).toMatchObject({
      state: "missing_tent",
      validObservationCount: 2,
      distinctTimestampCount: 2,
      choices: [],
    });
    expect(JSON.stringify(result)).not.toContain("/plants/");
  });

  it("returns only the safe handoff contract and never mutates caller arrays", () => {
    const readings = [...ELIGIBLE_ROWS];
    const plants = [{ id: "p-1", name: "Plant One" }];
    const readingsBefore = [...readings];
    const plantsBefore = plants.map((plant) => ({ ...plant }));

    const result = buildImportedSensorHistoryAiDoctorHandoff(input({ readings, plants }));

    expect(Object.keys(result).sort()).toEqual([
      "body",
      "caveat",
      "choices",
      "distinctTimestampCount",
      "state",
      "title",
      "validObservationCount",
    ]);
    expect(readings).toEqual(readingsBefore);
    expect(plants).toEqual(plantsBefore);
    expect(JSON.stringify(result)).not.toMatch(/raw_payload|action queue|device command/i);
  });
});
