import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceStatePill } from "@/components/genetics/EvidenceStatePill";
import { UnknownStateChip } from "@/components/genetics/UnknownStateChip";
import { TraceabilityTree } from "@/components/genetics/TraceabilityTree";
import { buildTraceView } from "@/lib/genetics/traceabilityViewModel";

describe("genetics presenter components", () => {
  it("EvidenceStatePill renders honest labels and never says clean", () => {
    const { rerender } = render(<EvidenceStatePill state="untested" />);
    let pill = screen.getByTestId("evidence-state-pill");
    expect(pill).toHaveAttribute("data-state", "untested");
    expect(pill.textContent).toBe("Not tested");

    rerender(<EvidenceStatePill state="negative_scoped" openQuarantine />);
    pill = screen.getByTestId("evidence-state-pill");
    expect(pill.textContent).toBe("Negative (scoped)");
    expect(screen.getByTestId("evidence-quarantine-flag")).toBeTruthy();
    expect(pill.textContent?.toLowerCase()).not.toMatch(/clean|pathogen|healthy/);
  });

  it("UnknownStateChip renders an explicit missing-state marker", () => {
    render(<UnknownStateChip kind="unassigned" />);
    const chip = screen.getByTestId("unknown-state-chip");
    expect(chip).toHaveAttribute("data-kind", "unassigned");
    expect(chip.textContent).toBe("Unassigned");
  });

  it("TraceabilityTree renders a semantic tree with gaps, evidence, and truncation", () => {
    const view = buildTraceView({
      ok: true,
      subject: { kind: "batch", id: "b-1" },
      truncated: true,
      nodes: [
        {
          key: "batch:b-1",
          kind: "batch",
          id: "b-1",
          depth: 0,
          label: "B-001",
          edge_type: null,
          from: null,
          evidence: null,
          gaps: ["unknown_origin"],
        },
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
      edges: [],
    });

    render(<TraceabilityTree view={view} />);
    // Semantic, keyboard-operable structure — not canvas-only.
    expect(screen.getByRole("tree")).toBeTruthy();
    expect(screen.getAllByRole("treeitem")).toHaveLength(2);
    expect(screen.getByTestId("traceability-truncated")).toBeTruthy();
    expect(screen.getByTestId("traceability-gaps")).toBeTruthy();
    // The untested plant surfaces an honest posture pill.
    expect(screen.getByTestId("evidence-state-pill").textContent).toBe("Not tested");
  });

  it("TraceabilityTree shows an explicit empty state, not a fake clean tree", () => {
    render(<TraceabilityTree view={buildTraceView({ ok: false, reason: "not_found" })} />);
    expect(screen.getByTestId("traceability-empty")).toBeTruthy();
  });
});
