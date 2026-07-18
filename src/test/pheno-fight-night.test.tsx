import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import PhenoFightNight from "@/components/PhenoFightNight";
import { buildFight } from "@/lib/phenoFightViewModel";
import type { ContenderInput } from "@/lib/phenoContendersViewModel";
import { DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

const toInput = (num: number): ContenderInput => {
  const c = DEMO_CANDIDATES.find((x) => x.candidateNumber === num)!;
  return { id: c.candidateNumber, name: c.name, verdict: c.verdict, aroma: c.aroma, axes: c.loud };
};

const fight = buildFight(toInput(3), toInput(7))!; // Gas Runtz vs Sherb Cake

afterEach(cleanup);

function renderFight() {
  return render(<PhenoFightNight fight={fight} />);
}

describe("PhenoFightNight", () => {
  it("renders both corners with their names", () => {
    renderFight();
    expect(
      within(screen.getByTestId("pheno-fight-side-a")).getByText("Gas Runtz"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pheno-fight-side-b")).getByText("Sherb Cake"),
    ).toBeInTheDocument();
  });

  it("renders a row for every trait", () => {
    renderFight();
    for (const key of ["nose", "resin", "structure", "yield", "breeding"]) {
      expect(screen.getByTestId(`pheno-fight-axis-${key}`)).toBeInTheDocument();
    }
  });

  it("shows the trait tally without declaring a winner", () => {
    renderFight();
    const tally = screen.getByTestId("pheno-fight-tally").textContent ?? "";
    expect(tally).toMatch(/Gas Runtz leads 2/);
    expect(tally).toMatch(/Sherb Cake leads 1/);
    expect(tally).toMatch(/2 ties/);
    // No element declares an overall winner.
    expect(screen.queryByText(/overall winner/i)).toBeNull();
  });

  it("lets the grower record a call locally (and toggle it off)", () => {
    renderFight();
    const aCall = screen.getByTestId("pheno-fight-call-a");
    expect(aCall).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(aCall);
    expect(aCall).toHaveAttribute("aria-pressed", "true");
    // Picking is exclusive-ish: clicking the same one again clears it.
    fireEvent.click(aCall);
    expect(aCall).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the ethos caveat: it stages, the grower decides", () => {
    renderFight();
    expect(screen.getByTestId("pheno-fight-caveat").textContent).toMatch(/you make the call/i);
    expect(screen.getByTestId("pheno-fight-caveat").textContent).toMatch(/isn't saved/i);
  });
});
