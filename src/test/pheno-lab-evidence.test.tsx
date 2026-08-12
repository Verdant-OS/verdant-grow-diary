/**
 * Pheno Comparison lab evidence — rules, view-model flow, presenter render,
 * and loader degrade pins.
 *
 * Honesty contract under test:
 *   - a candidate without a computable measurement contributes nothing;
 *   - the section appears ONLY when some candidate has real lab data, and
 *     then every other candidate shows the honest missing copy;
 *   - the sample/demo comparison (no lab data anywhere) stays untouched;
 *   - a failed lab_tests read can never break the comparison loader.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import {
  buildPhenoLabEvidenceView,
  latestLabEvidenceByPlant,
  PHENO_LAB_EVIDENCE_HEADING,
  PHENO_LAB_EVIDENCE_MISSING_COPY,
  type PhenoLabEvidenceInput,
} from "@/lib/phenoLabEvidenceRules";
import { buildPhenoComparisonViewModel } from "@/lib/phenoComparisonViewModel";
import { buildRealPhenoComparisonInput } from "@/lib/phenoComparisonRealInput";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";
import PhenoComparison from "@/pages/PhenoComparison";

const evidence = (over: Partial<PhenoLabEvidenceInput>): PhenoLabEvidenceInput => ({
  testedAt: "2026-08-01T00:00:00.000Z",
  thcaPercent: null,
  thcPercent: null,
  cbdaPercent: null,
  cbdPercent: null,
  terpenes: {},
  labName: null,
  ...over,
});

describe("buildPhenoLabEvidenceView", () => {
  it("is null for absent input or no computable measurement", () => {
    expect(buildPhenoLabEvidenceView(null)).toBeNull();
    expect(buildPhenoLabEvidenceView(undefined)).toBeNull();
    expect(buildPhenoLabEvidenceView(evidence({}))).toBeNull();
    expect(buildPhenoLabEvidenceView(evidence({ terpenes: "junk" }))).toBeNull();
  });

  it("builds labeled totals and caps terpenes at the top three", () => {
    const view = buildPhenoLabEvidenceView(
      evidence({
        thcaPercent: 24,
        thcPercent: 0.5,
        terpenes: { a: 0.1, b: 0.4, c: 0.3, d: 0.2 },
        labName: "  Green Labs ",
      }),
    );
    expect(view).not.toBeNull();
    expect(view!.totalThcLabel).toBe("21.55%");
    expect(view!.totalCbdLabel).toBeNull();
    expect(view!.labName).toBe("Green Labs");
    expect(view!.topTerpenes.map((t) => t.name)).toEqual(["b", "c", "d"]);
  });
});

describe("latestLabEvidenceByPlant", () => {
  it("keeps only the first (newest) row per plant and skips null plant ids", () => {
    const byPlant = latestLabEvidenceByPlant([
      {
        plant_id: "p1",
        tested_at: "2026-08-01",
        thca_percent: 20,
        thc_percent: null,
        cbda_percent: null,
        cbd_percent: null,
        terpenes: {},
        lab_name: "Newest",
      },
      {
        plant_id: null,
        tested_at: "2026-08-01",
        thca_percent: 1,
        thc_percent: null,
        cbda_percent: null,
        cbd_percent: null,
        terpenes: {},
        lab_name: null,
      },
      {
        plant_id: "p1",
        tested_at: "2026-06-01",
        thca_percent: 10,
        thc_percent: null,
        cbda_percent: null,
        cbd_percent: null,
        terpenes: {},
        lab_name: "Older",
      },
      {
        plant_id: "p2",
        tested_at: "2026-07-01",
        thca_percent: 15,
        thc_percent: null,
        cbda_percent: null,
        cbd_percent: null,
        terpenes: {},
        lab_name: null,
      },
    ]);
    expect(Object.keys(byPlant).sort()).toEqual(["p1", "p2"]);
    expect(byPlant.p1.labName).toBe("Newest");
    expect(byPlant.p1.thcaPercent).toBe(20);
  });
});

describe("view-model flow", () => {
  const twoCandidates = (withLab: boolean) => ({
    huntName: "Hunt A",
    isDemo: false,
    candidates: [
      {
        id: "c1",
        candidateLabel: "#1",
        labEvidence: withLab ? evidence({ thcaPercent: 24 }) : null,
      },
      { id: "c2", candidateLabel: "#2" },
    ],
  });

  it("carries lab evidence into the candidate view and sets hasAnyLabEvidence", () => {
    const vm = buildPhenoComparisonViewModel(twoCandidates(true));
    expect(vm.hasAnyLabEvidence).toBe(true);
    // THCa without THC is a partial total — shown as a lower bound.
    expect(vm.candidates[0].labEvidence?.totalThcLabel).toBe("≥ 21.05%");
    expect(vm.candidates[1].labEvidence).toBeNull();
  });

  it("stays false when no candidate has lab data (incl. the demo sample)", () => {
    expect(buildPhenoComparisonViewModel(twoCandidates(false)).hasAnyLabEvidence).toBe(false);
  });

  it("real-input builder maps labEvidenceByPlant onto candidates", () => {
    const input = buildRealPhenoComparisonInput({
      huntName: "Hunt A",
      growName: "Grow",
      tentNameById: {},
      candidates: [
        {
          id: "p1",
          candidate_label: "#1",
          name: "A",
          strain: null,
          stage: null,
          grow_id: "g",
          tent_id: null,
        },
        {
          id: "p2",
          candidate_label: "#2",
          name: "B",
          strain: null,
          stage: null,
          grow_id: "g",
          tent_id: null,
        },
      ],
      activityByPlant: { p1: [], p2: [] },
      labEvidenceByPlant: { p1: evidence({ thcaPercent: 20 }) },
    });
    expect(input.candidates[0].labEvidence).not.toBeNull();
    expect(input.candidates[1].labEvidence).toBeNull();
  });
});

describe("presenter render", () => {
  it("shows measured values plus the honest gap for unmeasured candidates", () => {
    cleanup();
    render(
      <PhenoComparison
        input={{
          huntName: "Hunt A",
          isDemo: false,
          candidates: [
            {
              id: "c1",
              candidateLabel: "#1",
              labEvidence: evidence({
                thcaPercent: 24,
                thcPercent: 0.5,
                terpenes: { myrcene: 0.8 },
                labName: "Green Labs",
              }),
            },
            { id: "c2", candidateLabel: "#2" },
          ],
        }}
      />,
    );
    const lab = screen.getByTestId("pheno-lab-evidence-c1");
    expect(lab.textContent).toContain("Total THC (calculated) 21.55%");
    expect(lab.textContent).toContain("myrcene 0.8%");
    expect(lab.textContent).toContain("Green Labs");
    expect(screen.getByTestId("pheno-lab-evidence-missing-c2").textContent).toBe(
      PHENO_LAB_EVIDENCE_MISSING_COPY,
    );
  });

  it("renders no lab section at all when nothing is measured (demo default)", () => {
    cleanup();
    render(<PhenoComparison />);
    expect(screen.queryByText(PHENO_LAB_EVIDENCE_HEADING)).toBeNull();
    expect(screen.queryByText(PHENO_LAB_EVIDENCE_MISSING_COPY)).toBeNull();
  });
});

describe("loader degrade + copy pins", () => {
  const ROOT = resolve(__dirname, "../..");

  it("comparison loader treats lab rows as best-effort enrichment", () => {
    const src = readFileSync(resolve(ROOT, "src/hooks/useGrowPhenoComparison.ts"), "utf8");
    // A failed lab query degrades to [] instead of throwing…
    expect(src).toMatch(/const labRows = labRes\.error\s*\?\s*\[\]/);
    // …and the query never selects *.
    expect(src).toMatch(/plant_id,tested_at,thca_percent/);
    expect(src).not.toMatch(/from\("lab_tests"[^)]*\)\s*\.select\(\s*["'`]\*/);
    // "Latest per plant" must be deterministic for same-day tests.
    expect(src).toMatch(/order\("tested_at"[\s\S]*?order\("created_at"[\s\S]*?order\("id"/);
  });

  it("copy stays calm", () => {
    for (const copy of [PHENO_LAB_EVIDENCE_HEADING, PHENO_LAB_EVIDENCE_MISSING_COPY]) {
      expect(paywallCtaHasBannedWords(copy), copy).toBe(false);
    }
  });
});
