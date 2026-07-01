/**
 * contextual-pheno-comparison-a11y-viewports —
 *
 * Screen-reader / a11y regression for the Contextual Pheno Comparison
 * v0 panel at mobile (375px) and tablet (768px) widths.
 *
 * jsdom does not compute responsive layout; viewport width is set so
 * media-query-aware code branches match, but assertions target DOM
 * presence + accessible names / roles. Playwright specs cover visible
 * regression.
 *
 * Verifies (at both viewports):
 *  - demo banner is announced (role=note) with descriptive text
 *  - caveat / plant-count are readable text (not hidden)
 *  - each plant card is a semantic <article> with an h3 name
 *  - each card exposes h4 section headers (Evidence, Environment)
 *  - untrusted source badges expose a caution accessible name
 *  - risky (stale/invalid/demo/unknown) badges do NOT announce healthy/OK/success
 *  - no interactive/write controls are exposed
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import { buildContextualPhenoComparisonView } from "@/lib/contextualPhenoComparisonViewModel";
import { CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS } from "@/test/fixtures/contextualPhenoComparisonFixtures";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error(
          "ContextualPhenoComparison a11y viewport test must not touch supabase.",
        );
      },
    },
  ),
}));

const VIEWPORTS: ReadonlyArray<{ name: string; width: number; height: number }> = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
  window.dispatchEvent(new Event("resize"));
}

function renderPanel() {
  const view = buildContextualPhenoComparisonView(
    CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS,
  );
  return { view, ...render(<ContextualPhenoComparisonPanel view={view} />) };
}

/**
 * Text that would falsely imply a risky/untrusted state is "healthy" or
 * "OK". Deliberately narrow — allows honest negations like
 * "not healthy" / "never shown as healthy".
 */
function accessibleTextImpliesHealthy(raw: string): boolean {
  const text = raw.toLowerCase();
  const affirmatives = [
    "\\bhealthy\\b",
    "\\bok\\b",
    "\\bnormal\\b",
    "\\bverified\\b",
    "\\bpassed\\b",
    "\\bsuccess\\b",
    "\\ball good\\b",
    "\\bno issues detected\\b",
  ];
  return affirmatives.some((word) => {
    const re = new RegExp(word);
    if (!re.test(text)) return false;
    // Allow honest negation immediately preceding the word.
    const negated = new RegExp(
      `(?:not|never|no|excluded from|shouldn't be|is not)\\s+(?:\\w+\\s+){0,4}${word}`,
    );
    return !negated.test(text);
  });
}

for (const vp of VIEWPORTS) {
  describe(`ContextualPhenoComparisonPanel a11y — ${vp.name}`, () => {
    beforeEach(() => setViewport(vp.width, vp.height));
    afterEach(() => cleanup());

    it("demo banner is exposed as role=note with descriptive not-live text", () => {
      renderPanel();
      const note = screen.getByRole("note");
      expect(note).toHaveTextContent(/demo comparison data/i);
      expect(note).toHaveTextContent(/not live/i);
    });

    it("caveat and plant count remain readable (present in DOM, not aria-hidden)", () => {
      renderPanel();
      const caveat = screen.getByTestId("contextual-pheno-comparison-caveat");
      const count = screen.getByTestId(
        "contextual-pheno-comparison-plant-count",
      );
      expect(caveat).toBeInTheDocument();
      expect(caveat).not.toHaveAttribute("aria-hidden", "true");
      expect(count).toBeInTheDocument();
      expect(count).not.toHaveAttribute("aria-hidden", "true");
    });

    it("each plant card is an <article> with an h3 name matching the plant label", () => {
      const { view } = renderPanel();
      const cards = screen.getAllByRole("article");
      expect(cards.length).toBe(view.plants.length);
      cards.forEach((card, i) => {
        const h3 = within(card).getByRole("heading", { level: 3 });
        expect(h3.textContent).toBe(view.plants[i].plantLabel);
      });
    });

    it("each plant card exposes h4 section headers (Evidence, Environment)", () => {
      renderPanel();
      const cards = screen.getAllByRole("article");
      for (const card of cards) {
        const h4s = within(card)
          .getAllByRole("heading", { level: 4 })
          .map((h) => h.textContent ?? "");
        expect(h4s).toContain("Evidence");
        expect(h4s.some((t) => t.startsWith("Environment"))).toBe(true);
      }
    });

    it("untrusted source badges expose a caution accessible name via title + text", () => {
      renderPanel();
      const untrusted = document.querySelectorAll(
        '[data-testid^="plant-source-count-"][data-untrusted="true"]',
      );
      expect(untrusted.length).toBeGreaterThan(0);
      untrusted.forEach((node) => {
        const title = (node.getAttribute("title") ?? "").toLowerCase();
        expect(title).toContain("caution");
        expect(node.textContent ?? "").toMatch(/caution, untrusted/i);
      });
    });

    it("no risky badge or empty-state announces healthy/OK/success", () => {
      renderPanel();
      const risky = document.querySelectorAll(
        '[data-untrusted="true"], [data-testid^="plant-empty-state-"], [data-testid="contextual-pheno-comparison-all-insufficient"], [data-testid="plant-trust-warnings"]',
      );
      risky.forEach((node) => {
        const accessible = [
          node.getAttribute("aria-label") ?? "",
          node.getAttribute("title") ?? "",
          node.textContent ?? "",
        ].join(" ");
        expect(
          accessibleTextImpliesHealthy(accessible),
          `risky node announced healthy-language text: "${accessible.slice(0, 200)}"`,
        ).toBe(false);
      });
    });

    it("panel exposes zero interactive controls (read-only, no writes)", () => {
      renderPanel();
      const panel = screen.getByTestId("contextual-pheno-comparison-panel");
      expect(
        panel.querySelectorAll(
          "button, a[href], input, select, textarea, form, [role='button']",
        ).length,
      ).toBe(0);
    });
  });
}
