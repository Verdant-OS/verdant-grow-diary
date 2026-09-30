import { describe, expect, it } from "vitest";
import type { PendingQuickLogActivity } from "@/lib/quickLogPendingActivityStore";
import { restoreRejectedQuickLogActivityDraft } from "@/lib/quickLogRejectedActivityDraftRules";

function record(
  activityId: PendingQuickLogActivity["input"]["activityId"],
  extraDetails: Record<string, unknown> | null,
  options: {
    harvestDetails?: PendingQuickLogActivity["receipt"]["harvestDetails"];
    symptomCheck?: boolean;
  } = {},
): PendingQuickLogActivity {
  return {
    version: 1,
    ownerId: "owner-a",
    createdAt: "2026-09-26T00:00:00.000Z",
    input: {
      activityId,
      growId: "grow-a",
      tentId: "tent-a",
      plantId: "plant-a",
      note: "Original note",
      occurredAt: "2026-09-26T00:00:00.000Z",
      extraDetails,
      idempotencyKey: "retry-key-a",
    },
    receipt: {
      harvestDetails: options.harvestDetails ?? null,
      symptomCheck: options.symptomCheck ?? false,
    },
  };
}

describe("rejected Quick Log activity draft restoration", () => {
  it("restores a closed-vocabulary training choice", () => {
    expect(
      restoreRejectedQuickLogActivityDraft(record("training", { technique: "topping" }))
        .detailValues,
    ).toEqual({ technique: "topping" });
  });

  it("restores nested manual environment values in their canonical Celsius basis", () => {
    const draft = restoreRejectedQuickLogActivityDraft(
      record("environment_check", {
        checkType: "airflow",
        environment_check: { temp_c: 24.5, humidity_pct: 55 },
      }),
    );
    expect(draft.detailValues).toEqual({
      checkType: "airflow",
      temp_c: "24.5",
      humidity_pct: "55",
    });
    expect(draft.temperatureEntryUnit).toBe("celsius");
  });

  it("restores Harvest weights, precision, and unit from the frozen receipt", () => {
    const draft = restoreRejectedQuickLogActivityDraft(
      record(
        "harvest",
        { harvest: { wetWeight: "12.50", dryWeight: "3.25", weightUnit: "lb" } },
        {
          harvestDetails: { wetWeight: "12.50", dryWeight: "3.25", weightUnit: "lb" },
        },
      ),
    );
    expect([draft.harvestWet, draft.harvestDry, draft.harvestUnit]).toEqual([
      "12.50",
      "3.25",
      "lb",
    ]);
  });

  it("restores guided Symptom Check stage and observed sign without inventing a diagnosis", () => {
    const draft = restoreRejectedQuickLogActivityDraft(
      record(
        "issue_observation",
        {
          observation_stage: "flower",
          observedSign: "wilting",
          observationLocation: "lower_leaves",
        },
        { symptomCheck: true },
      ),
    );
    expect(draft.detailValues).toEqual({
      observedSign: "wilting",
      observationLocation: "lower_leaves",
    });
    expect([
      draft.guidedSymptomCheck,
      draft.guidedSymptomStage,
      draft.guidedSymptomStageConfirmed,
      draft.guidedSymptomNoneObserved,
    ]).toEqual([true, "flower", true, false]);
  });

  it("restores an explicit no-visible-signs observation without a fabricated sign", () => {
    const draft = restoreRejectedQuickLogActivityDraft(
      record(
        "issue_observation",
        {
          observation_stage: "veg",
          symptom_check_result: "no_symptoms_observed",
        },
        { symptomCheck: true },
      ),
    );
    expect(draft.guidedSymptomNoneObserved).toBe(true);
    expect(draft.detailValues).not.toHaveProperty("observedSign");
  });

  it("drops malformed and out-of-set values instead of treating them as grower evidence", () => {
    const draft = restoreRejectedQuickLogActivityDraft(
      record("environment_check", {
        checkType: "automatic-irrigation",
        environment_check: { temp_c: 900, humidity_pct: "invalid" },
      }),
    );
    expect(draft.detailValues).toEqual({});
    expect(draft.temperatureEntryUnit).toBeNull();
  });

  it("is null-safe and deterministic", () => {
    const empty = restoreRejectedQuickLogActivityDraft(null);
    expect(empty.detailValues).toEqual({});
    expect(empty.harvestWet).toBe("");
    const input = record("training", { technique: "lst" });
    expect(restoreRejectedQuickLogActivityDraft(input)).toEqual(
      restoreRejectedQuickLogActivityDraft(input),
    );
  });
});
