import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import PhenoCureTimeline from "@/components/PhenoCureTimeline";
import { buildCureTimeline } from "@/lib/phenoCureTimelineViewModel";
import { DEMO_KEEPERS, DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

const gas = buildCureTimeline({
  id: "keeper-gas-runtz",
  name: "Gas Runtz",
  rounds: DEMO_CANDIDATES.find((c) => c.name === "Gas Runtz")!.rounds,
  stabilityRunCount: DEMO_KEEPERS.find((k) => k.name === "Gas Runtz")!.stabilityRunCount,
  reversed: true,
  reversalMethods: ["colloidal_silver"],
})!;

afterEach(cleanup);

describe("PhenoCureTimeline", () => {
  it("draws the full journey with the cure and re-grow nodes", () => {
    render(<PhenoCureTimeline timeline={gas} />);
    const root = screen.getByTestId("pheno-cure-timeline-keeper-gas-runtz");
    expect(within(root).getByTestId("pheno-cure-stage-keeper-gas-runtz-cure")).toBeInTheDocument();
    expect(
      within(root).getByTestId("pheno-cure-stage-keeper-gas-runtz-regrow-1"),
    ).toBeInTheDocument();
    expect(
      within(root).getByTestId("pheno-cure-stage-keeper-gas-runtz-regrow-2"),
    ).toBeInTheDocument();
  });

  it("shows the earned summary and reversal milestone", () => {
    render(<PhenoCureTimeline timeline={gas} />);
    expect(screen.getByTestId("pheno-cure-earned-keeper-gas-runtz").textContent).toMatch(/earned/i);
    expect(screen.getByText(/Reversed · colloidal_silver/)).toBeInTheDocument();
  });

  it("says a cured-but-unproven pheno still needs a re-grow", () => {
    const cured = buildCureTimeline({
      id: "x",
      name: "Test",
      rounds: ["veg", "post_cure"],
      stabilityRunCount: 0,
    })!;
    render(<PhenoCureTimeline timeline={cured} />);
    expect(screen.getByTestId("pheno-cure-earned-x").textContent).toMatch(/needs a re-grow/i);
  });
});
