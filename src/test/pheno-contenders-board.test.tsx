import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import PhenoContendersBoard from "@/components/PhenoContendersBoard";
import { buildContenders, type ContenderInput } from "@/lib/phenoContendersViewModel";
import { DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

const DEMO_INPUT: ContenderInput[] = DEMO_CANDIDATES.map((c) => ({
  id: c.candidateNumber,
  name: c.name,
  verdict: c.verdict,
  aroma: c.aroma,
  axes: c.loud,
}));

afterEach(cleanup);

function renderBoard() {
  return render(<PhenoContendersBoard board={buildContenders(DEMO_INPUT)} />);
}

describe("PhenoContendersBoard", () => {
  it("renders one row per contender and excludes culls", () => {
    renderBoard();
    expect(screen.getByTestId("pheno-contenders")).toBeInTheDocument();
    const rows = screen.getAllByTestId(/pheno-contenders-row-\d+/);
    const nonCulls = DEMO_CANDIDATES.filter((c) => c.verdict !== "cull");
    expect(rows).toHaveLength(nonCulls.length);
    // A culled candidate (#4 Runtz #4) must not have a row.
    expect(screen.queryByTestId("pheno-contenders-row-4")).toBeNull();
  });

  it("notes how many were culled", () => {
    renderBoard();
    const culls = DEMO_CANDIDATES.filter((c) => c.verdict === "cull").length;
    expect(screen.getByTestId("pheno-contenders-culled").textContent).toContain(String(culls));
  });

  it("flags the trait leaders (nose → Gas Runtz row)", () => {
    renderBoard();
    // Gas Runtz is candidate #3; it leads nose (9) and should carry the marker.
    expect(screen.getByTestId("pheno-contenders-leader-3-nose")).toBeInTheDocument();
    // Sherb Cake (#7) leads resin (9).
    expect(screen.getByTestId("pheno-contenders-leader-7-resin")).toBeInTheDocument();
    // Runtz #2 (#2) leads neither nose nor resin.
    expect(screen.queryByTestId("pheno-contenders-leader-2-nose")).toBeNull();
  });

  it("shows each contender's axis value inside its own cell", () => {
    renderBoard();
    const gasNose = screen.getByTestId("pheno-contenders-axis-3-nose");
    expect(within(gasNose).getByText("9")).toBeInTheDocument();
  });

  it("keeps the ethos caveat: it sorts, it doesn't decide", () => {
    renderBoard();
    expect(screen.getByTestId("pheno-contenders-caveat").textContent).toMatch(/doesn't decide/i);
  });

  it("shows a calm empty state when everything is culled", () => {
    render(
      <PhenoContendersBoard
        board={buildContenders([
          {
            id: 1,
            name: "X",
            verdict: "cull",
            axes: { nose: 1, resin: 1, structure: 1, yield: 1, breeding: 1 },
          },
        ])}
      />,
    );
    expect(screen.getByTestId("pheno-contenders-empty")).toBeInTheDocument();
  });
});
