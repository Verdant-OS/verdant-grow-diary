import { describe, it, expect } from "vitest";
import {
  buildPhenoCandidatePostCureRollup,
  buildPhenoPostCureRollups,
  classifyPostCurePhase,
} from "@/lib/phenoCandidatePostCureViewModel";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

function candidate(overrides: Partial<PhenoCandidateInput> = {}): PhenoCandidateInput {
  return { candidateId: "p1", candidateLabel: "BD #1", ...overrides };
}

describe("classifyPostCurePhase", () => {
  it("classifies structured kinds into the furthest matching phase", () => {
    expect(classifyPostCurePhase("harvest")?.phase).toBe("harvest");
    expect(classifyPostCurePhase("chop")?.phase).toBe("harvest");
    expect(classifyPostCurePhase("hang-dry")?.phase).toBe("drying");
    expect(classifyPostCurePhase("jarred")?.phase).toBe("curing");
    expect(classifyPostCurePhase("burp")?.phase).toBe("curing");
  });

  it("prefers the furthest phase when a kind spans phases (dry-trim → drying)", () => {
    expect(classifyPostCurePhase("dry-trim")?.phase).toBe("drying");
  });

  it("does NOT classify unrelated or empty kinds", () => {
    expect(classifyPostCurePhase("watered")).toBeNull();
    expect(classifyPostCurePhase("transplant")).toBeNull();
    expect(classifyPostCurePhase("cutting")).toBeNull(); // clone activity, not harvest
    expect(classifyPostCurePhase("")).toBeNull();
    expect(classifyPostCurePhase(null)).toBeNull();
    expect(classifyPostCurePhase(undefined)).toBeNull();
  });
});

describe("buildPhenoCandidatePostCureRollup", () => {
  it("classifies ONLY structured kinds, never free-text notes (no overclaiming)", () => {
    // A veg-time note mentioning 'harvest' must NOT create a harvest milestone.
    const rollup = buildPhenoCandidatePostCureRollup(
      candidate({
        quickLogEntries: [
          {
            id: "q1",
            at: "2026-01-10T00:00:00Z",
            kind: "note",
            note: "planning to harvest next month",
          },
        ],
      }),
    );
    expect(rollup.milestoneCount).toBe(0);
    expect(rollup.furthestPhase).toBeNull();
    expect(rollup.missing.map((m) => m.code)).toContain("no_post_cure_activity");
  });

  it("rolls up harvest → drying → curing to the furthest phase", () => {
    const rollup = buildPhenoCandidatePostCureRollup(
      candidate({
        timelineEvents: [
          { id: "t1", at: "2026-02-01T00:00:00Z", kind: "harvest", summary: "Chopped" },
          { id: "t2", at: "2026-02-08T00:00:00Z", kind: "dry", summary: "Hung to dry" },
          { id: "t3", at: "2026-02-15T00:00:00Z", kind: "cure", summary: "Jarred, 62% RH" },
        ],
      }),
    );
    expect(rollup.furthestPhase).toBe("curing");
    expect(rollup.furthestPhaseLabel).toBe("Curing");
    expect(rollup.milestoneCount).toBe(3);
    expect(rollup.harvestedAt).toBe("2026-02-01T00:00:00Z");
    expect(rollup.latestCureNote).toBe("Jarred, 62% RH");
    expect(rollup.missing).toEqual([]);
  });

  it("orders milestones newest-first", () => {
    const rollup = buildPhenoCandidatePostCureRollup(
      candidate({
        timelineEvents: [
          { id: "t1", at: "2026-02-01T00:00:00Z", kind: "harvest" },
          { id: "t3", at: "2026-02-15T00:00:00Z", kind: "cure" },
          { id: "t2", at: "2026-02-08T00:00:00Z", kind: "dry" },
        ],
      }),
    );
    expect(rollup.milestones.map((m) => m.eventId)).toEqual(["t3", "t2", "t1"]);
  });

  it("computes whole days since harvest against asOf, never negative", () => {
    const input = candidate({
      timelineEvents: [{ id: "t1", at: "2026-02-01T00:00:00Z", kind: "harvest" }],
    });
    expect(buildPhenoCandidatePostCureRollup(input, "2026-02-11T00:00:00Z").daysSinceHarvest).toBe(
      10,
    );
    // asOf before harvest clamps to 0, never negative.
    expect(buildPhenoCandidatePostCureRollup(input, "2026-01-01T00:00:00Z").daysSinceHarvest).toBe(
      0,
    );
    // No asOf → null (stays pure, no implicit clock).
    expect(buildPhenoCandidatePostCureRollup(input).daysSinceHarvest).toBeNull();
    // Unparseable asOf → null.
    expect(buildPhenoCandidatePostCureRollup(input, "not-a-date").daysSinceHarvest).toBeNull();
  });

  it("flags no_harvest_logged when curing exists but no harvest date was logged", () => {
    const rollup = buildPhenoCandidatePostCureRollup(
      candidate({ timelineEvents: [{ id: "t1", at: "2026-02-15T00:00:00Z", kind: "cure" }] }),
    );
    expect(rollup.furthestPhase).toBe("curing");
    expect(rollup.harvestedAt).toBeNull();
    expect(rollup.missing.map((m) => m.code)).toContain("no_harvest_logged");
  });

  it("flags no_cure_notes when harvested/dried but not yet curing", () => {
    const rollup = buildPhenoCandidatePostCureRollup(
      candidate({
        timelineEvents: [
          { id: "t1", at: "2026-02-01T00:00:00Z", kind: "harvest" },
          { id: "t2", at: "2026-02-08T00:00:00Z", kind: "dry" },
        ],
      }),
    );
    expect(rollup.furthestPhase).toBe("drying");
    expect(rollup.missing.map((m) => m.code)).toContain("no_cure_notes");
    expect(rollup.latestCureNote).toBeNull();
  });

  it("does NOT invent yield/potency — surface only carries logged milestones", () => {
    const rollup = buildPhenoCandidatePostCureRollup(
      candidate({
        timelineEvents: [{ id: "t1", at: "2026-02-01T00:00:00Z", kind: "cure", summary: "nice" }],
      }),
    );
    // The rollup shape has no yield/weight/potency fields at all.
    expect(Object.keys(rollup)).not.toContain("yield");
    expect(Object.keys(rollup)).not.toContain("potency");
    expect(Object.keys(rollup)).not.toContain("weight");
  });

  it("falls back to candidateId when label is blank", () => {
    const rollup = buildPhenoCandidatePostCureRollup(
      candidate({ candidateId: "abc", candidateLabel: "  " }),
    );
    expect(rollup.candidateLabel).toBe("abc");
  });
});

describe("buildPhenoPostCureRollups", () => {
  it("maps a set of candidates preserving order and skipping garbage rows", () => {
    const out = buildPhenoPostCureRollups([
      candidate({ candidateId: "a" }),
      { candidateId: "" } as PhenoCandidateInput,
      candidate({ candidateId: "b" }),
    ]);
    expect(out.map((r) => r.candidateId)).toEqual(["a", "b"]);
  });

  it("handles null/undefined input without throwing", () => {
    expect(buildPhenoPostCureRollups(null)).toEqual([]);
    expect(buildPhenoPostCureRollups(undefined)).toEqual([]);
  });
});
