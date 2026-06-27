/**
 * contextual-pheno-comparison-demo-page.test
 *
 * Read-only tests for the ContextualPhenoComparisonDemo route page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ContextualPhenoComparisonDemo from "@/pages/ContextualPhenoComparisonDemo";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ContextualPhenoComparisonDemo />
    </MemoryRouter>,
  );
}

describe("ContextualPhenoComparisonDemo page", () => {
  it("renders the page shell with demo labeling", () => {
    renderPage();
    expect(screen.getByTestId("contextual-pheno-comparison-demo-page")).toBeTruthy();
    expect(
      screen.getByTestId("contextual-pheno-comparison-demo-banner").textContent,
    ).toMatch(/demo/i);
  });

  it("renders all 3 fixture plant cards in deterministic order", () => {
    renderPage();
    const cards = screen
      .getAllByTestId(/contextual-pheno-comparison-plant-demo-plant-/)
      .map((c) => c.getAttribute("data-plant-label"));
    expect(cards).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("renders the comparison caveat", () => {
    renderPage();
    expect(
      screen.getByTestId("contextual-pheno-comparison-caveat").textContent,
    ).toMatch(/does not pick a phenotype/i);
  });

  it("does not call fetch on render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation(
      () => {
        throw new Error("fetch must not be called");
      },
    );
    renderPage();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders no save / share / export / AI / Action Queue / device controls", () => {
    const { container } = renderPage();
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    const txt = (container.textContent || "").toLowerCase();
    for (const banned of [
      "save comparison",
      "share comparison",
      "export pdf",
      "download pdf",
      "ai insight",
      "generate insight",
      "add to action queue",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
      "winner",
      "best pheno",
    ]) {
      expect(txt.includes(banned)).toBe(false);
    }
  });
});
