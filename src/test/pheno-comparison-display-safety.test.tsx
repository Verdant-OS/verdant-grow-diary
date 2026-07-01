/**
 * Pheno Comparison — display-safety hardening (selection-grade surface).
 *
 * Covers:
 *   - Demo-safe empty states for every selection-evidence gap.
 *   - Mobile (375px) and tablet (768px) viewport resilience.
 *   - Never-overstate: thin / incomplete cards never read healthy or as a pick.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import PhenoComparison from "@/pages/PhenoComparison";
import { containsHealthyStatusLanguage } from "@/lib/phenoComparisonRules";
import { containsSelectionOverclaim } from "@/lib/phenoSelectionRules";
import type {
  PhenoCandidateInput,
  PhenoComparisonInput,
} from "@/lib/phenoComparisonViewModel";
import { PHENO_COMPARISON_DEMO_INPUT } from "@/lib/phenoComparisonFixtures";

const FULL_PHENO = {
  structure: { value: 4 },
  bud_density: { value: 4 },
  resin: { value: 5 },
  aroma: { value: "gassy" },
  vigor: { value: 4 },
  finish: { value: "58 days" },
};

// FULL_PHENO without the core "finish" trait.
const PHENO_NO_FINISH = {
  structure: { value: 4 },
  bud_density: { value: 4 },
  resin: { value: 5 },
  aroma: { value: "gassy" },
  vigor: { value: 4 },
};

afterEach(() => cleanup());

function renderOne(id: string, over: Partial<PhenoCandidateInput> = {}) {
  const input: PhenoComparisonInput = {
    isDemo: true,
    candidates: [
      {
        id,
        candidateLabel: "#1",
        plantName: "Test Candidate",
        strain: "Test",
        stage: "flower",
        growName: "Grow",
        tentName: "Tent",
        dayOfFlower: 45,
        replicateCount: 3,
        phenotype: FULL_PHENO,
        postCure: { curedDays: 21 },
        photoUrl: "/placeholder.svg",
        ...over,
      },
    ],
  };
  return render(<PhenoComparison input={input} />);
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });
  window.dispatchEvent(new Event("resize"));
}

describe("PhenoComparison — empty states", () => {
  it("missing photo", () => {
    renderOne("m1", { photoUrl: null });
    expect(screen.getByTestId("pheno-photo-missing-m1").textContent).toMatch(
      /no photo attached for this candidate/i,
    );
    expect(screen.getByTestId("pheno-caveat-m1-no_photo")).toBeTruthy();
  });

  it("missing phenotype trait", () => {
    renderOne("m2", { phenotype: PHENO_NO_FINISH });
    const cell = screen.getByTestId("pheno-trait-m2-finish");
    expect(cell.getAttribute("data-recorded")).toBe("false");
    expect(cell.textContent).toMatch(/not recorded/i);
    expect(screen.getByTestId("pheno-caveat-m2-missing_phenotype").textContent).toMatch(
      /finish time/i,
    );
  });

  it("thin phenotype", () => {
    renderOne("m3", { phenotype: { structure: { value: 3 }, vigor: { value: 3 } } });
    expect(
      screen.getByTestId("pheno-selection-strength-m3").getAttribute("data-strength"),
    ).toBe("thin");
    expect(screen.getByTestId("pheno-caveat-m3-thin_phenotype").textContent).toMatch(
      /too few phenotype traits/i,
    );
  });

  it("single specimen", () => {
    renderOne("m4", { replicateCount: 1 });
    expect(
      screen.getByTestId("pheno-replication-m4").getAttribute("data-replicated"),
    ).toBe("false");
    expect(screen.getByTestId("pheno-caveat-m4-single_specimen").textContent).toMatch(
      /single specimen/i,
    );
  });

  it("not cured yet", () => {
    renderOne("m5", { postCure: null });
    expect(screen.getByTestId("pheno-postcure-m5").getAttribute("data-cured")).toBe("false");
    expect(screen.getByTestId("pheno-postcure-m5").textContent).toMatch(
      /not cured yet — selection incomplete/i,
    );
    expect(screen.getByTestId("pheno-caveat-m5-not_cured")).toBeTruthy();
  });

  it("timepoint unknown", () => {
    renderOne("m6", { dayOfFlower: null });
    expect(screen.getByTestId("pheno-timepoint-m6").getAttribute("data-known")).toBe("false");
    expect(screen.getByTestId("pheno-caveat-m6-timepoint_unknown").textContent).toMatch(
      /timepoint can't be aligned/i,
    );
  });

  it("surfaces missing environment-metric flags in the context section", () => {
    // Hydro snapshot: EC/pH relevant but absent → must not be silently dropped.
    renderOne("m7", {
      snapshot: {
        source: "manual",
        capturedAt: "2026-07-01T10:30:00.000Z",
        temp: 24,
        rh: 55,
        vpd: 1.2,
        ecPhRelevant: true,
        confidence: 0.9,
      },
    });
    expect(screen.getByTestId("pheno-envflag-m7-missing_ec")).toBeTruthy();
    expect(screen.getByTestId("pheno-envflag-m7-missing_ph")).toBeTruthy();
  });

  it("flags a snapshot that omits confidence in the context section", () => {
    renderOne("m8", {
      snapshot: {
        source: "manual",
        capturedAt: "2026-07-01T10:30:00.000Z",
        temp: 24,
        rh: 55,
        vpd: 1.2,
        // no confidence
      },
    });
    expect(screen.getByTestId("pheno-envflag-m8-missing_confidence")).toBeTruthy();
  });

  it("renders present relevant EC/pH metrics in the context section", () => {
    renderOne("m9", {
      snapshot: {
        source: "manual",
        capturedAt: "2026-07-01T10:30:00.000Z",
        temp: 24,
        rh: 55,
        vpd: 1.2,
        ec: 1.8,
        ph: 6,
        ecPhRelevant: true,
        confidence: 0.9,
      },
    });
    const metrics = screen.getByTestId("pheno-envmetrics-m9").textContent ?? "";
    expect(metrics).toMatch(/EC 1\.8/);
    expect(metrics).toMatch(/pH 6/);
  });
});

describe.each([
  ["mobile", 375],
  ["tablet", 768],
])("PhenoComparison — %s viewport (%ipx)", (_label, width) => {
  it("keeps comparability, labels, selection chip, caveats, and demo copy visible", () => {
    setViewport(width);
    render(<PhenoComparison input={PHENO_COMPARISON_DEMO_INPUT} />);
    expect(screen.getByTestId("pheno-comparability-verdict")).toBeTruthy();
    expect(screen.getByTestId("pheno-candidate-label-cand-1")).toBeTruthy();
    expect(screen.getByTestId("pheno-selection-strength-cand-1")).toBeTruthy();
    expect(screen.getByTestId("pheno-trait-cand-1-resin")).toBeTruthy();
    expect(screen.getByTestId("pheno-flag-cand-3-no_photo")).toBeTruthy();
    expect(screen.getByTestId("pheno-comparison-confidence-caveat")).toBeTruthy();
    expect(screen.getByTestId("pheno-comparison-demo-banner").textContent).toMatch(
      /not real telemetry/i,
    );
  });
});

describe("PhenoComparison — risky records never overstate", () => {
  it("thin card strength chip is danger-toned and carries no green/success", () => {
    renderOne("t1", { phenotype: { structure: { value: 3 } }, postCure: null });
    const chip = screen.getByTestId("pheno-selection-strength-t1");
    expect(chip.getAttribute("data-tone")).toBe("danger");
  });

  it("every demo risky card avoids healthy and winner/keeper language", () => {
    render(<PhenoComparison input={PHENO_COMPARISON_DEMO_INPUT} />);
    for (const id of ["cand-2", "cand-3", "cand-4"]) {
      const card = screen.getByTestId(`pheno-comparison-candidate-${id}`);
      const txt = card.textContent ?? "";
      expect(containsHealthyStatusLanguage(txt)).toBe(false);
      expect(containsSelectionOverclaim(txt)).toBe(false);
    }
  });
});
