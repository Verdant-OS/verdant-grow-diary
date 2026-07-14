import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

function packet(opts: { rows?: RawPhenoEvidenceDiaryRow[]; truncated?: boolean; unavailable?: boolean } = {}) {
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
  it("shows X of Y with recorded and missing chips", () => {
    render(
      <PhenoCandidateEvidenceCoverage packet={packet({ rows: [row("aroma")] })} status="ready" />,
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-summary")).toHaveTextContent(
      "1 of 2 configured goals recorded",
    );
    expect(
      screen.getByTestId("pheno-candidate-evidence-coverage-goal-aroma"),
    ).toHaveAttribute("data-recorded", "true");
    expect(
      screen.getByTestId("pheno-candidate-evidence-coverage-goal-structure"),
    ).toHaveAttribute("data-recorded", "false");
  });

  it("missing goal renders an explicit accessible record action when allowed", () => {
    render(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions
        growId="g1"
        tentId={null}
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
      phenoHuntId: "hunt-1",
      phenoEvidenceGoal: "structure",
      source: "pheno-evidence-goal",
    });
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

  it("loading renders a placeholder; disabled renders nothing", () => {
    const { container, rerender } = render(
      <PhenoCandidateEvidenceCoverage packet={null} status="loading" />,
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-loading")).toBeInTheDocument();
    rerender(<PhenoCandidateEvidenceCoverage packet={null} status="disabled" />);
    expect(container).toBeEmptyDOMElement();
  });
});
