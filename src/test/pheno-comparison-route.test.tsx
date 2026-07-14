/**
 * Pheno Comparison — route / presenter tests (selection-grade surface).
 *
 * Covers:
 *   - Route renders; two+ candidates side-by-side.
 *   - Read-only + demo/sample labeling; confidence caveat; six-source legend.
 *   - Comparability panel + verdict + reasons.
 *   - Selection-strength headline chip (phenotype-driven, not telemetry).
 *   - Phenotype rows, post-cure, and the demoted "environment context —
 *     not a selection signal" section (sensors no longer headline).
 *   - Missing-photo caveat; stale/invalid telemetry stays cautious in context.
 *   - NEGATIVE: no healthy/OK and no winner/keeper language anywhere.
 *   - No write controls; no Action Queue / device-control / automation copy.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PhenoComparison from "@/pages/PhenoComparison";
import { containsHealthyStatusLanguage } from "@/lib/phenoComparisonRules";
import { containsSelectionOverclaim } from "@/lib/phenoSelectionRules";

function renderRoute(path = "/pheno-comparison") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pheno-comparison" element={<PhenoComparison />} />
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN_COPY = [
  "action queue",
  "approve action",
  "execute",
  "run command",
  "send command",
  "control device",
  "device control",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "automation",
  "automate",
  "actuate",
];

describe("PhenoComparison route", () => {
  it("renders at /pheno-comparison", () => {
    renderRoute();
    expect(screen.getByTestId("pheno-comparison-page")).toBeTruthy();
  });

  it("renders at least two candidate cards", () => {
    const { container } = renderRoute();
    const cards = container.querySelectorAll(
      '[data-testid^="pheno-comparison-candidate-"]',
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("shows read-only + sample labeling and the confidence caveat", () => {
    renderRoute();
    expect(screen.getByTestId("pheno-comparison-readonly-badge").textContent).toMatch(
      /read-only/i,
    );
    expect(screen.getByTestId("pheno-comparison-sample-badge")).toBeTruthy();
    expect(screen.getByTestId("pheno-comparison-demo-banner").textContent).toMatch(
      /not real telemetry/i,
    );
    expect(screen.getByTestId("pheno-comparison-confidence-caveat")).toBeTruthy();
  });

  it("grades comparability with a verdict and reasons", () => {
    renderRoute();
    const verdict = screen.getByTestId("pheno-comparability-verdict");
    expect(verdict.getAttribute("data-verdict")).toBe("not_comparable");
    expect(verdict.textContent).toMatch(/not directly comparable/i);
    expect(
      screen.getByTestId("pheno-comparability-reason-0").textContent?.length,
    ).toBeGreaterThan(0);
  });

  it("shows a phenotype-driven selection-strength chip per candidate", () => {
    renderRoute();
    expect(
      screen.getByTestId("pheno-selection-strength-cand-1").getAttribute("data-strength"),
    ).toBe("strong");
    expect(
      screen.getByTestId("pheno-selection-strength-cand-3").getAttribute("data-strength"),
    ).toBe("thin");
  });

  it("renders phenotype trait rows and post-cure", () => {
    renderRoute();
    expect(screen.getByTestId("pheno-trait-cand-1-resin")).toBeTruthy();
    expect(screen.getByTestId("pheno-postcure-cand-1").getAttribute("data-cured")).toBe(
      "true",
    );
    // Uncured candidate is flagged, not hidden.
    expect(screen.getByTestId("pheno-postcure-cand-3").getAttribute("data-cured")).toBe(
      "false",
    );
  });

  it("demotes sensors to a labeled 'not a selection signal' context section", () => {
    renderRoute();
    // One demoted context section per candidate card.
    const env = screen.getAllByText(/environment context — not a selection signal/i);
    expect(env.length).toBeGreaterThanOrEqual(2);
    // Source badge lives inside the demoted context, not as a card headline.
    expect(
      screen.getByTestId("pheno-source-badge-cand-1").getAttribute("data-source"),
    ).toBe("manual");
  });

  it("keeps stale/invalid telemetry cautious in the context section", () => {
    renderRoute();
    expect(screen.getByTestId("pheno-envcontext-stale-cand-3")).toBeTruthy();
    expect(screen.getByTestId("pheno-envcontext-invalid-cand-4")).toBeTruthy();
  });

  it("renders the missing-photo caveat", () => {
    renderRoute();
    expect(screen.getByTestId("pheno-photo-missing-cand-3")).toBeTruthy();
    expect(screen.getByTestId("pheno-flag-cand-3-no_photo")).toBeTruthy();
  });

  it("shows all six canonical source labels in the legend", () => {
    renderRoute();
    for (const key of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(screen.getByTestId(`pheno-source-legend-${key}`)).toBeTruthy();
    }
  });
});

describe("PhenoComparison — never overstates", () => {
  it("uses no positive health language and no winner/keeper language page-wide", () => {
    renderRoute();
    const text = document.body.textContent ?? "";
    expect(containsHealthyStatusLanguage(text)).toBe(false);
    expect(containsSelectionOverclaim(text)).toBe(false);
  });

  it("thin / uncured candidate cards never read as a pick or as healthy", () => {
    renderRoute();
    for (const id of ["cand-3", "cand-4"]) {
      const card = screen.getByTestId(`pheno-comparison-candidate-${id}`);
      const txt = card.textContent ?? "";
      expect(containsHealthyStatusLanguage(txt)).toBe(false);
      expect(containsSelectionOverclaim(txt)).toBe(false);
    }
  });
});

describe("PhenoComparison — read-only safety", () => {
  it("renders no interactive write controls", () => {
    const { container } = renderRoute();
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.querySelectorAll("input, textarea, select").length).toBe(0);
  });

  it("contains no Action Queue / device-control / automation language", () => {
    renderRoute();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const phrase of FORBIDDEN_COPY) {
      expect(text, `forbidden copy present: ${phrase}`).not.toContain(phrase);
    }
  });
});
