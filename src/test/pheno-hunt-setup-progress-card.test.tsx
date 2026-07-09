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

  it("renders Setup complete and Comparison readiness as separate status lines", () => {
    render(
      <PhenoHuntSetupProgressCard
        hunt={hunt({ setupCompletedAt: "2026-08-01T00:00:00Z" })}
        candidateCount={2}
      />,
    );
    const setupLine = screen.getByTestId("pheno-workspace-setup-progress-setup-status");
    const compLine = screen.getByTestId("pheno-workspace-setup-progress-comparison-status");
    expect(setupLine.textContent).toMatch(/Setup complete/);
    expect(setupLine.textContent).toMatch(/Yes/);
    // Default comparisonReadiness is not_ready — even when setup is done.
    expect(compLine.textContent).toMatch(/Not comparison-ready yet/);
  });

  it("does not label a setup-complete hunt as Comparison-ready by default", () => {
    render(
      <PhenoHuntSetupProgressCard
        hunt={hunt({ setupCompletedAt: "2026-08-01T00:00:00Z" })}
        candidateCount={2}
      />,
    );
    const card = screen.getByTestId("pheno-workspace-setup-progress");
    expect(card.getAttribute("data-comparison-readiness")).toBe("not_ready");
    expect(card.textContent).not.toMatch(/\bComparison-ready\b(?!\s*means)/);
  });

  it("reflects explicit comparisonReadiness prop values", () => {
    const { rerender } = render(
      <PhenoHuntSetupProgressCard
        hunt={hunt({ setupCompletedAt: "2026-08-01T00:00:00Z" })}
        candidateCount={2}
        comparisonReadiness="comparison_ready"
      />,
    );
    expect(
      screen
        .getByTestId("pheno-workspace-setup-progress-comparison-status")
        .textContent,
    ).toMatch(/Comparison-ready/);

    rerender(
      <PhenoHuntSetupProgressCard
        hunt={hunt({ setupCompletedAt: "2026-08-01T00:00:00Z" })}
        candidateCount={2}
        comparisonReadiness="pending_until_cure"
      />,
    );
    expect(
      screen
        .getByTestId("pheno-workspace-setup-progress-comparison-status")
        .textContent,
    ).toMatch(/Pending until cure/);
  });

  it("renders Setup complete and Comparison-ready definitions", () => {
    render(
      <PhenoHuntSetupProgressCard hunt={hunt()} candidateCount={2} onMarkComplete={vi.fn()} />,
    );
    expect(
      screen.getByTestId("pheno-workspace-setup-progress-definition-setup").textContent,
    ).toMatch(/Setup complete means your hunt has candidates and evidence goals\./);
    expect(
      screen.getByTestId("pheno-workspace-setup-progress-definition-comparison").textContent,
    ).toMatch(/Comparison-ready means each candidate has enough evidence to compare honestly\./);
  });
});
