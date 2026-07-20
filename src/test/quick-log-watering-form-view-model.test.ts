import { describe, expect, it } from "vitest";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  ROOT_ZONE_MANUAL_OBSERVATION_VERSION,
  WATERING_SAVE_FAILURE_MESSAGE,
  WATERING_SAVE_SUCCESS_MESSAGE,
  buildWateringFormPayload,
  isWateringFormPristine,
  wateringFormReasonToHelper,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";

function withForm(patch: Partial<QuickLogWateringFormState> = {}): QuickLogWateringFormState {
  return {
    ...EMPTY_QUICKLOG_WATERING_FORM,
    volumeMl: "750",
    ...patch,
  };
}

function buildPayload(
  input: Omit<Parameters<typeof buildWateringFormPayload>[0], "idempotencyKey"> & {
    idempotencyKey?: string;
  },
) {
  return buildWateringFormPayload({
    idempotencyKey: "water-save-123",
    ...input,
  });
}

describe("isWateringFormPristine", () => {
  it("accepts only the untouched form", () => {
    expect(isWateringFormPristine(EMPTY_QUICKLOG_WATERING_FORM)).toBe(true);
  });

  it.each([
    "volumeMl",
    "ph",
    "ec",
    "ppm",
    "runoffMl",
    "runoffPh",
    "runoffEc",
    "runoffPpm",
    "waterTempC",
    "potWeightFeel",
    "mediumSurface",
    "drainage",
  ] as const)("rejects a draft with %s entered", (field) => {
    expect(
      isWateringFormPristine({
        ...EMPTY_QUICKLOG_WATERING_FORM,
        [field]:
          field === "potWeightFeel"
            ? "light"
            : field === "mediumSurface"
              ? "dry"
              : field === "drainage"
                ? "normal"
                : "1",
      }),
    ).toBe(false);
  });
});

