import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PhenoHuntStartPage from "@/components/PhenoHuntStartPage";
import type { CandidatePlant } from "@/lib/phenoHuntStartPageRules";

const plant = (over: Partial<CandidatePlant> = {}): CandidatePlant => ({
  id: "p1",
  name: "Plant 1",
  strain: "BB",
  stage: "veg",
  growId: "g1",
  tentId: "t1",
  isArchived: false,
  ...over,
});

function fillRequired() {
  fireEvent.change(screen.getByTestId("ph-input-name"), { target: { value: "Hunt A" } });
  fireEvent.change(screen.getByTestId("ph-input-cultivar"), { target: { value: "Blue Berry" } });
  fireEvent.change(screen.getByTestId("ph-select-goal"), { target: { value: "keeper_selection" } });
  fireEvent.change(screen.getByTestId("ph-input-start-date"), { target: { value: "2026-06-01" } });
}

describe("<PhenoHuntStartPage /> persistence wiring", () => {
  it("keeps Save disabled until required fields and candidates are valid", () => {
    render(<PhenoHuntStartPage allPlants={[plant()]} userId="u1" initialDraft={{ growId: "g1", tentId: "t1" }} />);
    const cta = screen.getByTestId("ph-save-cta") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fillRequired();
    expect(cta.disabled).toBe(true); // no candidate yet
    fireEvent.click(screen.getByTestId("ph-candidate-toggle-p1"));
    expect(cta.disabled).toBe(false);
    expect(cta).toHaveTextContent(/create pheno hunt/i);
  });

  it("calls createHunt exactly once on click and shows success copy", async () => {
    const create = vi.fn().mockResolvedValue({ ok: true, huntId: "h-1" });
    render(
      <PhenoHuntStartPage
        allPlants={[plant()]}
        userId="u1"
        initialDraft={{ growId: "g1", tentId: "t1" }}
        createHuntOverride={create}
      />,
    );
    fillRequired();
    fireEvent.click(screen.getByTestId("ph-candidate-toggle-p1"));
    fireEvent.click(screen.getByTestId("ph-save-cta"));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("ph-save-cta")).toHaveTextContent(/pheno hunt created/i),
    );
    expect(screen.getByTestId("ph-save-success")).toBeInTheDocument();
  });

  it("shows failure copy when create fails", async () => {
    const create = vi.fn().mockResolvedValue({
      ok: false,
      errorCode: "candidate_insert_failed",
      errorMessage: "fk fail",
    });
    render(
      <PhenoHuntStartPage
        allPlants={[plant()]}
        userId="u1"
        initialDraft={{ growId: "g1", tentId: "t1" }}
        createHuntOverride={create}
      />,
    );
    fillRequired();
    fireEvent.click(screen.getByTestId("ph-candidate-toggle-p1"));
    fireEvent.click(screen.getByTestId("ph-save-cta"));

    await waitFor(() => expect(screen.getByTestId("ph-save-error")).toBeInTheDocument());
    expect(screen.getByTestId("ph-save-error")).toHaveTextContent(/fk fail/i);
  });

  it("disables Save when userId is missing", () => {
    render(
      <PhenoHuntStartPage
        allPlants={[plant()]}
        initialDraft={{ growId: "g1", tentId: "t1" }}
      />,
    );
    fillRequired();
    fireEvent.click(screen.getByTestId("ph-candidate-toggle-p1"));
    const cta = screen.getByTestId("ph-save-cta") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(screen.getByTestId("ph-save-blocked-copy")).toHaveTextContent(/sign in/i);
  });
});
