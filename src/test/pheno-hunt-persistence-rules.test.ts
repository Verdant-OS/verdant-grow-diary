import { describe, it, expect } from "vitest";
import {
  validatePhenoHuntForPersistence,
  isPhenoHuntDraftSavable,
} from "@/lib/phenoHuntPersistenceRules";
import type {
  CandidatePlant,
  CandidateSelection,
  PhenoHuntDraft,
} from "@/lib/phenoHuntStartPageRules";

const plant = (over: Partial<CandidatePlant> = {}): CandidatePlant => ({
  id: "p1",
  name: "Plant 1",
  strain: "BB",
  stage: "veg",
  growId: "g1",
  tentId: "t1",
  isArchived: false,
  ...over,
});

const validDraft = (over: Partial<PhenoHuntDraft> = {}): PhenoHuntDraft => ({
  huntName: "Hunt A",
  cultivar: "Blue Berry",
  projectGoal: "keeper_selection",
  startDate: "2026-06-01",
  growId: "g1",
  tentId: "t1",
  ...over,
});

const selection = (over: Partial<CandidateSelection> = {}): CandidateSelection => ({
  plantId: "p1",
  label: "BB-01",
  ...over,
});

describe("phenoHuntPersistenceRules", () => {
  it("accepts a valid draft with selections", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft(),
      selections: [selection()],
      plants: [plant()],
    });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(isPhenoHuntDraftSavable({
      draft: validDraft(),
      selections: [selection()],
      plants: [plant()],
    })).toBe(true);
  });

  it("rejects missing growId", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft({ growId: null }),
      selections: [selection()],
      plants: [plant()],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.map((e) => e.code)).toContain("grow_id_required");
  });

  it("rejects missing required fields", () => {
    const res = validatePhenoHuntForPersistence({
      draft: { huntName: "", cultivar: "", projectGoal: null, startDate: "", growId: null, tentId: null },
      selections: [],
      plants: [],
    });
    const codes = res.errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining([
      "hunt_name_required",
      "cultivar_required",
      "project_goal_required",
      "start_date_required",
      "grow_id_required",
      "no_candidates",
    ]));
  });

  it("rejects zero candidates", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft(),
      selections: [],
      plants: [plant()],
    });
    expect(res.errors.map((e) => e.code)).toContain("no_candidates");
  });

  it("rejects duplicate candidate labels (case-insensitive)", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft(),
      selections: [
        selection({ plantId: "p1", label: "BB-01" }),
        selection({ plantId: "p2", label: "bb-01" }),
      ],
      plants: [plant({ id: "p1" }), plant({ id: "p2" })],
    });
    expect(res.errors.map((e) => e.code)).toContain("candidate_labels_duplicated");
  });

  it("rejects blank candidate labels", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft(),
      selections: [selection({ label: "   " })],
      plants: [plant()],
    });
    expect(res.errors.map((e) => e.code)).toContain("candidate_label_blank");
  });

  it("rejects plant from wrong grow", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft(),
      selections: [selection({ plantId: "p1" })],
      plants: [plant({ id: "p1", growId: "other-grow" })],
    });
    expect(res.errors.map((e) => e.code)).toContain("candidate_plant_wrong_grow");
  });

  it("rejects plant from wrong tent when tentId selected", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft({ tentId: "t1" }),
      selections: [selection({ plantId: "p1" })],
      plants: [plant({ id: "p1", tentId: "other-tent" })],
    });
    expect(res.errors.map((e) => e.code)).toContain("candidate_plant_wrong_tent");
  });

  it("allows plant from any tent when no tent selected", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft({ tentId: null }),
      selections: [selection({ plantId: "p1" })],
      plants: [plant({ id: "p1", tentId: "anything" })],
    });
    expect(res.ok).toBe(true);
  });

  it("rejects invalid project goal", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft({ projectGoal: "totally_bogus" as never }),
      selections: [selection()],
      plants: [plant()],
    });
    expect(res.errors.map((e) => e.code)).toContain("project_goal_invalid");
  });

  it("rejects unknown candidate plant id", () => {
    const res = validatePhenoHuntForPersistence({
      draft: validDraft(),
      selections: [selection({ plantId: "ghost" })],
      plants: [plant({ id: "p1" })],
    });
    expect(res.errors.map((e) => e.code)).toContain("candidate_plant_unknown");
  });
});
