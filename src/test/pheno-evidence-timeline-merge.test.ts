import { describe, expect, it } from "vitest";
import {
  attachPhenoEvidenceReceiptsToActionEvents,
  buildPhenoEvidenceReceiptIndex,
} from "@/lib/phenoEvidenceTimelineMerge";
import { buildPhenoEvidenceReceiptDetails } from "@/lib/phenoEvidenceCaptureRules";
import type { QuickLogActionEvent } from "@/lib/quickLogTimelineGroupingViewModel";

const action: QuickLogActionEvent = {
  id: "event-1",
  kind: "note",
  source: "manual",
  plantId: "plant-1",
  tentId: "tent-1",
  occurredAt: "2026-07-14T12:00:00Z",
  noteText: "Strong lateral branching.",
};

function receiptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "diary-1",
    plant_id: "plant-1",
    tent_id: "tent-1",
    grow_id: "grow-1",
    entry_at: "2026-07-14T12:00:00.000Z",
    photo_url: null,
    details: buildPhenoEvidenceReceiptDetails({
      huntId: "hunt-1",
      plantId: "plant-1",
      evidenceGoal: "structure",
      stage: "flower",
    }),
    ...overrides,
  };
}

describe("phenoEvidenceTimelineMerge", () => {
  it("attaches the matching validated receipt without mutating the action", () => {
    const index = buildPhenoEvidenceReceiptIndex([receiptRow()]);
    const out = attachPhenoEvidenceReceiptsToActionEvents([action], index);
    expect(out[0]).not.toBe(action);
    expect(action.phenoEvidenceReceipt).toBeUndefined();
    expect(out[0].phenoEvidenceReceipt).toMatchObject({
      diaryEntryId: "diary-1",
      huntId: "hunt-1",
      plantId: "plant-1",
      evidenceGoal: "structure",
    });
  });

  it("does not attach across plant, tent, or timestamp boundaries", () => {
    for (const changed of [
      { plant_id: "plant-2" },
      { tent_id: "tent-2" },
      { entry_at: "2026-07-14T12:00:01Z" },
    ]) {
      const out = attachPhenoEvidenceReceiptsToActionEvents(
        [action],
        buildPhenoEvidenceReceiptIndex([receiptRow(changed)]),
      );
      expect(out[0]).toBe(action);
      expect(out[0].phenoEvidenceReceipt).toBeUndefined();
    }
  });

  it("ignores malformed receipts and non-note actions", () => {
    const malformed = receiptRow({ details: { kind: "pheno_evidence_receipt" } });
    expect(buildPhenoEvidenceReceiptIndex([malformed]).size).toBe(0);

    const water: QuickLogActionEvent = { ...action, kind: "water" };
    const out = attachPhenoEvidenceReceiptsToActionEvents(
      [water],
      buildPhenoEvidenceReceiptIndex([receiptRow()]),
    );
    expect(out[0]).toBe(water);
  });

  it("uses diary id as the deterministic tie-breaker on a timestamp collision", () => {
    const index = buildPhenoEvidenceReceiptIndex([
      receiptRow({ id: "second" }),
      receiptRow({ id: "first" }),
    ]);
    const out = attachPhenoEvidenceReceiptsToActionEvents([action], index);
    expect(out[0].phenoEvidenceReceipt?.diaryEntryId).toBe("first");
  });
});
