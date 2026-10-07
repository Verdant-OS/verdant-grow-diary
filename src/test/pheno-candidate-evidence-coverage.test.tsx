import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PhenoCandidateEvidenceCoverage from "@/components/PhenoCandidateEvidenceCoverage";
import { buildPhenoCandidateEvidencePacket } from "@/lib/phenoEvidencePacket";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import type { RawPhenoEvidenceDiaryRow } from "@/lib/phenoEvidenceCaptureRules";

const GOALS = ["structure", "aroma"];

function row(goal: string): RawPhenoEvidenceDiaryRow {
  return {
    id: `d-${goal}`,
    plant_id: "plant-a",
    entry_at: "2026-07-10T12:00:00.000Z",
    photo_url: null,
    details: {
      kind: "pheno_evidence_receipt",
      receipt_version: 1,
      source: "manual",
      evidence_only: true,
      hunt_id: "hunt-1",
      plant_id: "plant-a",
      evidence_goal: goal,
      stage: null,
      automatic_selection: false,
      action_queue_created: false,
      device_control: false,
    },
  };
}

function packet(
  opts: { rows?: RawPhenoEvidenceDiaryRow[]; truncated?: boolean; unavailable?: boolean } = {},
) {
  return buildPhenoCandidateEvidencePacket({
    huntId: "hunt-1",
    plantId: "plant-a",
    configuredGoals: GOALS,
    rows: opts.rows ?? [],
    truncated: opts.truncated,
    unavailable: opts.unavailable,
  });
}

afterEach(() => cleanup());

describe("PhenoCandidateEvidenceCoverage", () => {
  it("Assign tent links to plant setup without dispatching evidence, then a ready target records", () => {
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    try {
      const { rerender } = render(
        <MemoryRouter>
          <PhenoCandidateEvidenceCoverage
            packet={packet()}
            status="ready"
            allowRecordActions
            quickLogTarget={{ kind: "needs_tent_assignment" }}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("button", { name: /Record .* evidence/ })).toBeNull();
      const assign = screen.getByRole("link", { name: "Assign tent" });
      expect(assign).toHaveAttribute("href", "/plants/plant-a");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Assign this plant to a tent before recording evidence.",
      );
      fireEvent.click(assign);
      expect(listener).not.toHaveBeenCalled();

      rerender(
        <MemoryRouter>
          <PhenoCandidateEvidenceCoverage
            packet={packet()}
            status="ready"
            allowRecordActions
            quickLogTarget={{ kind: "ready", plantId: "plant-a", growId: "g1", tentId: "t1" }}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("link", { name: "Assign tent" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Record Structure evidence" }));
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        plantId: "plant-a",
        growId: "g1",
        tentId: "t1",
        phenoEvidenceGoal: "structure",
      });
    } finally {
      window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    }
  });

  it("read-only coverage offers neither Assign tent nor recording", () => {
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet()}
        status="ready"
        quickLogTarget={{ kind: "needs_tent_assignment" }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows X of Y with recorded and missing chips", () => {
    render(
      <PhenoCandidateEvidenceCoverage packet={packet({ rows: [row("aroma")] })} status="ready" />,
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-summary")).toHaveTextContent(
      "1 of 2 configured goals recorded",
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-goal-aroma")).toHaveAttribute(
      "data-recorded",
      "true",
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-goal-structure")).toHaveAttribute(
      "data-recorded",
      "false",
    );
  });

  it("missing goal renders an explicit accessible record action when allowed", () => {
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions
        quickLogTarget={{ kind: "ready", plantId: "plant-a", growId: "g1", tentId: "t1" }}
      />,
    );
    const btn = screen.getByRole("button", { name: "Record Structure evidence" });
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    fireEvent.click(btn);
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({
      plantId: "plant-a",
      growId: "g1",
      tentId: "t1",
      phenoHuntId: "hunt-1",
      phenoEvidenceGoal: "structure",
      source: "pheno-evidence-goal",
    });
  });

  it("#1005: no resolved target means no record action — absent is pending, never a guess", () => {
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions
      />,
    );
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-target")).toHaveAttribute(
      "data-target-state",
      "pending",
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-goal-structure")).toHaveAttribute(
      "data-recorded",
      "false",
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("#1005: a target resolved for a different plant never fires for this one", () => {
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions
        quickLogTarget={{ kind: "ready", plantId: "plant-b", growId: "g1", tentId: "t1" }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Record .* evidence/ })).toBeNull();
  });

  it("#1005: a fully recorded candidate shows no target status line", () => {
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma"), row("structure")] })}
        status="ready"
        allowRecordActions
        quickLogTarget={{ kind: "mismatch" }}
      />,
    );
    expect(screen.queryByTestId("pheno-candidate-evidence-coverage-target")).toBeNull();
  });

  it("recorded goals never render a record button; read-only mode renders none", () => {
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("truncated state is text-labeled and suppresses record actions", () => {
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma"), row("structure")], truncated: true })}
        status="ready"
        allowRecordActions
      />,
    );
    const section = screen.getByTestId("pheno-candidate-evidence-coverage");
    expect(section).toHaveAttribute("data-state", "truncated");
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-state")).toHaveTextContent(
      /incomplete/i,
    );
    expect(screen.queryByRole("button")).toBeNull();
    // Never labeled complete.
    expect(section.textContent).not.toMatch(/All configured goals recorded/i);
  });

  it("unavailable state is calm and keeps ordinary Quick Log wording", () => {
    render(
      <PhenoCandidateEvidenceCoverage packet={packet({ unavailable: true })} status="error" />,
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage")).toHaveAttribute(
      "data-state",
      "unavailable",
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-state")).toHaveTextContent(
      /regular Quick Log still works/i,
    );
  });

  it("unavailable never renders as zero recorded coverage (failed read ≠ no evidence)", () => {
    render(
      <PhenoCandidateEvidenceCoverage packet={packet({ unavailable: true })} status="error" />,
    );
    const summary = screen.getByTestId("pheno-candidate-evidence-coverage-summary");
    expect(summary).toHaveTextContent(/coverage unknown/i);
    expect(summary.textContent).not.toMatch(/0 of \d+/);
    // No per-goal "missing" chips either — missingness is unknown here.
    expect(screen.queryByTestId("pheno-candidate-evidence-coverage-goals")).toBeNull();
  });

  it("loading renders a placeholder; disabled renders nothing", () => {
    const { container, rerender } = render(
      <PhenoCandidateEvidenceCoverage packet={null} status="loading" />,
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-loading")).toBeInTheDocument();
    rerender(<PhenoCandidateEvidenceCoverage packet={null} status="disabled" />);
    expect(container).toBeEmptyDOMElement();
  });
});
