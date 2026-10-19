/**
 * A single Quick Log watering has a realistic ceiling (owner decision
 * 2026-10-14: 50,000 ml). Production accepted 1,000,000 ml and blocked
 * 99,999,999 with "must be a positive number". Above the ceiling the
 * grower sees a clear "too large" message, inline and on save.
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_WATER_VOLUME_MAX_ML,
  QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE,
  assessWateringVolumeInput,
  buildWateringFormPayload,
  EMPTY_QUICKLOG_WATERING_FORM,
  wateringFormReasonToHelper,
} from "@/lib/quickLogWateringFormViewModel";
import { assessQuickLogWaterSaveGate } from "@/lib/quickLogWaterSaveGateRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";
import { buildLegacyQuickLogUnifiedPayload } from "@/lib/legacyQuickLogUnifiedSave";
import { validatePublicQuickLogStarterInput } from "@/lib/publicQuickLogStarterRules";
import { evaluateQuickLogPreview } from "@/lib/quickLogPreviewRules";
import {
  buildWateringVolumeDefaults,
  formatWateringVolumeMlForPrefill,
} from "@/lib/wateringVolumeDefaultsViewModel";

const TOO_LARGE = /too large \(max 50,000 ml\)/i;

function wateringForm(volumeMl: string) {
  return buildWateringFormPayload({
    growId: "grow-1",
    idempotencyKey: "idem-key-1234",
    form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl },
  });
}

describe("Quick Log water volume ceiling", () => {
  it("is 50,000 ml", () => {
    expect(QUICK_LOG_WATER_VOLUME_MAX_ML).toBe(50_000);
  });

  it("watering form rejects volumes above the ceiling as too large, not invalid", () => {
    expect(wateringForm("50000").ok).toBe(true);
    expect(wateringForm("50001")).toEqual({ ok: false, reason: "volume_ml:too_large" });
    expect(wateringForm("1000000")).toEqual({ ok: false, reason: "volume_ml:too_large" });
    expect(wateringForm("-1")).toEqual({ ok: false, reason: "volume_ml:invalid" });
    expect(wateringFormReasonToHelper("volume_ml:too_large")).toMatch(TOO_LARGE);
  });

  it("the inline save gate shows the too-large message before Save", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "1000000" },
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.fields.volume).toMatch(TOO_LARGE);
  });

  it("the V2 save payload refuses the volume with the same message", () => {
    const resolved = { ok: true, targetType: "tent", targetId: "tent-1", growId: "grow-1" };
    const r = buildQuickLogV2SavePayload({
      resolved,
      action: "water",
      volumeMl: "1000000",
      note: "",
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      idempotencyKey: "idem-key-1234",
    } as unknown as Parameters<typeof buildQuickLogV2SavePayload>[0]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("volume_too_large");
      expect(quickLogReasonToOperatorMessage(r.reason)).toMatch(TOO_LARGE);
    }
  });
});

describe("Quick Log water volume ceiling on the public-starter legacy path", () => {
  const legacyBase = {
    eventType: "watering",
    idempotencyKey: "quicklog-legacy-volume-max-key",
    noteWithHardware: "",
    plantId: "11111111-1111-1111-1111-111111111111",
    plantTentId: "22222222-2222-2222-2222-222222222222",
    details: { ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" },
  };

  it("legacy adapter accepts exactly the ceiling", () => {
    const r = buildLegacyQuickLogUnifiedPayload({
      ...legacyBase,
      details: { ...legacyBase.details, watering: "50000" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.p_volume_ml).toBe(50_000);
  });

  it("legacy adapter refuses one ml above the ceiling and 1,000,000 ml", () => {
    for (const watering of ["50001", "1000000"]) {
      const r = buildLegacyQuickLogUnifiedPayload({
        ...legacyBase,
        details: { ...legacyBase.details, watering },
      });
      expect(r.ok, watering).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe("volume_too_large");
        expect(r.message).toBe(QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE);
      }
    }
  });

  const starterInput = {
    plantNickname: "Test Plant",
    stage: "",
    logType: "watering",
    note: "",
  };

  it("starter validation accepts exactly the ceiling", () => {
    const v = validatePublicQuickLogStarterInput({ ...starterInput, wateringVolumeRaw: "50000" });
    expect(v.errors).toEqual({});
    expect(v.fields?.wateringVolumeMl).toBe(50_000);
  });

  it("starter validation refuses volumes above the ceiling with the shared message", () => {
    for (const raw of ["50001", "1000000"]) {
      const v = validatePublicQuickLogStarterInput({ ...starterInput, wateringVolumeRaw: raw });
      expect(v.fields, raw).toBeNull();
      expect(v.errors.wateringVolumeMl, raw).toBe(QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE);
    }
  });
});

describe("legacy watering volume uses the structured form's plain-decimal grammar", () => {
  const legacyBase = {
    eventType: "watering",
    idempotencyKey: "quicklog-legacy-volume-grammar-key",
    noteWithHardware: "",
    plantId: "11111111-1111-1111-1111-111111111111",
    plantTentId: "22222222-2222-2222-2222-222222222222",
    details: { ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" },
  };

  it("assessWateringVolumeInput matches the form's outcomes", () => {
    expect(assessWateringVolumeInput(" 500 ")).toEqual({ ok: true, value: 500 });
    expect(assessWateringVolumeInput("50000")).toEqual({ ok: true, value: 50_000 });
    expect(assessWateringVolumeInput("")).toEqual({ ok: false, reason: "missing" });
    expect(assessWateringVolumeInput("50001")).toEqual({ ok: false, reason: "too_large" });
    for (const raw of ["0x10", "1e2", "Infinity", "-5", "0", "abc"]) {
      expect(assessWateringVolumeInput(raw), raw).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("legacy adapter refuses hex and exponent volumes instead of reading them as numbers", () => {
    for (const watering of ["0x10", "1e2"]) {
      const r = buildLegacyQuickLogUnifiedPayload({
        ...legacyBase,
        details: { ...legacyBase.details, watering },
      });
      expect(r.ok, watering).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_volume");
    }
  });
});

describe("public starter watering volume uses the Water form grammar", () => {
  const starter = { plantNickname: "Test Plant", stage: "", logType: "watering", note: "" };

  it("refuses hex and exponent volumes before they are normalized into the draft", () => {
    for (const raw of ["0x10", "1e2", "Infinity"]) {
      const v = validatePublicQuickLogStarterInput({ ...starter, wateringVolumeRaw: raw });
      expect(v.fields, raw).toBeNull();
      expect(v.errors.wateringVolumeMl, raw).toBe(
        "Enter how much water you gave, in ml (a number above 0).",
      );
    }
  });

  it("still accepts a plain decimal volume", () => {
    const v = validatePublicQuickLogStarterInput({ ...starter, wateringVolumeRaw: " 250.5 " });
    expect(v.errors).toEqual({});
    expect(v.fields?.wateringVolumeMl).toBe(250.5);
  });
});

describe("legacy Quick Log validation preview uses the same ceiling and grammar", () => {
  const preview = (watering: string) =>
    evaluateQuickLogPreview({
      note: "Watered.",
      eventType: "watering",
      stage: "veg",
      details: { watering },
    });

  it("warns with the shared too-large message above 50,000 ml", () => {
    for (const watering of ["50001", "1000000"]) {
      const w = preview(watering).warnings.find((x) => x.code === "watering:out-of-range");
      expect(w?.message, watering).toBe(QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE);
    }
  });

  it("does not warn at exactly the ceiling", () => {
    expect(preview("50000").warnings.some((x) => x.code.startsWith("watering:"))).toBe(false);
  });

  it("flags hex and exponent volumes as not a number", () => {
    for (const watering of ["0x10", "1e2"]) {
      expect(
        preview(watering).warnings.some((x) => x.code === "watering:invalid"),
        watering,
      ).toBe(true);
    }
  });
});

describe("historical watering defaults respect the ceiling", () => {
  const entry = (id: string, entryAt: string, ml: number) => ({
    id,
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    event_type: "watering",
    entry_at: entryAt,
    note: "",
    details: { event_type: "watering", watering_amount_ml: ml },
  });

  it("does not format a volume above 50,000 ml as a prefill", () => {
    expect(formatWateringVolumeMlForPrefill(50_000)).toBe("50000");
    expect(formatWateringVolumeMlForPrefill(50_001)).toBeNull();
    expect(formatWateringVolumeMlForPrefill(1_000_000)).toBeNull();
  });

  it("skips an oversized latest watering and uses the newest in-range one", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [
        entry("old-ok", "2026-06-01T12:00:00.000Z", 800),
        entry("latest-oversized", "2026-06-10T12:00:00.000Z", 1_000_000),
      ],
      plantId: "plant-1",
    });
    expect(r.defaults).toEqual({ volumeMl: "800" });
    expect(r.sourceEntryId).toBe("old-ok");
  });

  it("offers no default when the only history is oversized", () => {
    const r = buildWateringVolumeDefaults({
      rawEntries: [entry("only", "2026-06-10T12:00:00.000Z", 60_000)],
      plantId: "plant-1",
    });
    expect(r.defaults).toBeNull();
  });
});
