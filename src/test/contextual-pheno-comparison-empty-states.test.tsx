/**
 * contextual-pheno-comparison-empty-states.test
 *
 * v0.3 regressions for empty-state UI on plants with missing / unknown /
 * insufficient evidence. Verifies cautious copy, untrusted-only handling,
 * and that header + plant-grid ordering remains deterministic when
 * empty-state cards are mixed with full-context cards.
 *
 * Read-only. No fetch / Supabase / Edge / AI / Action Queue / device control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import {
  buildContextualPhenoComparisonView,
  type ContextualPhenoPlantInput,
} from "@/lib/contextualPhenoComparisonViewModel";
import { CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS } from "@/test/fixtures/contextualPhenoComparisonFixtures";

const BANNED_TOKENS = [
  "healthy",
  "winner",
  "best pheno",
  "ranking",
  "rank ",
  "scoreboard",
  "automatically select",
  "auto select",
  "guaranteed",
  "definitely",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "apply pesticide",
];

function renderEmptyStatePanel(
  inputs: readonly ContextualPhenoPlantInput[] = CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS,
) {
  const view = buildContextualPhenoComparisonView(inputs);
  return { view, ...render(<ContextualPhenoComparisonPanel view={view} />) };
}

function topLevelTestIds(panel: HTMLElement): string[] {
  return Array.from(panel.children)
    .map((c) => (c as HTMLElement).getAttribute("data-testid"))
    .filter((v): v is string => Boolean(v));
}

function plantCardLabels(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid^="contextual-pheno-comparison-plant-"][data-plant-label]',
    ),
  ).map((el) => el.getAttribute("data-plant-label") ?? "");
}

function emptyStateIds(card: HTMLElement): string[] {
  return Array.from(
    card.querySelectorAll<HTMLElement>("[data-empty-state-id]"),
  ).map((el) => el.getAttribute("data-empty-state-id") ?? "");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ContextualPhenoComparisonPanel v0.3 empty states", () => {
  it("renders no empty-state section for a fully-documented plant", () => {
    renderEmptyStatePanel();
    const full = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-empty-full",
    );
    expect(within(full).queryByTestId("plant-empty-states")).toBeNull();
  });

  it("renders cautious copy for the sparse plant (no photos, no sensors, no feeding)", () => {
    renderEmptyStatePanel();
    const sparse = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-empty-sparse",
    );
    const ids = emptyStateIds(sparse);
    // Deterministic, ordered subset of the locked rule order.
    expect(ids).toEqual([
      "photos",
      "watering",
      "feeding",
      "sensor",
      "no-trusted-context",
      "environment-summary",
    ]);
    expect(within(sparse).getByTestId("plant-empty-state-photos").textContent)
      .toMatch(/no photos available/i);
    expect(within(sparse).getByTestId("plant-empty-state-sensor").textContent)
      .toMatch(/no sensor readings recorded/i);
    expect(
      within(sparse).getByTestId("plant-empty-state-environment-summary")
        .textContent,
    ).toMatch(/environment summary unavailable/i);
    // Sparse has a diary entry — do NOT show "no diary" empty state.
    expect(within(sparse).queryByTestId("plant-empty-state-diary")).toBeNull();
  });

  it("renders untrusted-only + unknown-metadata copy for the untrusted plant", () => {
    renderEmptyStatePanel();
    const card = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-empty-untrusted",
    );
    const ids = emptyStateIds(card);
    expect(ids).toEqual([
      "diary",
      "photos",
      "watering",
      "feeding",
      "untrusted-only",
      "no-trusted-context",
      "environment-summary",
      "stage",
      "strain",
      "status",
    ]);
    expect(
      within(card).getByTestId("plant-empty-state-untrusted-only").textContent,
    ).toMatch(/untrusted sensor evidence only/i);
    expect(
      within(card).getByTestId("plant-empty-state-untrusted-only").textContent,
    ).toMatch(/do not use as live context/i);
    expect(within(card).getByTestId("plant-empty-state-stage").textContent)
      .toMatch(/stage unknown/i);
    expect(within(card).getByTestId("plant-empty-state-strain").textContent)
      .toMatch(/strain/i);
    expect(within(card).getByTestId("plant-empty-state-status").textContent)
      .toMatch(/status unknown/i);
  });

  it("never labels the untrusted plant as having trusted sensor context", () => {
    renderEmptyStatePanel();
    const card = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-empty-untrusted",
    );
    expect(
      within(card).getByTestId("plant-trusted-context").textContent,
    ).toBe("no");
    expect(card.textContent || "").not.toMatch(/healthy/i);
  });

  it("renders source badges as caution/untrusted for the untrusted plant", () => {
    renderEmptyStatePanel();
    const card = screen.getByTestId(
      "contextual-pheno-comparison-plant-demo-empty-untrusted",
    );
    // Unknown vendor strings are normalized to "unknown" by the view-model.
    const demo = within(card).getByTestId("plant-source-count-demo");
    const invalid = within(card).getByTestId("plant-source-count-invalid");
    const unknown = within(card).getByTestId("plant-source-count-unknown");
    for (const badge of [demo, invalid, unknown]) {
      expect(badge.getAttribute("data-untrusted")).toBe("true");
      expect((badge.getAttribute("title") || "").toLowerCase()).toContain(
        "caution",
      );
    }
    // And no live-styled badge slipped in.
    expect(within(card).queryByTestId("plant-source-count-live")).toBeNull();
  });

  it("renders no banned ranking / certainty / device-control wording anywhere", () => {
    const { container } = renderEmptyStatePanel();
    const txt = (container.textContent || "").toLowerCase();
    for (const banned of BANNED_TOKENS) {
      expect(
        txt.includes(banned),
        `panel contained banned token: ${banned}`,
      ).toBe(false);
    }
  });

  it("does not call fetch during render of the empty-state panel", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockImplementation(() => {
        throw new Error("fetch must not be called");
      });
    renderEmptyStatePanel();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("deterministic ordering with empty / unknown plants mixed in", () => {
    it("top-level panel header order is preserved", () => {
      renderEmptyStatePanel();
      const panel = screen.getByTestId("contextual-pheno-comparison-panel");
      expect(topLevelTestIds(panel)).toEqual([
        "contextual-pheno-comparison-demo-banner",
        "contextual-pheno-comparison-caveat",
        "contextual-pheno-comparison-plant-count",
        "contextual-pheno-comparison-plant-grid",
        "contextual-pheno-comparison-source-summary",
      ]);
    });

    it("plant card label order follows the view-model (alpha by label) — not by evidence count", () => {
      renderEmptyStatePanel();
      // Fixture inputs are intentionally NOT in alphabetical input order to
      // prove the view-model sort, not input order, drives card layout.
      expect(plantCardLabels()).toEqual([
        "Full",
        "Partial",
        "Sparse",
        "Untrusted",
      ]);
    });

    it("repeated renders produce identical plant card ordering", () => {
      const orders: string[][] = [];
      for (let i = 0; i < 3; i++) {
        renderEmptyStatePanel();
        orders.push(plantCardLabels());
        cleanup();
      }
      expect(orders[0]).toEqual(orders[1]);
      expect(orders[1]).toEqual(orders[2]);
    });

    it("2-plant layout (full + untrusted) keeps deterministic order", () => {
      const two = [
        CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS[3], // Untrusted
        CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS[0], // Full
      ];
      renderEmptyStatePanel(two);
      expect(plantCardLabels()).toEqual(["Full", "Untrusted"]);
    });

    it("3-plant layout (full + partial + sparse) keeps deterministic order", () => {
      renderEmptyStatePanel(
        CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS.slice(0, 3),
      );
      expect(plantCardLabels()).toEqual(["Full", "Partial", "Sparse"]);
    });

    it("4-plant layout keeps deterministic order", () => {
      renderEmptyStatePanel();
      expect(plantCardLabels()).toHaveLength(4);
    });
  });

  describe("desktop + mobile snapshots remain stable with empty-state cards", () => {
    function setViewport(w: number, h: number) {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
      window.dispatchEvent(new Event("resize"));
    }

    beforeEach(() => setViewport(1280, 800));

    it("desktop: header text list snapshot", () => {
      renderEmptyStatePanel();
      const grid = screen.getByTestId("contextual-pheno-comparison-plant-grid");
      const headers = Array.from(grid.querySelectorAll("h3")).map((h) =>
        (h.textContent || "").trim(),
      );
      expect(headers).toMatchInlineSnapshot(`
        [
          "Full",
          "Partial",
          "Sparse",
          "Untrusted",
        ]
      `);
    });

    it("desktop: untrusted-card empty-state text list snapshot", () => {
      renderEmptyStatePanel();
      const card = screen.getByTestId(
        "contextual-pheno-comparison-plant-demo-empty-untrusted",
      );
      const texts = Array.from(
        card.querySelectorAll<HTMLElement>("[data-empty-state-id]"),
      ).map((el) => (el.textContent || "").trim());
      expect(texts).toMatchInlineSnapshot(`
        [
          "No recent diary evidence yet.",
          "No photos available for this comparison.",
          "No watering entries recorded.",
          "No feeding entries recorded.",
          "Untrusted sensor evidence only — do not use as live context.",
          "No trusted sensor context available.",
          "Environment summary unavailable.",
          "Stage unknown.",
          "Strain / genetics unknown.",
          "Status unknown.",
        ]
      `);
    });

    it("mobile: header text list snapshot identical to desktop", () => {
      setViewport(390, 844);
      renderEmptyStatePanel();
      const grid = screen.getByTestId("contextual-pheno-comparison-plant-grid");
      const headers = Array.from(grid.querySelectorAll("h3")).map((h) =>
        (h.textContent || "").trim(),
      );
      expect(headers).toEqual(["Full", "Partial", "Sparse", "Untrusted"]);
    });
  });
});
