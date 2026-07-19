import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import PhenoFightNight from "@/components/PhenoFightNight";
import type { ContenderInput } from "@/lib/phenoContendersViewModel";
import { DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

const pool: ContenderInput[] = DEMO_CANDIDATES.filter((c) => c.verdict !== "cull").map((c) => ({
  id: c.candidateNumber,
  name: c.name,
  verdict: c.verdict,
  aroma: c.aroma,
  axes: c.loud,
}));

afterEach(cleanup);

function renderFight() {
  // Default matchup: #3 Gas Runtz vs #7 Sherb Cake.
  return render(<PhenoFightNight pool={pool} defaultAId={3} defaultBId={7} />);
}

describe("PhenoFightNight", () => {
  it("renders both corners with their selected names", () => {
    renderFight();
    const a = within(screen.getByTestId("pheno-fight-side-a")).getByRole(
      "combobox",
    ) as HTMLSelectElement;
    const b = within(screen.getByTestId("pheno-fight-side-b")).getByRole(
      "combobox",
    ) as HTMLSelectElement;
    expect(a.value).toBe("3");
    expect(b.value).toBe("7");
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
    expect(screen.queryByText(/overall winner/i)).toBeNull();
  });

  it("lets the grower change the matchup", () => {
    renderFight();
    const a = within(screen.getByTestId("pheno-fight-side-a")).getByRole(
      "combobox",
    ) as HTMLSelectElement;
    fireEvent.change(a, { target: { value: "2" } }); // swap in Runtz #2
    expect(a.value).toBe("2");
    expect(screen.getByTestId("pheno-fight-tally").textContent).toMatch(/Runtz #2 leads/);
  });

  it("lets the grower record a call locally (and toggle it off)", () => {
    renderFight();
    const aCall = screen.getByTestId("pheno-fight-call-a");
    expect(aCall).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(aCall);
    expect(aCall).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(aCall);
    expect(aCall).toHaveAttribute("aria-pressed", "false");
  });

  it("clears a stale call when the matchup changes", () => {
    renderFight();
    const aCall = screen.getByTestId("pheno-fight-call-a");
    fireEvent.click(aCall);
    expect(aCall).toHaveAttribute("aria-pressed", "true");
    const a = within(screen.getByTestId("pheno-fight-side-a")).getByRole("combobox");
    fireEvent.change(a, { target: { value: "2" } });
    expect(screen.getByTestId("pheno-fight-call-a")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the ethos caveat: it stages, the grower decides", () => {
    renderFight();
    expect(screen.getByTestId("pheno-fight-caveat").textContent).toMatch(/you make the call/i);
    expect(screen.getByTestId("pheno-fight-caveat").textContent).toMatch(/isn't saved/i);
  });
});
