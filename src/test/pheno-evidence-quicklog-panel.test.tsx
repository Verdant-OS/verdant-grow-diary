import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PhenoEvidenceQuickLogPanel from "@/components/PhenoEvidenceQuickLogPanel";
import { buildPhenoEvidenceCoverage } from "@/lib/phenoEvidenceCaptureRules";

const context = {
  huntId: "hunt-1",
  huntName: "Blue Dream Hunt",
  plantId: "plant-1",
  coverage: buildPhenoEvidenceCoverage({
    configuredGoals: ["structure", "aroma"],
    diaryRows: [],
    huntId: "hunt-1",
    plantId: "plant-1",
  }),
};

describe("PhenoEvidenceQuickLogPanel", () => {
  afterEach(cleanup);

  it("renders only configured goals and evidence-only safety copy", () => {
    render(
      <PhenoEvidenceQuickLogPanel
        status="ready"
        context={context}
        candidateLabel="#7"
        selectedGoal={null}
        onSelectedGoalChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Pheno evidence · #7/)).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-pheno-hunt-name")).toHaveTextContent("Blue Dream Hunt");
    expect(screen.getByText("Structure")).toBeInTheDocument();
    expect(screen.getByText("Aroma")).toBeInTheDocument();
    expect(screen.queryByText("Yield")).toBeNull();
    expect(screen.getByText(/does not rank candidates or make selections/i)).toBeInTheDocument();
  });

  it("requires an explicit chip click and lets the grower clear it", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PhenoEvidenceQuickLogPanel
        status="ready"
        context={context}
        candidateLabel={null}
        selectedGoal={null}
        onSelectedGoalChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("quick-log-pheno-evidence-goal-structure"));
    expect(onChange).toHaveBeenCalledWith("structure");

    rerender(
      <PhenoEvidenceQuickLogPanel
        status="ready"
        context={context}
        candidateLabel={null}
        selectedGoal="structure"
        onSelectedGoalChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("quick-log-pheno-evidence-goal-structure"));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("fails closed for a read error while preserving the ordinary save path copy", () => {
    render(
      <PhenoEvidenceQuickLogPanel
        status="error"
        context={null}
        candidateLabel="#1"
        selectedGoal={null}
        onSelectedGoalChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/tagging is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/regular Quick Log can still be saved/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("does not invent goals when the hunt has none configured", () => {
    render(
      <PhenoEvidenceQuickLogPanel
        status="ready"
        context={{
          ...context,
          coverage: buildPhenoEvidenceCoverage({
            configuredGoals: [],
            diaryRows: [],
            huntId: "hunt-1",
            plantId: "plant-1",
          }),
        }}
        candidateLabel="#1"
        selectedGoal={null}
        onSelectedGoalChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/no evidence goals configured/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
