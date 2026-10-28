import { describe, expect, it } from "vitest";
import {
  parseQuickLogObservationDraft,
  QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
  quickLogObservationDraftRestoredCopy,
  restorableQuickLogObservationDraft,
} from "@/lib/quickLogObservationDraftRules";
import {
  adoptablePendingGrowId,
  isStartRoomRetryableSaveError,
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
  it("never lets a draft pick a target when the sheet has none", () => {
    for (const none of [null, undefined, ""]) {
      const restored = restorableQuickLogObservationDraft(draft("plant:a"), none);
      expect(restored?.form.note).toBe("pale leaves");
      expect(restored?.form.selectedKey).toBeNull();
      // The old target's failed save and key stay behind.
      expect(restored?.saveFailed).toBe(false);
      expect(restored?.idempotencyKey).toBeNull();
      expect(quickLogObservationDraftRestoredCopy(restored!)).toBe(
        QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY,
      );
    }
    expect(restorableQuickLogObservationDraft(draft(null), null)).not.toBeNull();
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
