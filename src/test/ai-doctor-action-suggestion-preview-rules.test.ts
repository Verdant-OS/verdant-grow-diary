import { describe, expect, it } from "vitest";
import {
  ACTION_SUGGESTION_PREVIEW_LABEL,
  ACTION_SUGGESTION_PREVIEW_STATUS_LABELS,
  deriveActionSuggestionPreviewInput,
  isUnsafePreviewText,
  previewActionSuggestion,
  type ActionSuggestionPreviewInput,
} from "@/lib/aiDoctorActionSuggestionPreviewRules";

const baseInput: ActionSuggestionPreviewInput = {
  hasPlantContext: true,
  hasCurrentManualOrLiveReading: true,
  hasImportedHistory: false,
  hasInvalidOrUnknownCriticalTelemetry: false,
  candidateSuggestionTexts: [],
};

describe("aiDoctorActionSuggestionPreviewRules", () => {
  it("returns needs_current_reading for CSV-imported-only context", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      hasCurrentManualOrLiveReading: false,
      hasImportedHistory: true,
    });
    expect(out.status).toBe("needs_current_reading");
    expect(out.eligible).toBe(false);
    expect(out.reasons.join(" ")).toMatch(/imported csv history/i);
    expect(out.suggestedActionPreview).toBeUndefined();
  });

  it("returns missing_context when plant/tent/stage are absent", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      hasPlantContext: false,
    });
    expect(out.status).toBe("missing_context");
    expect(out.eligible).toBe(false);
  });

  it("returns blocked_invalid_data when invalid/unknown critical telemetry is present", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      hasInvalidOrUnknownCriticalTelemetry: true,
    });
    expect(out.status).toBe("blocked_invalid_data");
    expect(out.eligible).toBe(false);
  });

  it("blocks device-command-shaped candidate text", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      candidateSuggestionTexts: ["turn on the fan", "monitor for 24 hours"],
    });
    expect(out.status).toBe("blocked_device_command_risk");
    expect(out.eligible).toBe(false);
  });

  it("returns eligible only with current manual/live readings plus plant context", () => {
    const out = previewActionSuggestion(baseInput);
    expect(out.status).toBe("eligible");
    expect(out.eligible).toBe(true);
    expect(out.suggestedActionPreview).toBeDefined();
    expect(out.suggestedActionPreview).not.toMatch(/turn (on|off)|dose|actuate|setpoint/i);
  });

  it("always sets approvalRequired=true, deviceControl=false, contextOnly=true", () => {
    const out = previewActionSuggestion(baseInput);
    expect(out.approvalRequired).toBe(true);
    expect(out.deviceControl).toBe(false);
    expect(out.contextOnly).toBe(true);
  });

  it("is deterministic across repeated calls", () => {
    const a = previewActionSuggestion(baseInput);
    const b = previewActionSuggestion(baseInput);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never recommends nutrient/irrigation/equipment commands in suggested copy", () => {
    const out = previewActionSuggestion(baseInput);
    const copy = out.suggestedActionPreview ?? "";
    expect(copy).not.toMatch(/increase (feed|nutrient|ec)|water more|irrigation|pump|fan on|light on/i);
  });

  it("derives input from readiness-view shape", () => {
    const input = deriveActionSuggestionPreviewInput({
      plantIdentity: { plantId: "p1", stage: "veg" },
      sourceBadges: [
        { source: "csv", sampleCount: 12, isTrustworthy: false },
        { source: "manual", sampleCount: 1, isTrustworthy: true },
      ],
      limitations: [],
    });
    expect(input.hasPlantContext).toBe(true);
    expect(input.hasCurrentManualOrLiveReading).toBe(true);
    expect(input.hasImportedHistory).toBe(true);
    expect(input.hasInvalidOrUnknownCriticalTelemetry).toBe(false);
  });

  it("exposes a stable label and status catalog", () => {
    expect(ACTION_SUGGESTION_PREVIEW_LABEL).toBe("Action Queue suggestion preview");
    expect(Object.keys(ACTION_SUGGESTION_PREVIEW_STATUS_LABELS).sort()).toEqual(
      [
        "blocked_device_command_risk",
        "blocked_invalid_data",
        "eligible",
        "missing_context",
        "needs_current_reading",
      ],
    );
    for (const label of Object.values(ACTION_SUGGESTION_PREVIEW_STATUS_LABELS)) {
      expect(label).not.toMatch(/approved|queued|executed/i);
    }
  });

  // ---- Partial telemetry + field-level detail ----

  it("returns blocked_invalid_data when temperature is valid but EC is invalid", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      invalidTelemetryMetrics: ["soil_ec"],
    });
    expect(out.status).toBe("blocked_invalid_data");
    expect(out.invalidFields).toEqual(["soil_ec"]);
  });

  it("returns missing_context with stage in missingFields when stage is absent", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      hasPlantContext: false,
      plantContextDetail: { plant: true, tent: true, stage: false },
    });
    expect(out.status).toBe("missing_context");
    expect(out.missingFields).toEqual(["stage"]);
  });

  it("returns eligible when live/manual current reading + plant/tent/stage are all present", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      plantContextDetail: { plant: true, tent: true, stage: true },
    });
    expect(out.status).toBe("eligible");
    expect(out.missingFields).toEqual([]);
    expect(out.invalidFields).toEqual([]);
  });

  it("returns needs_current_reading for imported CSV-only context with rich history", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      hasCurrentManualOrLiveReading: false,
      hasImportedHistory: true,
    });
    expect(out.status).toBe("needs_current_reading");
    expect(out.missingFields).toContain("current_sensor_snapshot");
  });

  it("produces a deterministic, sorted invalidFields list", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      invalidTelemetryMetrics: ["soil_moisture", "co2", "vpd", "temperature_c"],
    });
    // Canonical order: temperature, humidity, vpd, soil_ec, soil_moisture, co2, unknown
    expect(out.invalidFields).toEqual(["temperature", "vpd", "soil_moisture", "co2"]);
    const again = previewActionSuggestion({
      ...baseInput,
      invalidTelemetryMetrics: ["co2", "temperature_c", "vpd", "soil_moisture"],
    });
    expect(again.invalidFields).toEqual(out.invalidFields);
  });

  it("produces a deterministic, sorted missingFields list", () => {
    const out = previewActionSuggestion({
      ...baseInput,
      hasCurrentManualOrLiveReading: false,
      hasPlantContext: false,
      plantContextDetail: { plant: false, tent: false, stage: false },
    });
    expect(out.missingFields).toEqual([
      "plant",
      "tent",
      "stage",
      "current_sensor_snapshot",
    ]);
  });

  it("conservative suggested copy avoids nutrient/irrigation/equipment language", () => {
    const out = previewActionSuggestion(baseInput);
    const copy = out.suggestedActionPreview ?? "";
    expect(copy).not.toMatch(
      /nutrient|irrigation|dose|pump|fan on|light on|setpoint|equipment/i,
    );
  });

  // ---- UI safety filter ----

  it("isUnsafePreviewText catches approved/queued/executable/device-command language", () => {
    for (const bad of [
      "approved",
      "queued for execution",
      "was executed",
      "execute now",
      "send to device",
      "turn on the fan",
      "turn off pump",
      "pump start",
      "dose nutrients",
      "set temp to 24",
      "set humidity 60",
      "mqtt publish",
    ]) {
      expect(isUnsafePreviewText(bad), `should flag: ${bad}`).toBe(true);
    }
  });

  it("isUnsafePreviewText allows passive safety labels", () => {
    for (const ok of [
      "Approval required — grower must approve any action before it runs.",
      "No device control — Verdant will not run equipment commands.",
      "Preview only — no Action Queue item is created.",
      "Imported history is included as background only.",
    ]) {
      expect(isUnsafePreviewText(ok), `should allow: ${ok}`).toBe(false);
    }
  });
});
