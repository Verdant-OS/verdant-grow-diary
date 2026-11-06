import { describe, expect, it } from "vitest";
import {
  parseQuickLogObservationDraft,
  QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
  quickLogObservationDraftRestoredCopy,
  quickLogObservationDraftStorageId,
  quickLogObservationDraftTargetMove,
  restorableQuickLogObservationDraft,
  shouldWarnBeforeLeavingQuickLogObservation,
} from "@/lib/quickLogObservationDraftRules";
import {
  adoptablePendingGrowId,
  isStartRoomRetryableSaveError,
  parseStartYourRoomDraft,
  plainStartRoomSaveError,
  startRoomSaveErrorWithReason,
} from "@/lib/startYourRoomDraftRules";

const draft = (selectedKey: string | null, note = "pale leaves") =>
  parseQuickLogObservationDraft({ form: { action: "note", selectedKey, note }, saveFailed: true })!;

describe("restorableQuickLogObservationDraft", () => {
  it("restores only into the target the draft was typed for", () => {
    expect(restorableQuickLogObservationDraft(draft("plant:a"), "plant:a")).not.toBeNull();
    expect(restorableQuickLogObservationDraft(draft("plant:a"), "plant:b")).toBeNull();
  });
  it("does not restore a targeted draft when the sheet opens with none", () => {
    for (const none of [null, undefined, ""]) {
      expect(restorableQuickLogObservationDraft(draft("plant:a"), none)).toBeNull();
    }
    const untargeted = restorableQuickLogObservationDraft(draft(null), null);
    expect(untargeted?.form.note).toBe("pale leaves");
    expect(untargeted?.form.selectedKey).toBeNull();
    expect(quickLogObservationDraftRestoredCopy(untargeted!)).toBe(
      QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
    );
  });
  it("reads the entry unit and chip status, and older drafts without them", () => {
    const stored = parseQuickLogObservationDraft({
      form: { action: "note", selectedKey: "plant:a", note: "pale", temperatureC: "25" },
      tempEntryUnit: "celsius",
      chipStatus: "Better",
    })!;
    expect(stored.tempEntryUnit).toBe("celsius");
    expect(stored.chipStatus).toBe("Better");
    const older = draft("plant:a");
    expect(older.tempEntryUnit).toBeNull();
    expect(older.chipStatus).toBeNull();
    const junk = parseQuickLogObservationDraft({
      form: { action: "note", note: "x" },
      tempEntryUnit: "kelvin",
      chipStatus: "Great",
    })!;
    expect(junk.tempEntryUnit).toBeNull();
    expect(junk.chipStatus).toBeNull();
  });
  it("ignores empty or missing drafts", () => {
    expect(restorableQuickLogObservationDraft(draft("plant:a", "  "), "plant:a")).toBeNull();
    expect(restorableQuickLogObservationDraft(null, "plant:a")).toBeNull();
  });
});

describe("quick log observation draft slots (#2806)", () => {
  it("keeps one storage id per plant or tent, and a separate id when there is no target", () => {
    expect(quickLogObservationDraftStorageId("plant:a")).toBe(
      "quick-log-v2-observation.target.plant:a",
    );
    expect(quickLogObservationDraftStorageId(" tent:tent-1 ")).toBe(
      "quick-log-v2-observation.target.tent:tent-1",
    );
    expect(quickLogObservationDraftStorageId(null)).toBe("quick-log-v2-observation.target.none");
    expect(quickLogObservationDraftStorageId("grow:1")).toBe(
      "quick-log-v2-observation.target.none",
    );
  });

  it("moves an untargeted note onto the first empty target and never from one target onto another", () => {
    expect(
      quickLogObservationDraftTargetMove({
        fromTarget: null,
        toTarget: "plant:a",
        fromEmpty: false,
        toEmpty: true,
      }),
    ).toBe("move-onto-target");
    expect(
      quickLogObservationDraftTargetMove({
        fromTarget: "plant:a",
        toTarget: "tent:b",
        fromEmpty: false,
        toEmpty: true,
      }),
    ).toBe("stay");
    expect(
      quickLogObservationDraftTargetMove({
        fromTarget: null,
        toTarget: "plant:a",
        fromEmpty: false,
        toEmpty: false,
      }),
    ).toBe("stay");
    expect(
      quickLogObservationDraftTargetMove({
        fromTarget: null,
        toTarget: "plant:a",
        fromEmpty: true,
        toEmpty: true,
      }),
    ).toBe("stay");
  });

  it("warns only when the observation is not empty", () => {
    const empty = draft("plant:a", "  ").form;
    expect(shouldWarnBeforeLeavingQuickLogObservation(empty, null)).toBe(false);
    expect(shouldWarnBeforeLeavingQuickLogObservation({ ...empty, note: "half typed" }, null)).toBe(
      true,
    );
  });
});

