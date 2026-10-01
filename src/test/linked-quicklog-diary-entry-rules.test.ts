import { describe, expect, it } from "vitest";
import { canRemoveDiaryEntry, isLinkedQuickLogDiaryDetails } from "@/lib/diaryEntryRemovalRules";

const viewer = { currentUserId: "owner-1" };

describe("linked Quick Log diary entry integrity", () => {
  it("does not offer hard removal for a linked Quick Log companion", () => {
    const entry = {
      id: "diary-1",
      kind: "diary",
      ownerUserId: "owner-1",
      details: { linked_grow_event_id: "event-1" },
    };

    expect(canRemoveDiaryEntry(entry, viewer)).toBe(false);
  });

  it("preserves ordinary owner diary removal", () => {
    const entry = { id: "diary-2", kind: "diary", ownerUserId: "owner-1", details: {} };

    expect(canRemoveDiaryEntry(entry, viewer)).toBe(true);
    expect(canRemoveDiaryEntry(entry, viewer)).toBe(true);
  });

  it("treats the legacy link alias and even a null link marker as protected", () => {
    expect(isLinkedQuickLogDiaryDetails({ grow_event_id: "event-1" })).toBe(true);
    expect(isLinkedQuickLogDiaryDetails({ linked_grow_event_id: null })).toBe(true);
    expect(isLinkedQuickLogDiaryDetails({ linked_grow_event_id: "" })).toBe(true);
  });

  it.each([null, undefined, [], "", 0, {}, { arbitrary: "value" }])(
    "treats malformed or ordinary details as unlinked: %s",
    (details) => {
      expect(isLinkedQuickLogDiaryDetails(details)).toBe(false);
      expect(isLinkedQuickLogDiaryDetails(details)).toBe(false);
    },
  );
});
