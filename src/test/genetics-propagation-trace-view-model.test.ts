import { describe, it, expect } from "vitest";
import { buildTraceView } from "@/lib/genetics/traceabilityViewModel";

describe("trace view model", () => {
  it("returns an empty, non-rendering view for malformed input", () => {
    expect(buildTraceView(null).shouldRender).toBe(false);
    expect(buildTraceView(42).shouldRender).toBe(false);
    expect(buildTraceView("nope").shouldRender).toBe(false);
  });

  it("passes through a failure reason without rendering", () => {
    const v = buildTraceView({ ok: false, reason: "not_found" });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("not_found");
    expect(v.shouldRender).toBe(false);
  });

  it("builds honest node + edge labels and evidence", () => {
    const v = buildTraceView({
      ok: true,
      subject: { kind: "accession", id: "acc-1" },
      direction: "descendants",
      node_count: 2,
      truncated: false,
      nodes: [
        { key: "accession:acc-1", kind: "accession", id: "acc-1", depth: 0, label: "Harness Haze", edge_type: null, from: null, evidence: null, gaps: [] },
        {
          key: "plant:p-1",
          kind: "plant",
          id: "p-1",
          depth: 1,
          label: "Plant A",
          edge_type: "produced_by_batch",
          from: "batch:b-1",
          evidence: { state: "untested", targets: [], open_quarantine: false },
          gaps: ["unassigned_origin"],
        },
      ],
      edges: [{ from: "batch:b-1", to: "plant:p-1", edge_type: "produced_by_batch" }],
    });

    expect(v.shouldRender).toBe(true);
    expect(v.subjectKind).toBe("accession");
    expect(v.nodes[0].kindLabel).toBe("Accession");
    expect(v.nodes[1].edgeLabel).toBe("Produced by batch");
    expect(v.nodes[1].evidence?.stateLabel).toBe("Not tested");
    expect(v.edges[0].edgeLabel).toBe("Produced by batch");
  });

  it("aggregates gap flags with the node label and dedupes", () => {
    const v = buildTraceView({
      ok: true,
      subject: { kind: "batch", id: "b-1" },
      nodes: [
        { key: "batch:b-1", kind: "batch", id: "b-1", depth: 0, label: "B-001", edge_type: null, from: null, evidence: null, gaps: ["unknown_origin"] },
      ],
      edges: [],
    });
    expect(v.flags).toHaveLength(1);
    expect(v.flags[0].code).toBe("unknown_origin");
    expect(v.flags[0].message).toMatch(/^B-001:/);
  });

  it("never throws on partially malformed nodes and reports truncation", () => {
    const v = buildTraceView({
      ok: true,
      subject: { kind: "plant", id: "p-1" },
      truncated: true,
      nodes: [null, 5, { kind: "plant", id: "p-1", depth: 0 }],
      edges: [null, { from: "x" }],
    });
    expect(v.truncated).toBe(true);
    expect(v.nodes).toHaveLength(1);
    expect(v.nodes[0].label).toMatch(/unnamed/);
  });
});
