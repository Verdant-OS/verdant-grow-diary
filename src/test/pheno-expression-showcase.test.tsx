/**
 * PhenoExpressionShowcase — mix-and-match demo of the ten example phenos.
 * Verifies expression rendering, the suggest-only herm flag, the
 * apples-to-apples warning, and that toggling changes which phenos compare.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PhenoExpressionShowcase from "@/pages/PhenoExpressionShowcase";

// The showcase is fixture-only — it must never touch supabase.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("PhenoExpressionShowcase must not use supabase (demo).");
      },
    },
  ),
}));

describe("PhenoExpressionShowcase", () => {
  it("renders the picker and the default selection side-by-side", () => {
    render(<PhenoExpressionShowcase />);
    expect(screen.getByTestId("pheno-expression-showcase")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-showcase-selected-count")).toHaveTextContent("4 selected");
    // default four candidates render
    for (const id of ["ex-gas-champion", "ex-dessert", "ex-fruit", "ex-herm-prone"]) {
      expect(screen.getByTestId(`pheno-candidate-${id}`)).toBeInTheDocument();
    }
  });

  it("shows loud trait axes, aroma, smoke test and COA on the gas champion", () => {
    render(<PhenoExpressionShowcase />);
    const gas = screen.getByTestId("pheno-candidate-ex-gas-champion");
    expect(
      within(gas).getByTestId("expression-trait-ex-gas-champion-nose_loudness"),
    ).toHaveTextContent(/10\/10 loud/);
    expect(within(gas).getByTestId("expression-aroma-ex-gas-champion")).toHaveTextContent(/gas/i);
    expect(within(gas).getByTestId("expression-smoke-test-ex-gas-champion")).toHaveTextContent(
      /keeper/i,
    );
    expect(within(gas).getByTestId("expression-lab-ex-gas-champion")).toHaveTextContent(/COA/i);
  });

  it("surfaces a suggest-only herm 'consider removing' flag on the herm pheno", () => {
    render(<PhenoExpressionShowcase />);
    const herm = screen.getByTestId("pheno-candidate-ex-herm-prone-herm-flag");
    expect(herm).toHaveTextContent(/consider removing/i);
    expect(herm).toHaveTextContent(/never removes a plant for you/i);
  });

  it("does NOT warn apples-to-apples when the default cohort shares grow + tent", () => {
    render(<PhenoExpressionShowcase />);
    expect(screen.queryByTestId("pheno-comparison-comparability-warning")).not.toBeInTheDocument();
  });

  it("warns apples-to-apples once a different-tent pheno is added", () => {
    render(<PhenoExpressionShowcase />);
    fireEvent.click(screen.getByTestId("pheno-showcase-select-ex-purple")); // Flower Tent 2
    expect(screen.getByTestId("pheno-comparison-comparability-warning")).toHaveTextContent(
      /different tents/i,
    );
  });

  it("mix-and-match: unticking a pheno removes its column and updates the count", () => {
    render(<PhenoExpressionShowcase />);
    expect(screen.getByTestId("pheno-candidate-ex-dessert")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pheno-showcase-select-ex-dessert"));
    expect(screen.queryByTestId("pheno-candidate-ex-dessert")).not.toBeInTheDocument();
    expect(screen.getByTestId("pheno-showcase-selected-count")).toHaveTextContent("3 selected");
  });

  it("shows the 'select at least two' state when fewer than two are selected", () => {
    render(<PhenoExpressionShowcase />);
    for (const id of ["ex-dessert", "ex-fruit", "ex-herm-prone"]) {
      fireEvent.click(screen.getByTestId(`pheno-showcase-select-${id}`));
    }
    expect(screen.getByTestId("pheno-showcase-selected-count")).toHaveTextContent("1 selected");
    expect(screen.getByTestId("pheno-comparison-error")).toBeInTheDocument();
  });
});
