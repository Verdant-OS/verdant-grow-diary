/**
 * Friction item 1: an open alert that quotes another stage's range is
 * labelled for the grower, never closed or rewritten. Reason strings below
 * are the exact formats defaultEnvironmentThresholds writes.
 */
import { describe, expect, it } from "vitest";
import {
  assessAlertStageStaleness,
  parseAlertEvaluatedStage,
} from "@/lib/alertStageStalenessRules";

const SEEDLING_VPD =
  "VPD is above the seedling target range. Observed 1.3 kPa (seedling range 0.4–0.8 kPa).";
const LATE_FLOWER_RH =
  "Humidity is above the late flower target range. Observed 60% (late flower range 35–50%).";

describe("parseAlertEvaluatedStage", () => {
  it("reads the stage from the app's own reason formats", () => {
    expect(parseAlertEvaluatedStage(SEEDLING_VPD)).toBe("seedling");
    expect(parseAlertEvaluatedStage(LATE_FLOWER_RH)).toBe("late_flower");
    expect(parseAlertEvaluatedStage("VPD is below the preflower target range.")).toBe("preflower");
    expect(parseAlertEvaluatedStage("Observed 1.0 kPa (veg range 0.8–1.2 kPa).")).toBe("veg");
  });

  it("returns null for configured-target and unrelated reasons", () => {
    expect(
      parseAlertEvaluatedStage(
        "VPD is above the configured maximum. Observed 1.6 kPa (configured target 0.8–1.2 kPa).",
      ),
    ).toBeNull();
    expect(
      parseAlertEvaluatedStage("No recent sensor snapshot is available for this grow."),
    ).toBeNull();
    expect(parseAlertEvaluatedStage("")).toBeNull();
    expect(parseAlertEvaluatedStage(null)).toBeNull();
  });
});

describe("assessAlertStageStaleness", () => {
  it("walk repro: seedling-range alert on a Flower plant is labelled", () => {
    const r = assessAlertStageStaleness({ reason: SEEDLING_VPD, currentStage: "Flowering" });
    expect(r.stale).toBe(true);
    expect(r.note).toBe(
      "Checked against Seedling targets. This tent's alerts now use Flower targets, so this alert may no longer apply.",
    );
  });

  it("same stage is not stale", () => {
    expect(assessAlertStageStaleness({ reason: SEEDLING_VPD, currentStage: "seedling" })).toEqual({
      stale: false,
      evaluatedStage: "seedling",
      currentStage: "seedling",
      note: null,
    });
  });

  it("never guesses: unknown current stage or unparseable reason is not stale", () => {
    expect(assessAlertStageStaleness({ reason: SEEDLING_VPD, currentStage: null }).stale).toBe(
      false,
    );
    expect(assessAlertStageStaleness({ reason: SEEDLING_VPD, currentStage: "banana" }).stale).toBe(
      false,
    );
    expect(
      assessAlertStageStaleness({ reason: "Something else", currentStage: "flower" }).stale,
    ).toBe(false);
  });
});
