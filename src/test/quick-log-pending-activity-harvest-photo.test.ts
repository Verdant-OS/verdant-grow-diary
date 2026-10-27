/**
 * A pending harvest record keeps its already-uploaded photo path, so a retry
 * of an unconfirmed save replays the same p_photo_url. Only harvest records
 * may carry one, and only inside the owner's own folder.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  claimPendingQuickLogActivity,
  readPendingQuickLogActivity,
  type PendingQuickLogActivity,
} from "@/lib/quickLogPendingActivityStore";

const harvest: PendingQuickLogActivity = {
  version: 1,
  ownerId: "owner-a",
  createdAt: "2026-09-26T00:00:00.000Z",
  input: {
    activityId: "harvest",
    growId: "grow-a",
    tentId: "tent-a",
    plantId: "plant-a",
    note: null,
    occurredAt: "2026-09-26T00:00:00.000Z",
    extraDetails: null,
    idempotencyKey: "activity-attempt-harvest",
    photoUrl: "owner-a/grow-a/1.jpg",
  },
  receipt: { symptomCheck: false, harvestDetails: null },
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("pending harvest photo path", () => {
  it("keeps the uploaded photo path so a retry replays the same photo", () => {
    expect(claimPendingQuickLogActivity(harvest)).toEqual({ status: "claimed", record: harvest });
    expect(readPendingQuickLogActivity(harvest.ownerId, harvest.input)).toEqual({
      status: "pending",
      record: harvest,
    });
  });

  it("refuses a photo path on a non-harvest record", () => {
    expect(
      claimPendingQuickLogActivity({
        ...harvest,
        input: { ...harvest.input, activityId: "training" },
      }),
    ).toEqual({ status: "blocked" });
  });

  it("refuses a photo path outside the owner's folder", () => {
    expect(
      claimPendingQuickLogActivity({
        ...harvest,
        input: { ...harvest.input, photoUrl: "owner-b/grow-a/1.jpg" },
      }),
    ).toEqual({ status: "blocked" });
  });
});
