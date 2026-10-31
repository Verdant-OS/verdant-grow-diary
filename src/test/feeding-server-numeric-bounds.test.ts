/**
 * Server-mirrored feeding bounds.
 *
 * `quicklog_save_event` rejects pH, EC, runoff, volume and water temperature
 * outside a fixed range. The form names that rejection before the RPC, and a
 * pending Feed whose only problem is one of those bounds must still restore so
 * the server refusal can release it. A non-range failure stays blocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEEDING_SAVE_FAILURE_MESSAGE,
  FEEDING_SERVER_NUMERIC_BOUNDS,
  buildFeedingFormPayload,
  feedingFormReasonToHelper,
  findFeedingPayloadRangeViolation,
  isFeedingNumericRangeReason,
  type FeedingBoundedNumericKey,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";
import {
  claimPendingQuickLogFeeding,
  readPendingQuickLogFeeding,
  type PendingQuickLogFeeding,
} from "@/lib/quickLogPendingFeedingStore";

const BOUNDS_KEYS = Object.keys(FEEDING_SERVER_NUMERIC_BOUNDS) as FeedingBoundedNumericKey[];

function form(patch: Partial<QuickLogFeedingFormState> = {}): QuickLogFeedingFormState {
  return {
    lineId: "veg-week-3",
    products: [{ name: "Base A", amount: "2", unit: "ml_per_l" }],
    volumeMl: "750",
    ph: "",
    ecIn: "",
    ppmIn: "",
    ecOut: "",
    ppmOut: "",
    runoffMl: "",
    runoffPh: "",
    runoffEc: "",
    runoffPpm: "",
    waterTempC: "",
    note: "",
    ...patch,
  };
}

function map(patch: Partial<QuickLogFeedingFormState>) {
  return buildFeedingFormPayload({
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
    idempotencyKey: "feed-save-123",
    form: form(patch),
  });
}

describe("findFeedingPayloadRangeViolation", () => {
  it("returns null for absent payloads and skips non-finite values", () => {
    expect(findFeedingPayloadRangeViolation(null)).toBeNull();
    expect(findFeedingPayloadRangeViolation(undefined)).toBeNull();
    expect(findFeedingPayloadRangeViolation({})).toBeNull();
    expect(
      findFeedingPayloadRangeViolation({
        ph: Number.NaN,
        ec_in: Number.POSITIVE_INFINITY,
        water_temp_c: "21" as unknown as number,
      }),
    ).toBeNull();
  });

  it("accepts inclusive bounds and reports the first violation in stable field order", () => {
    for (const key of BOUNDS_KEYS) {
      const { min, max } = FEEDING_SERVER_NUMERIC_BOUNDS[key];
      expect(findFeedingPayloadRangeViolation({ [key]: min }), key).toBeNull();
      expect(findFeedingPayloadRangeViolation({ [key]: max }), key).toBeNull();
      expect(findFeedingPayloadRangeViolation({ [key]: min - 0.001 })).toBe(`${key}:out_of_range`);
      expect(findFeedingPayloadRangeViolation({ [key]: max + 0.001 })).toBe(`${key}:out_of_range`);
    }

    expect(
      findFeedingPayloadRangeViolation({
        water_temp_c: 80,
        ph: 15,
        volume_ml: -1,
      }),
    ).toBe("volume_ml:out_of_range");
  });

  it("recognizes only the bounded field reasons", () => {
    for (const key of BOUNDS_KEYS) {
      expect(isFeedingNumericRangeReason(`${key}:out_of_range`)).toBe(true);
    }
    for (const reason of [
      "volume_ml:invalid",
      "numeric:invalid",
      "ph:out_of_range ",
      "not_ph:out_of_range",
      "constructor:out_of_range",
      "__proto__:out_of_range",
      "",
      null,
      14,
    ]) {
      expect(isFeedingNumericRangeReason(reason)).toBe(false);
    }
  });
});

describe("buildFeedingFormPayload server bounds", () => {
  it("keeps inclusive edges and names the field just outside them", () => {
    const cases = [
      ["ph", "14", true],
      ["ph", "0", true],
      ["ph", "14.1", "ph:out_of_range"],
      ["ph", "-0.1", "ph:out_of_range"],
      ["ecIn", "10", true],
      ["ecIn", "10.1", "ec_in:out_of_range"],
      ["ecOut", "10", true],
      ["ecOut", "10.1", "ec_out:out_of_range"],
      ["runoffMl", "1000000", true],
      ["runoffMl", "1000001", "runoff_ml:out_of_range"],
      ["runoffMl", "-1", "runoff_ml:out_of_range"],
      ["runoffPh", "14.1", "runoff_ph:out_of_range"],
      ["runoffEc", "10.1", "runoff_ec:out_of_range"],
      ["waterTempC", "-10", true],
      ["waterTempC", "60", true],
      ["waterTempC", "-10.1", "water_temp_c:out_of_range"],
      ["waterTempC", "60.1", "water_temp_c:out_of_range"],
      ["ppmIn", "5000", true],
      ["ppmIn", "5500", "ec_in:out_of_range"],
    ] as const;

    for (const [field, value, expected] of cases) {
      const result = map({ [field]: value });
      if (expected === true) {
        expect(result.ok, `${field}=${value}`).toBe(true);
      } else {
        expect(result, `${field}=${value}`).toEqual({ ok: false, reason: expected });
        expect(feedingFormReasonToHelper(expected)).not.toBe(FEEDING_SAVE_FAILURE_MESSAGE);
      }
    }
  });

  it("rejects a negative EC before the range check, as a non-numeric pair", () => {
    expect(map({ ecIn: "-0.1" })).toEqual({ ok: false, reason: "numeric:invalid" });
    expect(map({ ecOut: "-0.1" })).toEqual({ ok: false, reason: "numeric:invalid" });
    expect(map({ runoffEc: "-0.1" })).toEqual({ ok: false, reason: "numeric:invalid" });
  });

  it("names pH before later out-of-range fields", () => {
    expect(map({ ph: "15", ecIn: "12", waterTempC: "80" })).toEqual({
      ok: false,
      reason: "ph:out_of_range",
    });
    expect(feedingFormReasonToHelper("ph:out_of_range")).toBe("Feed pH must be between 0 and 14.");
    expect(feedingFormReasonToHelper("water_temp_c:out_of_range")).toBe(
      "Water temperature must be between -10 °C and 60 °C (14–140 °F).",
    );
    expect(feedingFormReasonToHelper("ec_in:out_of_range")).toMatch(/0 and 10 mS\/cm/);
  });
});

function pendingRecord(): PendingQuickLogFeeding {
  return {
    version: 1,
    ownerId: "owner-a",
    createdAt: "2026-09-17T16:00:00.000Z",
    payload: {
      idempotency_key: "feeding-save-12345678",
      grow_id: "grow-a",
      tent_id: "tent-a",
      plant_id: "plant-a",
      occurred_at: "2026-09-17T16:00:00.000Z",
      nutrient_line_id: "veg-week-3",
      volume_ml: 750,
      products: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
      note: "Checked the plant first",
      ec_in: 1.2,
      water_temp_c: 21,
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: "plant-a",
      plantId: "plant-a",
      tentId: "tent-a",
      growId: "grow-a",
    },
  };
}

describe("pending Feed recovery for out-of-range values", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["ph", 15],
    ["ec_in", 10.1],
    ["runoff_ml", 1_000_001],
    ["water_temp_c", -10.1],
  ] as const)("restores a pending Feed whose %s is outside the server bounds", (field, value) => {
    const pending = pendingRecord();
    pending.payload[field] = value;
    expect(claimPendingQuickLogFeeding(pending)).toEqual({ status: "claimed", record: pending });
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: pending });
  });

  it("still blocks a pending Feed that is not a range rejection", () => {
    const pending = pendingRecord();
    pending.payload.products = [];
    expect(claimPendingQuickLogFeeding(pending)).toEqual({ status: "blocked" });
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "empty" });
  });
});
