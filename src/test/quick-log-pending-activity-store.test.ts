import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogActivity,
  clearPendingQuickLogActivity,
  readPendingQuickLogActivity,
  type PendingQuickLogActivity,
} from "@/lib/quickLogPendingActivityStore";

const original: PendingQuickLogActivity = {
  version: 1,
  ownerId: "owner-a",
  createdAt: "2026-09-26T00:00:00.000Z",
  input: {
    activityId: "training",
    growId: "grow-a",
    tentId: "tent-a",
    plantId: "plant-a",
    note: "Observed training",
    extraDetails: { technique: "topping" },
    idempotencyKey: "activity-attempt-a",
  },
  receipt: { symptomCheck: false, harvestDetails: null },
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("pending Quick Log activity recovery", () => {
  it("claims and reads one exact payload without allowing an edited attempt to replace it", () => {
    expect(claimPendingQuickLogActivity(original)).toEqual({ status: "claimed", record: original });
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "pending",
      record: original,
    });
    expect(claimPendingQuickLogActivity(original)).toEqual({ status: "claimed", record: original });
    const edited: PendingQuickLogActivity = {
      ...original,
      input: { ...original.input, note: "Edited", idempotencyKey: "activity-attempt-b" },
    };
    expect(claimPendingQuickLogActivity(edited)).toEqual({ status: "pending", record: original });
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "pending",
      record: original,
    });
  });

  it("keeps another target and owner independent while the first is unresolved", () => {
    const otherTarget: PendingQuickLogActivity = {
      ...original,
      input: { ...original.input, plantId: "plant-b", idempotencyKey: "activity-attempt-b" },
    };
    const otherOwner: PendingQuickLogActivity = {
      ...original,
      ownerId: "owner-b",
      input: { ...original.input, idempotencyKey: "activity-attempt-c" },
    };
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    expect(claimPendingQuickLogActivity(otherTarget).status).toBe("claimed");
    expect(claimPendingQuickLogActivity(otherOwner).status).toBe("claimed");
    expect(readPendingQuickLogActivity("owner-a", otherTarget.input)).toEqual({
      status: "pending",
      record: otherTarget,
    });
    expect(readPendingQuickLogActivity("owner-b", original.input)).toEqual({
      status: "pending",
      record: otherOwner,
    });
  });

  it("clears only the unchanged record after confirmation", () => {
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    expect(
      clearPendingQuickLogActivity({ ...original, input: { ...original.input, note: "Edited" } }),
    ).toBe(false);
    expect(readPendingQuickLogActivity(original.ownerId, original.input).status).toBe("pending");
    expect(clearPendingQuickLogActivity(original)).toBe(true);
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "empty",
    });
  });

  it("fails closed for missing identity, corrupt storage, and a no-op storage write", () => {
    expect(readPendingQuickLogActivity(null, original.input)).toEqual({ status: "blocked" });
    expect(readPendingQuickLogActivity(original.ownerId, null)).toEqual({ status: "blocked" });
    expect(claimPendingQuickLogActivity(original).status).toBe("claimed");
    const key = window.sessionStorage.key(0);
    expect(key).not.toBeNull();
    window.sessionStorage.setItem(key!, "{not json");
    expect(readPendingQuickLogActivity(original.ownerId, original.input)).toEqual({
      status: "blocked",
    });
    expect(claimPendingQuickLogActivity(original).status).toBe("blocked");
    window.sessionStorage.clear();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    expect(claimPendingQuickLogActivity(original).status).toBe("blocked");
  });
});
