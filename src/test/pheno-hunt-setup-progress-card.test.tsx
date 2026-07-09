/**
 * PhenoHuntSetupProgressCard tests — verifies the workspace continuation
 * checklist reflects persisted hunt state and calls onMarkComplete only
 * when candidates + goals are present.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import PhenoHuntSetupProgressCard from "@/components/PhenoHuntSetupProgressCard";
import type { PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";

function hunt(over: Partial<PhenoHuntSummary> = {}): PhenoHuntSummary {
  return {
    id: "h1",
    name: "Blue Dream Hunt",
    growId: "g1",
    tentId: null,
    evidenceGoals: ["structure", "aroma"],
    notes: null,
    setupCompletedAt: null,
    ...over,
  };
}

describe("PhenoHuntSetupProgressCard", () => {
  afterEach(() => cleanup());

  it("marks basics + goals complete but flags missing candidates and confirmation", () => {
    render(
      <PhenoHuntSetupProgressCard hunt={hunt()} candidateCount={0} onMarkComplete={vi.fn()} />,
    );
    const card = screen.getByTestId("pheno-workspace-setup-progress");
    expect(card.getAttribute("data-setup-complete")).toBe("false");
    expect(
      screen
        .getByTestId("pheno-workspace-setup-progress-item-candidates")
        .getAttribute("data-complete"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("pheno-workspace-setup-progress-item-confirmation")
        .getAttribute("data-complete"),
    ).toBe("false");
  });

  it("shows setup-complete state when hunt.setupCompletedAt is set", () => {
    render(
      <PhenoHuntSetupProgressCard
        hunt={hunt({ setupCompletedAt: "2026-08-01T00:00:00Z" })}
        candidateCount={2}
      />,
    );
    const card = screen.getByTestId("pheno-workspace-setup-progress");
    expect(card.getAttribute("data-setup-complete")).toBe("true");
    // Mark button is not rendered when complete.
    expect(
      screen.queryByTestId("pheno-workspace-setup-progress-mark-complete"),
    ).toBeNull();
  });

  it("Mark setup complete is disabled while no candidates or goals", () => {
    const onMarkComplete = vi.fn();
    render(
      <PhenoHuntSetupProgressCard
        hunt={hunt({ evidenceGoals: [] })}
        candidateCount={0}
        onMarkComplete={onMarkComplete}
      />,
    );
    const btn = screen.getByTestId(
      "pheno-workspace-setup-progress-mark-complete",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onMarkComplete).not.toHaveBeenCalled();
  });

  it("Mark setup complete fires when candidates + goals present", () => {
    const onMarkComplete = vi.fn();
    render(
      <PhenoHuntSetupProgressCard
        hunt={hunt()}
        candidateCount={2}
        onMarkComplete={onMarkComplete}
      />,
    );
    fireEvent.click(
      screen.getByTestId("pheno-workspace-setup-progress-mark-complete"),
    );
    expect(onMarkComplete).toHaveBeenCalledTimes(1);
  });
});
