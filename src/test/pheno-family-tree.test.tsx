import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PhenoFamilyTree from "@/components/PhenoFamilyTree";
import { buildPhenoPedigree } from "@/lib/phenoPedigreeViewModel";
import { buildCloneTreeRows } from "@/lib/phenoCloneTreeViewModel";
import { DEMO_KEEPERS, DEMO_CROSSES, DEMO_CLONES, DEMO_PHENO_HUNT } from "@/lib/demo/phenoHuntDemoFixture";

const K_GAS = DEMO_PHENO_HUNT.keeperIds.gasRuntz;
const pedigree = buildPhenoPedigree(DEMO_KEEPERS, DEMO_CROSSES);
const cloneRowsByKeeperId = { [K_GAS]: buildCloneTreeRows(DEMO_CLONES) };

function renderTree() {
  return render(
    <PhenoFamilyTree pedigree={pedigree} cloneRowsByKeeperId={cloneRowsByKeeperId} />,
  );
}

describe("PhenoFamilyTree", () => {
  it("renders both mothers with a reversed marker and stability read-out", () => {
    renderTree();
    // Keeper names also appear as cross parents, so scope to the keeper cards.
    const gasCard = screen.getByTestId(`pheno-family-keeper-${K_GAS}`);
    const cakeCard = screen.getByTestId(`pheno-family-keeper-${DEMO_PHENO_HUNT.keeperIds.sherbCake}`);
    expect(within(gasCard).getByText("Gas Runtz")).toBeInTheDocument();
    expect(within(cakeCard).getByText("Sherb Cake")).toBeInTheDocument();
    expect(screen.getByTestId(`pheno-family-keeper-reversed-${K_GAS}`)).toBeInTheDocument();
    expect(within(gasCard).getByText(/held 2 runs/i)).toBeInTheDocument();
  });

  it("renders crosses with the canonical badges and donor labels", () => {
    renderTree();
    expect(screen.getByTestId("pheno-family-cross-badge-cross-f1")).toHaveTextContent("F1");
    expect(screen.getByTestId("pheno-family-cross-badge-cross-s1")).toHaveTextContent("S1 / Selfed");
    expect(screen.getByText("Self")).toBeInTheDocument();
    expect(screen.getByText("Open pollination")).toBeInTheDocument();
    // "unknown keeper" appears for both the null-male F1 and the outside-hunt male.
    expect(screen.getAllByText("unknown keeper").length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces provenance honesty — flags are visible, not hidden", () => {
    renderTree();
    expect(screen.getByTestId("pheno-family-honesty-summary")).toHaveTextContent(/lineage note/i);
    expect(screen.getByTestId("pheno-family-flag-unknown_pollen_parent")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-family-flag-parent_not_in_hunt")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-family-flag-generation_unrecorded")).toBeInTheDocument();
  });

  it("Detailed toggle reveals the clone lineage", () => {
    renderTree();
    expect(screen.queryByTestId(`pheno-family-clones-${K_GAS}`)).toBeNull();
    fireEvent.click(screen.getByTestId("pheno-family-density-toggle"));
    expect(screen.getByTestId(`pheno-family-clones-${K_GAS}`)).toBeInTheDocument();
    expect(screen.getByText(/mother cut/i)).toBeInTheDocument();
  });

  it("shows a calm empty state with no lineage", () => {
    render(<PhenoFamilyTree pedigree={buildPhenoPedigree([], [])} />);
    expect(screen.getByTestId("pheno-family-empty")).toBeInTheDocument();
  });
});
