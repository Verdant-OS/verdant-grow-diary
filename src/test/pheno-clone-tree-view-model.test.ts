/**
 * C4 — pheno clone-lineage tree view-model.
 * Proves the flat clone rows → depth-annotated pre-order lineage, with
 * sibling ordering by taken date, and defensive handling of orphans,
 * self-parents, and cycles. Pure.
 */
import { describe, it, expect } from "vitest";
import { buildCloneTreeRows, type CloneInput } from "@/lib/phenoCloneTreeViewModel";

function clone(over: Partial<CloneInput> & { id: string }): CloneInput {
  return { parentCloneId: null, cloneLabel: over.id, ...over };
}

describe("buildCloneTreeRows", () => {
  it("nests children under their parent with increasing depth", () => {
    const rows = buildCloneTreeRows([
      clone({ id: "mother", cloneLabel: "mother", takenAt: "2026-07-01" }),
      clone({ id: "cut1", parentCloneId: "mother", cloneLabel: "cut #1", takenAt: "2026-07-02" }),
      clone({ id: "cut1a", parentCloneId: "cut1", cloneLabel: "cut #1a", takenAt: "2026-07-03" }),
    ]);
    expect(rows.map((r) => [r.label, r.depth])).toEqual([
      ["mother", 0],
      ["cut #1", 1],
      ["cut #1a", 2],
    ]);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[2].hasChildren).toBe(false);
  });

  it("orders siblings by taken date (undated last), then label", () => {
    const rows = buildCloneTreeRows([
      clone({ id: "m", cloneLabel: "m", takenAt: "2026-07-01" }),
      clone({ id: "b", parentCloneId: "m", cloneLabel: "b", takenAt: "2026-07-05" }),
      clone({ id: "a", parentCloneId: "m", cloneLabel: "a", takenAt: "2026-07-03" }),
      clone({ id: "z", parentCloneId: "m", cloneLabel: "z", takenAt: null }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["m", "a", "b", "z"]);
  });

  it("treats a clone whose parent isn't present as a root (orphan)", () => {
    const rows = buildCloneTreeRows([
      clone({ id: "orphan", parentCloneId: "ghost", cloneLabel: "orphan" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
    expect(rows[0].label).toBe("orphan");
  });

  it("ignores a self-parent (treats it as a root, never loops)", () => {
    const rows = buildCloneTreeRows([
      clone({ id: "self", parentCloneId: "self", cloneLabel: "self" }),
    ]);
    expect(rows).toEqual([
      { id: "self", label: "self", depth: 0, note: null, takenAt: null, hasChildren: false },
    ]);
  });

  it("surfaces every clone exactly once even with a cycle (A→B→A)", () => {
    const rows = buildCloneTreeRows([
      clone({ id: "A", parentCloneId: "B", cloneLabel: "A" }),
      clone({ id: "B", parentCloneId: "A", cloneLabel: "B" }),
    ]);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(["A", "B"]);
    expect(rows.length).toBe(2); // no infinite loop, no duplication
  });

  it("names an unnamed clone safely and returns [] for no clones", () => {
    const [row] = buildCloneTreeRows([clone({ id: "x", cloneLabel: "  " })]);
    expect(row.label).toBe("unnamed clone");
    expect(buildCloneTreeRows([])).toEqual([]);
  });

  it("is deterministic", () => {
    const input = [
      clone({ id: "m", takenAt: "2026-07-01" }),
      clone({ id: "c", parentCloneId: "m", takenAt: "2026-07-02" }),
    ];
    expect(buildCloneTreeRows(input)).toEqual(buildCloneTreeRows(input));
  });
});
