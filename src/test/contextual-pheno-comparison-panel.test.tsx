/**
 * contextual-pheno-comparison-panel.test
 *
 * Read-only regression tests for ContextualPhenoComparisonPanel.
 * No fetch / Supabase / Edge / AI / Action Queue / device control allowed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import { buildContextualPhenoComparisonView } from "@/lib/contextualPhenoComparisonViewModel";
import { CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS } from "@/test/fixtures/contextualPhenoComparisonFixtures";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPanel() {
  const view = buildContextualPhenoComparisonView(
    CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
  );
  return { view, ...render(<ContextualPhenoComparisonPanel view={view} />) };
}

describe("ContextualPhenoComparisonPanel", () => {
  it("renders the demo banner", () => {
    renderPanel();
    const banner = screen.getByTestId("contextual-pheno-comparison-demo-banner");
    expect(banner.textContent).toMatch(/demo comparison data/i);
    expect(banner.textContent).toMatch(/not live sensor data/i);
  });

  it("renders the no-auto-pick caveat", () => {
    renderPanel();
    const caveat = screen.getByTestId("contextual-pheno-comparison-caveat");
    expect(caveat.textContent).toMatch(/does not pick a phenotype/i);
  });

  it("renders 3 plant cards in deterministic order (Alpha, Bravo, Charlie)", () => {
    renderPanel();
    const cards = screen.getAllByTestId(/contextual-pheno-comparison-plant-/);
    // strip the panel-level test ids
    const plantCards = cards.filter((el) =>
      el.getAttribute("data-testid")?.startsWith(
        "contextual-pheno-comparison-plant-demo-plant-",
      ),
    );
    expect(plantCards).toHaveLength(3);
    expect(plantCards.map((c) => c.getAttribute("data-plant-label"))).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("renders per-plant source quality counts separated by source", () => {
    renderPanel();
    const alpha = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-plant-alpha",
    );
    expect(within(alpha).getByTestId("plant-source-count-live")).toBeTruthy();
    expect(within(alpha).getByTestId("plant-source-count-manual")).toBeTruthy();
    expect(within(alpha).queryByTestId("plant-source-count-demo")).toBeNull();

    const charlie = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-plant-charlie",
    );
    expect(within(charlie).getByTestId("plant-source-count-demo")).toBeTruthy();
    expect(within(charlie).getByTestId("plant-source-count-invalid")).toBeTruthy();
  });

  it("flags demo/stale/invalid badges as untrusted", () => {
    renderPanel();
    const demoBadge = screen.getAllByTestId("plant-source-count-demo")[0];
    expect(demoBadge.getAttribute("data-untrusted")).toBe("true");
    const stale = screen.getByTestId("plant-source-count-stale");
    expect(stale.getAttribute("data-untrusted")).toBe("true");
    const invalid = screen.getByTestId("plant-source-count-invalid");
    expect(invalid.getAttribute("data-untrusted")).toBe("true");
  });

  it("renders per-plant missing context and cross-plant missing context", () => {
    renderPanel();
    const charlie = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-plant-charlie",
    );
    expect(within(charlie).getByTestId("plant-missing-context").textContent)
      .toMatch(/no diary entries/i);
    const cross = screen.getByTestId(
      "contextual-pheno-comparison-cross-missing",
    );
    expect(cross.textContent).toBeTruthy();
  });

  it("renders trusted/untrusted yes/no marker without ever calling Charlie healthy", () => {
    renderPanel();
    const charlie = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-plant-charlie",
    );
    expect(within(charlie).getByTestId("plant-trusted-context").textContent).toBe(
      "no",
    );
    expect(charlie.textContent || "").not.toMatch(/healthy/i);
  });

  it("does not contain ranking, winner, best-pheno, or auto-selection language", () => {
    const { container } = renderPanel();
    const txt = (container.textContent || "").toLowerCase();
    for (const banned of [
      "winner",
      "best pheno",
      "ranking",
      "rank ",
      "scoreboard",
      "automatically select",
      "auto select",
      "guaranteed",
    ]) {
      expect(txt.includes(banned)).toBe(false);
    }
  });

  it("renders no Action Queue / alert / device-control controls", () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
  });

  it("desktop layout: deterministic header/order snapshot", () => {
    renderPanel();
    const grid = screen.getByTestId("contextual-pheno-comparison-plant-grid");
    const headers = Array.from(grid.querySelectorAll("h3")).map((h) =>
      (h.textContent || "").trim(),
    );
    expect(headers).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("mobile viewport: deterministic header/order snapshot", () => {
    // Mobile innerWidth — order is determined by the view-model, not CSS,
    // so the header order must be identical at any viewport.
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
    renderPanel();
    const grid = screen.getByTestId("contextual-pheno-comparison-plant-grid");
    const headers = Array.from(grid.querySelectorAll("h3")).map((h) =>
      (h.textContent || "").trim(),
    );
    expect(headers).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("does not call fetch or any global network primitive during render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation(
      () => {
        throw new Error("fetch must not be called");
      },
    );
    renderPanel();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
