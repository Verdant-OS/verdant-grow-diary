import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PhenoHuntStartPage from "@/components/PhenoHuntStartPage";
import type { CandidatePlant } from "@/lib/phenoHuntStartPageRules";

const plant = (over: Partial<CandidatePlant>): CandidatePlant => ({
  id: "p1",
  name: "Plant 1",
  strain: "Blue Berry",
  stage: "veg",
  growId: "g1",
  tentId: "t1",
  isArchived: false,
  ...over,
});

describe("<PhenoHuntStartPage />", () => {
  it("renders title and subtitle", () => {
    render(<PhenoHuntStartPage allPlants={[]} />);
    expect(screen.getByRole("heading", { name: /start pheno hunt/i })).toBeInTheDocument();
    expect(screen.getByText(/Set up a hunt, define the goal/i)).toBeInTheDocument();
    expect(screen.getByTestId("pheno-hunt-safety-note")).toHaveTextContent(
      /does not make genetic certainty claims/i,
    );
  });

  it("renders all 8 project goal options", () => {
    render(<PhenoHuntStartPage allPlants={[]} />);
    const select = screen.getByTestId("ph-select-goal") as HTMLSelectElement;
    // 8 goals + 1 placeholder
    expect(select.options.length).toBe(9);
    expect(select.options[1].text).toBe("Keeper selection");
  });

  it("shows no-grow empty state initially", () => {
    render(<PhenoHuntStartPage allPlants={[plant({})]} />);
    expect(screen.getByTestId("ph-empty-state")).toHaveTextContent(
      /choose a grow/i,
    );
  });

  it("renders eligible candidates filtered by grow/tent", () => {
    render(
      <PhenoHuntStartPage
        allPlants={[
          plant({ id: "a", name: "Alpha" }),
          plant({ id: "b", name: "Beta", tentId: "other" }),
          plant({ id: "c", name: "Gamma", growId: "other-grow" }),
        ]}
        initialDraft={{ growId: "g1", tentId: "t1" }}
      />,
    );
    expect(screen.getByTestId("ph-candidate-a")).toBeInTheDocument();
    expect(screen.queryByTestId("ph-candidate-b")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ph-candidate-c")).not.toBeInTheDocument();
  });

  it("toggling a candidate updates the summary", () => {
    render(
      <PhenoHuntStartPage
        allPlants={[plant({ id: "a", name: "Alpha" })]}
        initialDraft={{ growId: "g1", tentId: "t1", cultivar: "Blue Berry" }}
      />,
    );
    fireEvent.click(screen.getByTestId("ph-candidate-toggle-a"));
    const summary = screen.getByTestId("ph-summary");
    expect(within(summary).getByText(/BB-01/)).toBeInTheDocument();
  });

  it("save CTA is disabled until required setup is complete", () => {
    render(<PhenoHuntStartPage allPlants={[]} />);
    const cta = screen.getByTestId("ph-save-cta") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta).toHaveTextContent(/complete required setup/i);
    expect(screen.getByTestId("ph-save-blocked-copy")).toBeInTheDocument();
  });

  it("archived plants only show when 'Show archived' is toggled, and are labeled", () => {
    render(
      <PhenoHuntStartPage
        allPlants={[plant({ id: "a", name: "Arch", isArchived: true })]}
        initialDraft={{ growId: "g1", tentId: "t1" }}
      />,
    );
    expect(screen.queryByTestId("ph-candidate-a")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ph-toggle-archived"));
    const row = screen.getByTestId("ph-candidate-a");
    expect(within(row).getByText(/Archived/)).toBeInTheDocument();
  });

  it("shows missing-required warning when draft incomplete", () => {
    render(<PhenoHuntStartPage allPlants={[]} />);
    expect(screen.getByTestId("ph-missing-required")).toHaveTextContent(
      /complete the required fields/i,
    );
  });
});