describe("buildWateringFormPayload — mapping", () => {
  it("maps the minimal grower-authored record without inventing optional evidence", () => {
    const result = buildPayload({
      growId: " grow-1 ",
      tentId: "tent-1",
      plantId: "plant-1",
      form: withForm(),
      note: "   ",
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        idempotency_key: "water-save-123",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        occurred_at: null,
        note: null,
        volume_ml: 750,
        sensor_snapshot: null,
        details: null,
      },
    });
  });

  it("maps all optional measurements and trims the note", () => {
    const result = buildPayload({
      growId: "grow-1",
      tentId: null,
      plantId: null,
      occurredAt: "2026-07-20T05:30:00-05:00",
      note: "  Pot felt light before watering.  ",
      form: withForm({
        ph: "6.2",
        ec: "2",
        ppm: "1000",
        runoffMl: "175",
        runoffPh: "6.4",
        runoffEc: "1.7",
        runoffPpm: "850",
        waterTempC: "21.5",
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      occurred_at: "2026-07-20T10:30:00.000Z",
      note: "Pot felt light before watering.",
      volume_ml: 750,
      ph: 6.2,
      ec_ms_cm: 2,
      runoff_ml: 175,
      runoff_ph: 6.4,
      runoff_ec: 1.7,
      water_temp_c: 21.5,
    });
    expect(result.payload).not.toHaveProperty("ppm");
    expect(result.payload).not.toHaveProperty("runoff_ppm");
  });

  it("converts PPM-500-only entries to canonical EC", () => {
    const result = buildPayload({
      growId: "grow-1",
      form: withForm({ ppm: "1000", runoffPpm: "850" }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.ec_ms_cm).toBe(2);
    expect(result.payload.runoff_ec).toBe(1.7);
  });

  it("accepts the inclusive measurement boundaries", () => {
    const result = buildPayload({
      growId: "grow-1",
      occurredAt: 1_721_477_800_000,
      temperatureC: "-10",
      humidityPct: "100",
      vpdKpa: "10",
      form: withForm({
        ph: "0",
        ec: "10",
        runoffMl: "1000000",
        runoffPh: "14",
        runoffEc: "0",
        waterTempC: "60",
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sensor_snapshot?.metrics).toEqual({
      temperature_c: -10,
      humidity_pct: 100,
      vpd_kpa: 10,
    });
  });

  it("adds a versioned, explicitly manual observation envelope without replacing base details", () => {
    const result = buildPayload({
      growId: "grow-1",
      occurredAt: "2026-07-20T10:30:00.000Z",
      baseDetails: { route: "quick-log-v2", retained: true },
      form: withForm({
        potWeightFeel: "light",
        mediumSurface: "dry",
        drainage: "slow",
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.details).toEqual({
      route: "quick-log-v2",
      retained: true,
      root_zone_manual_observation_v1: {
        schema_version: ROOT_ZONE_MANUAL_OBSERVATION_VERSION,
        source: "manual",
        evidence_type: "root_zone_manual_observation",
        advisory_only: true,
        observed_at: "2026-07-20T10:30:00.000Z",
        pot_weight_feel: "light",
        medium_surface: "dry",
        drainage: "slow",
      },
    });
  });

  it("labels optional air readings as a manual snapshot captured at the observation time", () => {
    const result = buildPayload({
      growId: "grow-1",
      occurredAt: new Date("2026-07-20T10:30:00.000Z"),
      temperatureC: "24.5",
      humidityPct: "61",
      vpdKpa: "1.2",
      form: withForm(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sensor_snapshot).toEqual({
      source: "manual",
      captured_at: "2026-07-20T10:30:00.000Z",
      metrics: { temperature_c: 24.5, humidity_pct: 61, vpd_kpa: 1.2 },
    });
  });

  it("is deterministic and does not mutate its inputs", () => {
    const input = {
      growId: "grow-1",
      occurredAt: "2026-07-20T10:30:00.000Z",
      baseDetails: { retained: true },
      form: withForm({ ppm: "750", potWeightFeel: "moderate" as const }),
    };
    const before = structuredClone(input);

    const first = buildPayload(input);
    const second = buildPayload(input);

    expect(first).toEqual(second);
    expect(input).toEqual(before);
  });
});

describe("buildWateringFormPayload — validation", () => {
  it("fails closed on missing grow identity or invalid idempotency", () => {
    expect(buildPayload({ growId: " ", form: withForm() })).toEqual({
      ok: false,
      reason: "grow_id:missing",
    });
    expect(buildPayload({ idempotencyKey: "short", growId: "grow-1", form: withForm() })).toEqual({
      ok: false,
      reason: "idempotency_key:invalid",
    });
    expect(
      buildPayload({
        idempotencyKey: "x".repeat(201),
        growId: "grow-1",
        form: withForm(),
      }),
    ).toEqual({ ok: false, reason: "idempotency_key:invalid" });
  });

  it.each([
    ["", "volume_ml:missing"],
    ["not-a-number", "volume_ml:invalid"],
    ["0", "volume_ml:invalid"],
    ["-1", "volume_ml:invalid"],
    ["1000001", "volume_ml:invalid"],
  ])("rejects applied volume %j as %s", (volumeMl, reason) => {
    expect(buildPayload({ growId: "grow-1", form: withForm({ volumeMl }) })).toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects malformed optional numbers and EC/PPM mismatch", () => {
    expect(buildPayload({ growId: "grow-1", form: withForm({ ph: "6e0" }) })).toEqual({
      ok: false,
      reason: "numeric:invalid",
    });
    expect(buildPayload({ growId: "grow-1", form: withForm({ ec: "2", ppm: "700" }) })).toEqual({
      ok: false,
      reason: "ec_ppm:mismatch",
    });
  });

  it.each([
    [{ ph: "14.01" }, "numeric:out_of_range"],
    [{ ec: "10.01" }, "numeric:out_of_range"],
    [{ runoffMl: "1000001" }, "numeric:out_of_range"],
    [{ runoffPh: "-0.1" }, "numeric:out_of_range"],
    [{ runoffEc: "10.01" }, "numeric:out_of_range"],
    [{ waterTempC: "60.1" }, "numeric:out_of_range"],
  ] as const)("rejects an out-of-band root-zone measurement", (patch, reason) => {
    expect(
      buildPayload({
        growId: "grow-1",
        form: withForm(patch as Partial<QuickLogWateringFormState>),
      }),
    ).toEqual({ ok: false, reason });
  });

  it("rejects observation enum values outside the explicit labels", () => {
    expect(
      buildPayload({
        growId: "grow-1",
        occurredAt: "2026-07-20T10:30:00.000Z",
        form: withForm({ potWeightFeel: "guess" as QuickLogWateringFormState["potWeightFeel"] }),
      }),
    ).toEqual({ ok: false, reason: "manual_observation:invalid" });
  });

  it("requires a valid observation timestamp for manual evidence", () => {
    expect(
      buildPayload({
        growId: "grow-1",
        form: withForm({ mediumSurface: "dry" }),
      }),
    ).toEqual({ ok: false, reason: "observed_at:invalid" });
    expect(
      buildPayload({
        growId: "grow-1",
        occurredAt: "not-a-date",
        form: withForm(),
      }),
    ).toEqual({ ok: false, reason: "observed_at:invalid" });
  });

  it.each([
    [{ temperatureC: "61" }, "temperature_out_of_range"],
    [{ humidityPct: "101" }, "humidity_out_of_range"],
    [{ vpdKpa: "10.1" }, "vpd_out_of_range"],
    [{ temperatureC: "warm" }, "numeric:invalid"],
  ] as const)("rejects invalid manual air evidence", (air, reason) => {
    expect(
      buildPayload({
        growId: "grow-1",
        occurredAt: "2026-07-20T10:30:00.000Z",
        form: withForm(),
        ...air,
      }),
    ).toEqual({ ok: false, reason });
  });

  it("requires captured_at when any manual air measurement is present", () => {
    expect(buildPayload({ growId: "grow-1", temperatureC: "24", form: withForm() })).toEqual({
      ok: false,
      reason: "observed_at:invalid",
    });
  });
});

describe("watering form copy", () => {
  it("explains EC/PPM-500 mismatch and known validation failures", () => {
    expect(wateringFormReasonToHelper("ec_ppm:mismatch")).toMatch(/500 scale/i);
    expect(wateringFormReasonToHelper("volume_ml:missing")).toMatch(/total water applied/i);
    expect(wateringFormReasonToHelper("manual_observation:invalid")).toMatch(/manual observation/i);
  });

  it("uses calm success and fallback failure copy", () => {
    expect(WATERING_SAVE_SUCCESS_MESSAGE).toBe("Watering logged.");
    expect(wateringFormReasonToHelper("rpc:error")).toBe(WATERING_SAVE_FAILURE_MESSAGE);
    expect(WATERING_SAVE_FAILURE_MESSAGE).toMatch(/could not confirm/i);
    expect(WATERING_SAVE_FAILURE_MESSAGE).toMatch(/exact same record/i);
    expect(WATERING_SAVE_FAILURE_MESSAGE).not.toMatch(/nothing else was changed/i);
  });
});
