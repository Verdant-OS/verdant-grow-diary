import { describe, it, expect } from "vitest";
import { buildPhenoHuntCsv, csvField } from "@/lib/phenoHuntCsvExport";
import { buildPhenoCandidateEvidencePacket } from "@/lib/phenoEvidencePacket";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import type { RawPhenoEvidenceDiaryRow } from "@/lib/phenoEvidenceCaptureRules";

function candidate(id: string): PhenoCandidateInput {
  return { candidateId: id, candidateLabel: id.toUpperCase(), plantLabel: id };
}

function receipt(goal: string): RawPhenoEvidenceDiaryRow {
  return {
    id: `d-${goal}`,
    plant_id: "p1",
    entry_at: "2026-07-10T12:00:00.000Z",
    photo_url: null,
    details: {
      kind: "pheno_evidence_receipt",
      receipt_version: 1,
      source: "manual",
      evidence_only: true,
      hunt_id: "hunt-1",
      plant_id: "p1",
      evidence_goal: goal,
      stage: null,
      automatic_selection: false,
      action_queue_created: false,
      device_control: false,
    },
  };
}

const BASE = {
  huntName: "Hunt",
  huntId: "hunt-1",
  candidates: [candidate("p1"), candidate("p2")],
  scoresByPlant: {},
  decisionsByPlant: {},
  sexByPlant: {},
  smokeByPlant: {},
  labByKey: {},
  exportedAt: "2026-07-14T20:00:00.000Z",
};

function rowsOf(csv: string): string[][] {
  return csv
    .trim()
    .split("\r\n")
    .map((line) => line.split(","));
}

function col(rows: string[][], name: string): number {
  const idx = rows[0].indexOf(name);
  expect(idx, `column ${name}`).toBeGreaterThan(-1);
  return idx;
}

describe("pheno CSV — manual evidence coverage columns", () => {
  const packets = new Map([
    [
      "p1",
      buildPhenoCandidateEvidencePacket({
        huntId: "hunt-1",
        plantId: "p1",
        configuredGoals: ["structure", "aroma"],
        rows: [receipt("aroma")],
      }),
    ],
  ]);

  it("exports per-candidate coverage and blanks-with-unavailable when absent", () => {
    const rows = rowsOf(
      buildPhenoHuntCsv({
        ...BASE,
        evidencePacketsByPlant: packets,
        loadedCandidateCount: 2,
        totalCandidateCount: 10,
      }),
    );
    const p1 = rows[1];
    expect(p1[col(rows, "configured_goal_count")]).toBe("2");
    expect(p1[col(rows, "recorded_goal_count")]).toBe("1");
    expect(p1[col(rows, "missing_goal_ids")]).toBe("structure");
    expect(p1[col(rows, "latest_manual_evidence_at")]).toBe("2026-07-10T12:00:00.000Z");
    expect(p1[col(rows, "manual_receipt_count")]).toBe("1");
    expect(p1[col(rows, "manual_evidence_status")]).toBe("partial");
    expect(p1[col(rows, "manual_evidence_truncated")]).toBe("no");
    // p2 has no packet: honest unavailable, blank counts.
    const p2 = rows[2];
    expect(p2[col(rows, "manual_evidence_status")]).toBe("unavailable");
    expect(p2[col(rows, "configured_goal_count")]).toBe("");
    expect(p2[col(rows, "manual_receipt_count")]).toBe("");
  });

  it("export_scope stays loaded_candidates when the page is not the whole hunt", () => {
    const rows = rowsOf(
      buildPhenoHuntCsv({
        ...BASE,
        evidencePacketsByPlant: packets,
        loadedCandidateCount: 2,
        totalCandidateCount: 10,
      }),
    );
    expect(rows[1][col(rows, "export_scope")]).toBe("loaded_candidates");
    expect(rows[1][col(rows, "loaded_candidate_count")]).toBe("2");
    expect(rows[1][col(rows, "total_candidate_count")]).toBe("10");
  });

  it("export_scope claims complete_hunt only when loaded equals the known total", () => {
    const complete = rowsOf(
      buildPhenoHuntCsv({ ...BASE, loadedCandidateCount: 2, totalCandidateCount: 2 }),
    );
    expect(complete[1][col(complete, "export_scope")]).toBe("complete_hunt");
    const unknownTotal = rowsOf(buildPhenoHuntCsv({ ...BASE, totalCandidateCount: null }));
    expect(unknownTotal[1][col(unknownTotal, "export_scope")]).toBe("loaded_candidates");
  });

  it("unavailable packets blank every receipt-derived field (failed read ≠ zero evidence)", () => {
    const unavailable = new Map([
      [
        "p1",
        buildPhenoCandidateEvidencePacket({
          huntId: "hunt-1",
          plantId: "p1",
          configuredGoals: ["structure", "aroma"],
          rows: [],
          unavailable: true,
        }),
      ],
    ]);
    const rows = rowsOf(buildPhenoHuntCsv({ ...BASE, evidencePacketsByPlant: unavailable }));
    const r = rows[1];
    expect(r[col(rows, "manual_evidence_status")]).toBe("unavailable");
    // Receipt-derived fields blank — never 0 / all-missing.
    expect(r[col(rows, "recorded_goal_count")]).toBe("");
    expect(r[col(rows, "missing_goal_ids")]).toBe("");
    expect(r[col(rows, "manual_receipt_count")]).toBe("");
    expect(r[col(rows, "latest_manual_evidence_at")]).toBe("");
    expect(r[col(rows, "manual_evidence_truncated")]).toBe("");
  });

  it("truncated packets export truncated status, never complete", () => {
    const truncated = new Map([
      [
        "p1",
        buildPhenoCandidateEvidencePacket({
          huntId: "hunt-1",
          plantId: "p1",
          configuredGoals: ["aroma"],
          rows: [receipt("aroma")],
          truncated: true,
        }),
      ],
    ]);
    const rows = rowsOf(buildPhenoHuntCsv({ ...BASE, evidencePacketsByPlant: truncated }));
    expect(rows[1][col(rows, "manual_evidence_status")]).toBe("truncated");
    expect(rows[1][col(rows, "manual_evidence_truncated")]).toBe("yes");
  });

  it("legacy callers without the new inputs still export (columns present, honest defaults)", () => {
    const rows = rowsOf(buildPhenoHuntCsv(BASE));
    expect(rows[0]).toContain("export_scope");
    expect(rows[1][col(rows, "manual_evidence_status")]).toBe("unavailable");
    expect(rows[1][col(rows, "export_scope")]).toBe("loaded_candidates");
    expect(rows[1][col(rows, "loaded_candidate_count")]).toBe("2");
    expect(rows[1][col(rows, "total_candidate_count")]).toBe("");
  });

  it("formula-injection guard regression holds for the new column path", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-x")).toBe("'-x");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("gas")).toBe("gas");
    expect(csvField(9)).toBe("9");
    expect(csvField(null)).toBe("");
  });
});
