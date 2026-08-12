/**
 * Pheno evidence reconciliation for Quick Log retractions (issue #786).
 *
 * parsePhenoEvidenceReceiptRow is the choke point every pheno receipt read
 * flows through; a retracted receipt must be rejected there so coverage
 * counts and `recorded` flags reconcile. Legacy rows without the column
 * must keep parsing exactly as before.
 */
import { describe, expect, it } from "vitest";

import {
  buildPhenoEvidenceCoverage,
  parsePhenoEvidenceReceiptRow,
  type RawPhenoEvidenceDiaryRow,
} from "@/lib/phenoEvidenceCaptureRules";

const HUNT = "hunt-1";
const PLANT = "plant-1";

function receiptRow(overrides: Partial<RawPhenoEvidenceDiaryRow> = {}): RawPhenoEvidenceDiaryRow {
  return {
    id: "receipt-1",
    plant_id: PLANT,
    entry_at: "2026-08-10T12:00:00.000Z",
    photo_url: null,
    details: {
      kind: "pheno_evidence_receipt",
      receipt_version: 1,
      source: "manual",
      evidence_only: true,
      automatic_selection: false,
      action_queue_created: false,
      device_control: false,
      hunt_id: HUNT,
      evidence_goal: "vigor",
      stage: "veg",
    },
    ...overrides,
  };
}

describe("parsePhenoEvidenceReceiptRow retraction handling", () => {
  it("accepts a live receipt (legacy shape, no retracted_at field)", () => {
    expect(
      parsePhenoEvidenceReceiptRow(receiptRow(), { huntId: HUNT, plantId: PLANT }),
    ).not.toBeNull();
  });

  it("accepts a receipt with retracted_at explicitly null", () => {
    expect(
      parsePhenoEvidenceReceiptRow(receiptRow({ retracted_at: null }), {
        huntId: HUNT,
        plantId: PLANT,
      }),
    ).not.toBeNull();
  });

  it("rejects a retracted receipt", () => {
    expect(
      parsePhenoEvidenceReceiptRow(receiptRow({ retracted_at: "2026-08-11T09:00:00.000Z" }), {
        huntId: HUNT,
        plantId: PLANT,
      }),
    ).toBeNull();
  });
});

describe("buildPhenoEvidenceCoverage with retracted receipts", () => {
  it("drops retracted receipts from receiptCount, recorded, and completedCount", () => {
    const live = receiptRow({ id: "receipt-live" });
    const retracted = receiptRow({
      id: "receipt-retracted",
      retracted_at: "2026-08-11T09:00:00.000Z",
    });

    const before = buildPhenoEvidenceCoverage({
      configuredGoals: ["vigor"],
      diaryRows: [live, retracted],
      huntId: HUNT,
      plantId: PLANT,
    });
    expect(before.goals[0].receiptCount).toBe(1);
    expect(before.goals[0].recorded).toBe(true);
    expect(before.completedCount).toBe(1);

    const after = buildPhenoEvidenceCoverage({
      configuredGoals: ["vigor"],
      diaryRows: [retracted],
      huntId: HUNT,
      plantId: PLANT,
    });
    expect(after.goals[0].receiptCount).toBe(0);
    expect(after.goals[0].recorded).toBe(false);
    expect(after.completedCount).toBe(0);
    expect(after.receipts).toHaveLength(0);
  });
});