describe("startRoomSaveErrorWithReason", () => {
  it("appends the server reason to the plain copy", () => {
    expect(startRoomSaveErrorWithReason("grow", "plan limit reached")).toBe(
      `${plainStartRoomSaveError("grow")} Reason: plan limit reached`,
    );
  });
  it("falls back to the plain copy for no reason or the generic fallback", () => {
    expect(startRoomSaveErrorWithReason("tent", undefined)).toBe(plainStartRoomSaveError("tent"));
    expect(startRoomSaveErrorWithReason("tent", "Could not create record")).toBe(
      plainStartRoomSaveError("tent"),
    );
  });
  it("caps a long reason", () => {
    const out = startRoomSaveErrorWithReason("plant", "x".repeat(500));
    expect(out.length).toBe(`${plainStartRoomSaveError("plant")} Reason: `.length + 200);
  });
});

describe("isStartRoomRetryableSaveError", () => {
  it("accepts definitive save rejections, with or without a reason", () => {
    expect(isStartRoomRetryableSaveError(plainStartRoomSaveError("grow"))).toBe(true);
    expect(isStartRoomRetryableSaveError(startRoomSaveErrorWithReason("plant", "rls"))).toBe(true);
  });
  it("rejects errors that never attempted a save, and empty input", () => {
    expect(isStartRoomRetryableSaveError("Enter a grow name to continue.")).toBe(false);
    expect(
      isStartRoomRetryableSaveError(
        "Verdant could not confirm whether this grow was saved. Refresh before adding another.",
      ),
    ).toBe(false);
    expect(isStartRoomRetryableSaveError(`${plainStartRoomSaveError("tent")} extra`)).toBe(false);
    expect(isStartRoomRetryableSaveError(null)).toBe(false);
  });
});

describe("adoptablePendingGrowId", () => {
  const base = { step: "grow", growId: null, pendingGrowId: "g1", ownedGrowIds: ["g1"] };
  it("adopts a pending grow id that is already an owned grow", () => {
    expect(adoptablePendingGrowId(base)).toBe("g1");
  });
  it("does nothing off the grow step, with a grow already set, or for an unknown id", () => {
    expect(adoptablePendingGrowId({ ...base, step: "tent" })).toBeNull();
    expect(adoptablePendingGrowId({ ...base, growId: "g0" })).toBeNull();
    expect(adoptablePendingGrowId({ ...base, ownedGrowIds: ["g2"] })).toBeNull();
    expect(adoptablePendingGrowId({ ...base, pendingGrowId: null })).toBeNull();
  });
});

describe("parseStartYourRoomDraft plant stage (Copilot review)", () => {
  const stored = (plantStage: unknown) =>
    parseStartYourRoomDraft({
      step: "plant",
      form: { growName: "", tentName: "", plantName: "Plant 1", plantStage },
      ids: { growId: null, tentId: null, plantId: null },
      pendingRowIds: { grow: null, tent: null, plant: null },
      saveError: null,
    })?.form.plantStage;

  it("keeps a stage the form offers", () => {
    expect(stored("veg")).toBe("veg");
    expect(stored("flower")).toBe("flower");
  });

  it("falls back to seedling for an unknown or missing stage", () => {
    expect(stored("bogus")).toBe("seedling");
    expect(stored(undefined)).toBe("seedling");
    expect(stored(3)).toBe("seedling");
  });
});
