import { describe, expect, it } from "vitest";
import {
  parseQuickLogObservationDraft,
  restorableQuickLogObservationDraft,
} from "@/lib/quickLogObservationDraftRules";
import {
  adoptablePendingGrowId,
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
    expect(restorableQuickLogObservationDraft(draft("plant:a"), null)).toBeNull();
    expect(restorableQuickLogObservationDraft(draft(null), null)).not.toBeNull();
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
