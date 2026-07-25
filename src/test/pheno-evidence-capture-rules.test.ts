import { describe, expect, it } from "vitest";
import {
  PHENO_EVIDENCE_RECEIPT_KIND,
  buildPhenoEvidenceCoverage,
  buildPhenoEvidenceReceiptDetails,
  parsePhenoEvidenceReceiptRow,
  sanitizeConfiguredPhenoEvidenceGoals,
  type RawPhenoEvidenceDiaryRow,
} from "@/lib/phenoEvidenceCaptureRules";

const HUNT_ID = "hunt-1";
const PLANT_ID = "plant-1";

function row(overrides: Partial<RawPhenoEvidenceDiaryRow> = {}): RawPhenoEvidenceDiaryRow {
  return {
    id: "diary-1",
    plant_id: PLANT_ID,
    entry_at: "2026-07-14T12:00:00Z",
    photo_url: null,
    details: buildPhenoEvidenceReceiptDetails({
      huntId: HUNT_ID,
      plantId: PLANT_ID,
      evidenceGoal: "structure",
      stage: "flower",
    }),
    ...overrides,
  };
}

describe("phenoEvidenceCaptureRules", () => {
  it("builds a bounded manual evidence-only receipt with explicit safety fences", () => {
    expect(
      buildPhenoEvidenceReceiptDetails({
        huntId: HUNT_ID,
        plantId: PLANT_ID,
        evidenceGoal: "aroma",
        stage: "FLOWER",
      }),
    ).toEqual({
      kind: PHENO_EVIDENCE_RECEIPT_KIND,
      receipt_version: 1,
      source: "manual",
      evidence_only: true,
      hunt_id: HUNT_ID,
      plant_id: PLANT_ID,
      evidence_goal: "aroma",
      stage: "flower",
      automatic_selection: false,
      action_queue_created: false,
      device_control: false,
    });
  });

  it("fails closed for missing ids or unknown evidence goals", () => {
    expect(
      buildPhenoEvidenceReceiptDetails({
        huntId: "",
        plantId: PLANT_ID,
        evidenceGoal: "aroma",
      }),
    ).toBeNull();
    expect(
      buildPhenoEvidenceReceiptDetails({
        huntId: HUNT_ID,
        plantId: PLANT_ID,
        evidenceGoal: "yield_prediction",
      }),
    ).toBeNull();
  });

  it("keeps an unknown stage unknown rather than inventing a stage", () => {
    expect(
      buildPhenoEvidenceReceiptDetails({
        huntId: HUNT_ID,
        plantId: PLANT_ID,
        evidenceGoal: "vigor",
        stage: "probably flower",
      })?.stage,
    ).toBeNull();
  });

  it("sanitizes configured goals without inventing defaults", () => {
    expect(
      sanitizeConfiguredPhenoEvidenceGoals(["vigor", "unknown", "vigor", null, "structure"]),
    ).toEqual(["vigor", "structure"]);
    expect(sanitizeConfiguredPhenoEvidenceGoals(null)).toEqual([]);
  });

  it("parses photo and source-honest sensor context without a health claim", () => {
    const details = {
      ...buildPhenoEvidenceReceiptDetails({
        huntId: HUNT_ID,
        plantId: PLANT_ID,
        evidenceGoal: "structure",
        stage: "veg",
      }),
      sensor: {
        source: "vendor-string-not-for-display",
        freshness: "stale",
        captured_at: "2026-07-14T11:45:00Z",
        status: "stale",
      },
    };
    const parsed = parsePhenoEvidenceReceiptRow(
      row({ photo_url: "https://example.test/photo.jpg", details }),
      { huntId: HUNT_ID, plantId: PLANT_ID },
    );
    expect(parsed?.hasPhoto).toBe(true);
    expect(parsed?.sensorContext).toEqual({
      attached: true,
      freshness: "stale",
      capturedAt: "2026-07-14T11:45:00.000Z",
    });
    expect(JSON.stringify(parsed)).not.toContain("vendor-string-not-for-display");
    expect(JSON.stringify(parsed)).not.toMatch(/healthy/i);
  });

  it("rejects a stale or forged receipt whose row, hunt, or safety fence does not match", () => {
    expect(
      parsePhenoEvidenceReceiptRow(row({ plant_id: "another-plant" }), {
        huntId: HUNT_ID,
        plantId: PLANT_ID,
      }),
    ).toBeNull();
    expect(
      parsePhenoEvidenceReceiptRow(
        row({
          details: {
            ...buildPhenoEvidenceReceiptDetails({
              huntId: HUNT_ID,
              plantId: PLANT_ID,
              evidenceGoal: "structure",
            }),
            automatic_selection: true,
          },
        }),
        { huntId: HUNT_ID, plantId: PLANT_ID },
      ),
    ).toBeNull();
  });

  it("builds deterministic recorded-vs-missing coverage in configured order", () => {
    const coverage = buildPhenoEvidenceCoverage({
      configuredGoals: ["vigor", "structure", "aroma"],
      diaryRows: [
        row({ id: "diary-b", entry_at: "2026-07-14T13:00:00Z" }),
        row({ id: "diary-a", entry_at: "2026-07-14T13:00:00Z" }),
      ],
      huntId: HUNT_ID,
      plantId: PLANT_ID,
    });
    expect(coverage.goals.map((goal) => [goal.id, goal.recorded, goal.receiptCount])).toEqual([
      ["vigor", false, 0],
      ["structure", true, 2],
      ["aroma", false, 0],
    ]);
    expect(coverage.completedCount).toBe(1);
    expect(coverage.totalCount).toBe(3);
    expect(coverage.receipts.map((receipt) => receipt.diaryEntryId)).toEqual([
      "diary-a",
      "diary-b",
    ]);
  });

  it("counts a stored receipt whose details.plant_id the save RPC stripped", () => {
    // quicklog_save_manual scrubs plant_id (and user/grow/tent ids) out of the
    // client-supplied details blob, so every persisted receipt lacks one. The
    // row's own plant_id column is authoritative. Regression: requiring
    // details.plant_id rejected every real receipt and pinned coverage at 0.
    const stored = {
      ...buildPhenoEvidenceReceiptDetails({
        huntId: HUNT_ID,
        plantId: PLANT_ID,
        evidenceGoal: "structure",
        stage: "flower",
      }),
    } as Record<string, unknown>;
    delete stored.plant_id;

    expect(
      parsePhenoEvidenceReceiptRow(row({ details: stored }), {
        huntId: HUNT_ID,
        plantId: PLANT_ID,
      })?.plantId,
    ).toBe(PLANT_ID);

    const coverage = buildPhenoEvidenceCoverage({
      configuredGoals: ["structure", "aroma"],
      diaryRows: [row({ details: stored })],
      huntId: HUNT_ID,
      plantId: PLANT_ID,
    });
    expect(coverage.completedCount).toBe(1);
  });

  it("still rejects a scrubbed receipt whose row belongs to another candidate", () => {
    const stored = {
      ...buildPhenoEvidenceReceiptDetails({
        huntId: HUNT_ID,
        plantId: PLANT_ID,
        evidenceGoal: "structure",
      }),
    } as Record<string, unknown>;
    delete stored.plant_id;
    expect(
      parsePhenoEvidenceReceiptRow(row({ details: stored, plant_id: "another-plant" }), {
        huntId: HUNT_ID,
        plantId: PLANT_ID,
      }),
    ).toBeNull();
  });

  it("rejects a legacy receipt whose details.plant_id contradicts its row", () => {
    const forged = {
      ...buildPhenoEvidenceReceiptDetails({
        huntId: HUNT_ID,
        plantId: PLANT_ID,
        evidenceGoal: "structure",
      }),
      plant_id: "another-plant",
    };
    expect(
      parsePhenoEvidenceReceiptRow(row({ details: forged }), {
        huntId: HUNT_ID,
        plantId: PLANT_ID,
      }),
    ).toBeNull();
  });

  it("does not count valid receipts for goals that are not configured for the hunt", () => {
    const coverage = buildPhenoEvidenceCoverage({
      configuredGoals: ["aroma"],
      diaryRows: [row()],
      huntId: HUNT_ID,
      plantId: PLANT_ID,
    });
    expect(coverage.completedCount).toBe(0);
    expect(coverage.receipts).toEqual([]);
  });
});
