/**
 * contextual-pheno-comparison-panel-a11y.test
 *
 * Accessibility regression tests for the Contextual Pheno Comparison v0
 * presenter. Verifies:
 *  - heading hierarchy (h3 plant labels, h4 section headers)
 *  - demo banner exposed as role="note"
 *  - untrusted source badges expose an accessible caution name via
 *    visually-hidden text and a descriptive title
 *  - panel has no interactive controls (read-only) so keyboard tab order
 *    does not include any focus-trapping inside it
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import { buildContextualPhenoComparisonView } from "@/lib/contextualPhenoComparisonViewModel";
import { CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS } from "@/test/fixtures/contextualPhenoComparisonFixtures";

function renderPanel() {
  const view = buildContextualPhenoComparisonView(
    CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
  );
  return { view, ...render(<ContextualPhenoComparisonPanel view={view} />) };
}

describe("ContextualPhenoComparisonPanel accessibility", () => {
  it("renders one h3 per plant in deterministic order", () => {
    const { view } = renderPanel();
    const h3s = screen.getAllByRole("heading", { level: 3 });
    expect(h3s.map((h) => h.textContent)).toEqual(
      view.plants.map((p) => p.plantLabel),
    );
  });

  it("each plant card has h4 section headers for Evidence and Environment", () => {
    renderPanel();
    const cards = screen.getAllByRole("article");
    for (const card of cards) {
      const h4s = within(card).getAllByRole("heading", { level: 4 });
      const text = h4s.map((h) => h.textContent ?? "");
      expect(text).toContain("Evidence");
      expect(text.some((t) => t.startsWith("Environment"))).toBe(true);
    }
  });

  it("demo banner is exposed as role=note with descriptive text", () => {
    renderPanel();
    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/demo comparison data/i);
    expect(note.textContent).not.toMatch(/\blive\b(?!\s+sensor)/i);
  });

  it("untrusted source badges expose a caution accessible name", () => {
    renderPanel();
    const untrusted = document.querySelectorAll(
      '[data-testid^="plant-source-count-"][data-untrusted="true"]',
    );
    expect(untrusted.length).toBeGreaterThan(0);
    untrusted.forEach((node) => {
      const title = node.getAttribute("title") ?? "";
      expect(title.toLowerCase()).toContain("caution");
      expect(node.textContent ?? "").toMatch(/caution, untrusted/i);
    });
  });

  it("trusted source badges do not announce a caution warning", () => {
    renderPanel();
    const trusted = document.querySelectorAll(
      '[data-testid^="plant-source-count-"][data-untrusted="false"]',
    );
    expect(trusted.length).toBeGreaterThan(0);
    trusted.forEach((node) => {
      expect((node.getAttribute("title") ?? "").toLowerCase()).not.toContain(
        "caution",
      );
      expect(node.textContent ?? "").not.toMatch(/caution/i);
    });
  });

  it("renders no interactive controls (read-only) so Tab cannot land inside the panel", async () => {
    const user = userEvent.setup();
    renderPanel();
    const panel = screen.getByTestId("contextual-pheno-comparison-panel");
    expect(panel.querySelectorAll("button, a, input, select, textarea")).toHaveLength(0);

    // Sentinel button outside the panel — Tab order should reach it without
    // being trapped by any interactive child inside the panel.
    const sentinel = document.createElement("button");
    sentinel.textContent = "sentinel";
    sentinel.setAttribute("data-testid", "sentinel");
    document.body.appendChild(sentinel);
    try {
      await user.tab();
      expect(document.activeElement).toBe(sentinel);
    } finally {
      sentinel.remove();
    }
  });

  it("uppercase visual styling does not change the accessible heading text", () => {
    renderPanel();
    const evidence = screen.getAllByRole("heading", { level: 4, name: "Evidence" });
    expect(evidence.length).toBeGreaterThan(0);
  });
});
