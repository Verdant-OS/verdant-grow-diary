import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

const readyCatalog = {
  handoffCatalogStatus: "ready" as const,
  handoffPlants: [
    {
      id: "plant-a",
      grow_id: "g1",
      tent_id: "t1",
      is_archived: false,
    },
  ],
  handoffTents: [{ id: "t1", grow_id: "g1", is_archived: false }],
};

function renderCoverage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

afterEach(() => cleanup());

describe("PhenoCandidateEvidenceCoverage", () => {
  it("shows X of Y with recorded and missing chips", () => {
    renderCoverage(
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

  it("tentless plant does not open Quick Log; shows Assign tent CTA", () => {
    renderCoverage(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions
        growId="g1"
        tentId={null}
        handoffCatalogStatus="ready"
        handoffPlants={[{ id: "plant-a", grow_id: "g1", tent_id: null }]}
        handoffTents={[{ id: "t1", grow_id: "g1" }]}
      />,
    );
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    fireEvent.click(screen.getByRole("button", { name: "Record Structure evidence" }));
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    expect(listener).not.toHaveBeenCalled();
    const blocked = screen.getByTestId("pheno-candidate-evidence-coverage-handoff-blocked");
    expect(blocked).toHaveAttribute("data-handoff-reason", "plant_tent_unassigned");
    const cta = screen.getByTestId("pheno-candidate-evidence-coverage-handoff-cta");
    expect(cta).toHaveAttribute("data-cta-kind", "assign_tent");
    expect(cta).toHaveAttribute("href", "/plants/plant-a");
  });

  it("pending catalog blocks handoff without opening Quick Log", () => {
    renderCoverage(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [] })}
        status="ready"
        allowRecordActions
        handoffCatalogStatus="pending"
        handoffPlants={null}
        handoffTents={null}
      />,
    );
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    fireEvent.click(screen.getByRole("button", { name: "Record Structure evidence" }));
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    expect(listener).not.toHaveBeenCalled();
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-handoff-blocked")).toHaveAttribute(
      "data-handoff-kind",
      "pending",
    );
  });

  it("catalog error shows Retry and does not invent missing setup", () => {
    const onRetry = vi.fn();
    renderCoverage(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [] })}
        status="ready"
        allowRecordActions
        handoffCatalogStatus="error"
        onRetryHandoffCatalog={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record Structure evidence" }));
    expect(screen.getByTestId("pheno-candidate-evidence-coverage-handoff-blocked")).toHaveAttribute(
      "data-handoff-kind",
      "catalog_error",
    );
    fireEvent.click(screen.getByTestId("pheno-candidate-evidence-coverage-handoff-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("pheno-candidate-evidence-coverage-handoff-description").textContent,
    ).toMatch(/load failure/i);
    expect(
      screen.getByTestId("pheno-candidate-evidence-coverage-handoff-description").textContent,
    ).not.toMatch(/assign this plant to a tent/i);
  });

  it("valid triangle opens Quick Log with exact stored identity", () => {
    renderCoverage(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions
        growId="g1"
        tentId={null}
        {...readyCatalog}
      />,
    );
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener as EventListener);
    fireEvent.click(screen.getByRole("button", { name: "Record Structure evidence" }));
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

  it("recorded goals never render a record button; read-only mode renders none", () => {
    renderCoverage(
      <PhenoCandidateEvidenceCoverage
        packet={packet({ rows: [row("aroma")] })}
        status="ready"
        allowRecordActions={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("truncated state is text-labeled and suppresses record actions", () => {
    renderCoverage(
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
    expect(section.textContent).not.toMatch(/All configured goals recorded/i);
  });

  it("unavailable state is calm and keeps ordinary Quick Log wording", () => {
    renderCoverage(
      <PhenoCandidateEvidenceCoverage packet={packet({ unavailable: true })} status="error" />,
    );
    expect(screen.getByTestId("pheno-candidate-evidence-coverage")).toHaveAttribute(
      "data-state",
      "unavailable",
    );
  });
});
