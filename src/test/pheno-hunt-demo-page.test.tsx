/**
 * pheno-hunt-demo-page.test — read-only tests for the /internal/pheno-hunt-demo
 * walkthrough page. Fixture-only; no fetch, no writes.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PhenoHuntDemo from "@/pages/PhenoHuntDemo";
import { DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PhenoHuntDemo />
    </MemoryRouter>,
  );
}

describe("PhenoHuntDemo page", () => {
  it("renders the page shell with demo labeling", () => {
    renderPage();
    expect(screen.getByTestId("pheno-hunt-demo-page")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-hunt-demo-banner").textContent).toMatch(/demo/i);
  });

  it("walks the whole pack (every candidate) in number order", () => {
    renderPage();
    const nums = screen
      .getAllByTestId(/pheno-hunt-demo-candidate-\d+/)
      .map((el) =>
        Number(el.getAttribute("data-testid")!.replace("pheno-hunt-demo-candidate-", "")),
      );
    expect(nums).toEqual([...DEMO_CANDIDATES].map((c) => c.candidateNumber).sort((a, b) => a - b));
  });

  it("renders the family tree with its honest provenance flags", () => {
    renderPage();
    expect(screen.getByTestId("pheno-family-tree")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-family-honesty-summary")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-family-flag-unknown_pollen_parent")).toBeInTheDocument();
  });

  it("renders the contenders board with its trait comparison", () => {
    renderPage();
    expect(screen.getByTestId("pheno-contenders")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-contenders-caveat").textContent).toMatch(/doesn't decide/i);
  });

  it("renders fight night with the two keepers head to head", () => {
    renderPage();
    expect(screen.getByTestId("pheno-fight")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-fight-caveat").textContent).toMatch(/you make the call/i);
  });

  it("frames the score as a shortlist, not a verdict (ethos)", () => {
    renderPage();
    expect(screen.getByTestId("pheno-hunt-demo-caveat").textContent).toMatch(/not the verdict/i);
  });

  it("does not call fetch on render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation(() => {
      throw new Error("fetch must not be called");
    });
    renderPage();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
