import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import PhenoRadar from "@/components/PhenoRadar";

afterEach(cleanup);

describe("PhenoRadar", () => {
  it("renders a labeled 5-axis radar", () => {
    render(<PhenoRadar values={{ nose: 9, resin: 8, structure: 7, yield: 7, breeding: 8 }} />);
    const svg = screen.getByTestId("pheno-radar");
    expect(svg).toBeInTheDocument();
    for (const letter of ["N", "R", "S", "Y", "B"]) {
      expect(within(svg).getByText(letter)).toBeInTheDocument();
    }
  });

  it("clamps out-of-range values without throwing", () => {
    expect(() =>
      render(
        <PhenoRadar
          values={{ nose: 99, resin: -3, structure: 5, yield: 5, breeding: 5 }}
          tone="keeper"
        />,
      ),
    ).not.toThrow();
  });
});
