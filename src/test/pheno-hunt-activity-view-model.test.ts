/**
 * C5 — phenoHuntActivityViewModel adapter.
 * Proves the plant-keyed service reads (latest sex per plant, decision history
 * per plant) + reversals/crosses collapse into ordered timeline entries:
 * one sex + one (latest) decision per candidate, candidate labels resolved,
 * reason used as the decision's detail fallback, keeper pass-throughs intact.
 * Pure.
 */
import { describe, it, expect } from "vitest";
import { buildPhenoHuntActivityEntries } from "@/lib/phenoHuntActivityViewModel";

describe("buildPhenoHuntActivityEntries", () => {
  it("returns [] for empty input", () => {
    expect(buildPhenoHuntActivityEntries({})).toEqual([]);
    expect(buildPhenoHuntActivityEntries({ sexByPlant: {}, decisionsByPlant: {} })).toEqual([]);
  });

  it("emits one sex entry per candidate (latest), flagging herm + labeling each", () => {
    const rows = buildPhenoHuntActivityEntries({
      sexByPlant: {
        p1: { plantId: "p1", sex: "female", observedAt: "2026-07-01" },
        p2: { plantId: "p2", sex: "hermaphrodite", hermObserved: true, observedAt: "2026-07-02" },
      },
      candidateLabelById: { p1: "GMO #1", p2: "GMO #2" },
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(rows).toHaveLength(2);
    expect(byId["sex:p1"].kind).toBe("sex_observation");
    expect(byId["sex:p1"].badge).toBe("Female");
    expect(byId["sex:p2"].badge).toBe("Herm");
    // Multi-candidate hunts must say which candidate each sex row is for.
    expect(byId["sex:p1"].title).toContain("GMO #1");
    expect(byId["sex:p2"].title).toContain("GMO #2");
  });

  it("collapses decision history to the newest decision per candidate, with label + reason", () => {
    const rows = buildPhenoHuntActivityEntries({
      decisionsByPlant: {
        p1: [
          { decision: "cull", reason: "hermed at flip", decidedAt: "2026-07-03" },
          { decision: "keep", reason: "vigor", decidedAt: "2026-07-01" },
        ],
      },
      candidateLabelById: { p1: "GMO #1" },
    });
    expect(rows).toHaveLength(1); // only the latest, not the whole history
    const e = rows[0];
    expect(e.id).toBe("decision:p1");
    expect(e.kind).toBe("keeper_decision");
    expect(e.title).toContain("GMO #1");
    expect(e.title).toMatch(/Cull/i);
    // Reason is the detail fallback when no separate note was recorded.
    expect(e.detail).toBe("hermed at flip");
  });

  it("prefers an explicit note over the reason for the decision detail", () => {
    const [e] = buildPhenoHuntActivityEntries({
      decisionsByPlant: {
        p1: [
          {
            decision: "hold",
            reason: "auto reason",
            note: "watch node spacing",
            decidedAt: "2026-07-04",
          },
        ],
      },
    });
    expect(e.detail).toBe("watch node spacing");
  });

  it("passes reversals and crosses through with keeper names resolved", () => {
    const rows = buildPhenoHuntActivityEntries({
      reversals: [
        { id: "r1", keeperId: "k1", method: "colloidal_silver", appliedAt: "2026-07-05" },
      ],
      crosses: [
        {
          id: "x1",
          femaleKeeperId: "k1",
          maleKeeperId: null,
          crossType: "selfing_s1",
          crossName: null,
          crossedAt: "2026-07-06",
        },
      ],
      keeperNameById: { k1: "Gas Keeper" },
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["reversal:r1"].title).toContain("Gas Keeper");
    expect(byId["cross:x1"].kind).toBe("cross");
    expect(byId["cross:x1"].detail).toContain("Gas Keeper");
  });

  it("orders the merged activity most-recent first across all kinds", () => {
    const rows = buildPhenoHuntActivityEntries({
      sexByPlant: { p1: { plantId: "p1", sex: "female", observedAt: "2026-07-01" } },
      decisionsByPlant: { p1: [{ decision: "keep", reason: "vigor", decidedAt: "2026-07-03" }] },
      reversals: [{ id: "r1", keeperId: "k1", method: "sts", appliedAt: "2026-07-04" }],
      crosses: [
        {
          id: "x1",
          femaleKeeperId: "k1",
          maleKeeperId: "k1",
          crossType: "selfing_s1",
          crossedAt: "2026-07-05",
        },
      ],
      keeperNameById: { k1: "Gas" },
    });
    expect(rows.map((r) => r.occurredAt)).toEqual([
      "2026-07-05",
      "2026-07-04",
      "2026-07-03",
      "2026-07-01",
    ]);
  });

  it("ignores blank plant ids and empty decision histories", () => {
    const rows = buildPhenoHuntActivityEntries({
      sexByPlant: { "": { plantId: "", sex: "female" } },
      decisionsByPlant: { p9: [] },
    });
    expect(rows).toEqual([]);
  });
});
