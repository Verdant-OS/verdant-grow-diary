import { describe, expect, it } from "vitest";
import {
  ACTION_FOLLOWUP_OUTCOMES,
  ACTION_FOLLOWUP_OUTCOMES_REQUIRING_NOTE,
  actionFollowUpRequiresNote,
  evaluateActionFollowUpEligibility,
  validateActionFollowUpDraft,
} from "@/lib/actionFollowUpEvidenceRules";

const base = {
  actionId: "act-1",
  actionStatus: "completed",
  growId: "grow-1",
  tentId: "tent-1",
  plantId: "plant-1",
  existingFollowUpCount: 0,
  currentUserOwnsAction: true,
};

describe("evaluateActionFollowUpEligibility", () => {
  it("completed owned action with grow is eligible", () => {
    expect(evaluateActionFollowUpEligibility(base)).toEqual({ eligible: true });
  });

  it("null input is missing_action", () => {
    expect(evaluateActionFollowUpEligibility(null)).toEqual({
      eligible: false,
      reason: "missing_action",
    });
  });

  it("missing actionId is missing_action", () => {
    expect(
      evaluateActionFollowUpEligibility({ ...base, actionId: "  " }),
    ).toEqual({ eligible: false, reason: "missing_action" });
  });

  it("suggested action is action_not_completed", () => {
    expect(
      evaluateActionFollowUpEligibility({ ...base, actionStatus: "pending_approval" }),
    ).toEqual({ eligible: false, reason: "action_not_completed" });
  });

  it("approved but not completed is action_not_completed", () => {
    expect(
      evaluateActionFollowUpEligibility({ ...base, actionStatus: "approved" }),
    ).toEqual({ eligible: false, reason: "action_not_completed" });
  });

  it("rejected action is action_not_completed", () => {
    expect(
      evaluateActionFollowUpEligibility({ ...base, actionStatus: "rejected" }),
    ).toEqual({ eligible: false, reason: "action_not_completed" });
  });

  it("cross-user action is wrong_owner", () => {
    expect(
      evaluateActionFollowUpEligibility({ ...base, currentUserOwnsAction: false }),
    ).toEqual({ eligible: false, reason: "wrong_owner" });
  });

  it("missing grow is missing_grow", () => {
    expect(
      evaluateActionFollowUpEligibility({ ...base, growId: null }),
    ).toEqual({ eligible: false, reason: "missing_grow" });
  });

  it("existing follow-up blocks a second primary follow-up", () => {
    expect(
      evaluateActionFollowUpEligibility({ ...base, existingFollowUpCount: 1 }),
    ).toEqual({ eligible: false, reason: "follow_up_already_exists" });
  });

  it("is deterministic for the same input", () => {
    const a = evaluateActionFollowUpEligibility(base);
    const b = evaluateActionFollowUpEligibility({ ...base });
    expect(a).toEqual(b);
  });
});

describe("validateActionFollowUpDraft", () => {
  const good = {
    actionQueueId: "act-1",
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
    outcome: "improved",
    note: "leaf color perked up",
    observedAt: "2026-07-11T12:00:00.000Z",
  };

  it("accepts a minimal valid draft", () => {
    const res = validateActionFollowUpDraft(good);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.draft.outcome).toBe("improved");
      expect(res.draft.photoReference).toBeNull();
      expect(res.draft.sensorSnapshotId).toBeNull();
    }
  });

  it("rejects null input", () => {
    expect(validateActionFollowUpDraft(null)).toEqual({
      ok: false,
      reason: "missing_action_id",
    });
  });

  it("rejects missing action id", () => {
    expect(validateActionFollowUpDraft({ ...good, actionQueueId: "" })).toEqual({
      ok: false,
      reason: "missing_action_id",
    });
  });

  it("rejects missing grow id", () => {
    expect(validateActionFollowUpDraft({ ...good, growId: null })).toEqual({
      ok: false,
      reason: "missing_grow_id",
    });
  });

  it("rejects invalid outcome", () => {
    expect(validateActionFollowUpDraft({ ...good, outcome: "recovered" })).toEqual({
      ok: false,
      reason: "invalid_outcome",
    });
  });

  it("rejects invalid observedAt", () => {
    expect(validateActionFollowUpDraft({ ...good, observedAt: "not-a-date" })).toEqual({
      ok: false,
      reason: "invalid_observed_at",
    });
  });

  it("requires a note when outcome is declined", () => {
    expect(
      validateActionFollowUpDraft({ ...good, outcome: "declined", note: "  " }),
    ).toEqual({ ok: false, reason: "note_required" });
  });

  it("requires a note when outcome is unclear", () => {
    expect(
      validateActionFollowUpDraft({ ...good, outcome: "unclear", note: "" }),
    ).toEqual({ ok: false, reason: "note_required" });
  });

  it("does not require a note when outcome is improved", () => {
    const res = validateActionFollowUpDraft({ ...good, outcome: "improved", note: "" });
    expect(res.ok).toBe(true);
  });

  it("rejects signed URLs as photo reference", () => {
    expect(
      validateActionFollowUpDraft({
        ...good,
        photoReference: "https://example.com/img?token=abc",
      }),
    ).toEqual({ ok: false, reason: "invalid_photo_reference" });
  });

  it("rejects blob URLs as photo reference", () => {
    expect(
      validateActionFollowUpDraft({ ...good, photoReference: "blob:https://x/abc" }),
    ).toEqual({ ok: false, reason: "invalid_photo_reference" });
  });

  it("rejects data URLs as photo reference", () => {
    expect(
      validateActionFollowUpDraft({ ...good, photoReference: "data:image/png;base64,AAA" }),
    ).toEqual({ ok: false, reason: "invalid_photo_reference" });
  });

  it("accepts a durable storage:// reference", () => {
    const res = validateActionFollowUpDraft({
      ...good,
      photoReference: "storage://diary-photos/uid/plant/1.jpg",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.draft.photoReference).toBe("storage://diary-photos/uid/plant/1.jpg");
    }
  });

  it("trims and preserves note, caps at 1000", () => {
    const long = "x".repeat(1500);
    const res = validateActionFollowUpDraft({ ...good, note: `  ${long}  ` });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.draft.note.length).toBe(1000);
  });

  it("nulls optional tent/plant when blank", () => {
    const res = validateActionFollowUpDraft({ ...good, tentId: "  ", plantId: null });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.draft.tentId).toBeNull();
      expect(res.draft.plantId).toBeNull();
    }
  });
});

describe("outcome metadata", () => {
  it("exposes the five outcomes", () => {
    expect(ACTION_FOLLOWUP_OUTCOMES).toEqual([
      "improved",
      "unchanged",
      "declined",
      "too_soon",
      "unclear",
    ]);
  });

  it("marks declined+unclear as note-required", () => {
    expect(ACTION_FOLLOWUP_OUTCOMES_REQUIRING_NOTE).toEqual(["declined", "unclear"]);
    expect(actionFollowUpRequiresNote("declined")).toBe(true);
    expect(actionFollowUpRequiresNote("unclear")).toBe(true);
    expect(actionFollowUpRequiresNote("improved")).toBe(false);
    expect(actionFollowUpRequiresNote("unchanged")).toBe(false);
    expect(actionFollowUpRequiresNote("too_soon")).toBe(false);
  });
});
