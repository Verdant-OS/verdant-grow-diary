/**
 * PhenoGenerationProgress — read-only cross-generation objective view.
 *
 * Verifies per-generation counts render, the earliest-vs-latest trend badges,
 * the honest single-generation and unscored states, and a static-safety scan
 * that the component stays descriptive rather than causal or ranking.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import PhenoGenerationProgress from "@/components/PhenoGenerationProgress";
import {
  buildGenerationProgress,
  type GenerationHuntInput,
} from "@/lib/phenoObjectiveGenerationRules";
import type { BreedingObjectiveTarget } from "@/lib/phenoBreedingObjectiveRules";

const NOSE: BreedingObjectiveTarget = { axisKey: "nose_loudness", comparator: "gte", threshold: 7 };

function hunt(
  huntId: string,
  parentHuntId: string | null,
  candidates: Array<Record<string, number> | null>,
  generationLabel: string | null = null,
): GenerationHuntInput {
  return {
    huntId,
    huntName: `Hunt ${huntId}`,
    generationLabel,
    parentHuntId,
    targets: [NOSE],
    candidates: candidates.map((traits) => ({ traits })),
  };
}

describe("PhenoGenerationProgress", () => {
  it("renders nothing with no generations", () => {
    const { container } = render(<PhenoGenerationProgress model={buildGenerationProgress([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says so honestly when only one generation exists", () => {
    render(
      <PhenoGenerationProgress
        model={buildGenerationProgress([hunt("f1", null, [{ nose_loudness: 8 }])])}
      />,
    );
    expect(screen.getByTestId("pheno-generation-progress-single")).toHaveTextContent(
      /Only one generation so far/i,
    );
    expect(screen.queryByTestId("pheno-generation-trends")).not.toBeInTheDocument();
  });

  it("lists each generation's scored/met counts oldest-first", () => {
    const model = buildGenerationProgress([
      hunt("f1", null, [{ nose_loudness: 8 }, { nose_loudness: 4 }], "F1"),
      hunt("f2", "f1", [{ nose_loudness: 8 }, { nose_loudness: 9 }], "F2"),
    ]);
    render(<PhenoGenerationProgress model={model} />);
    const list = screen.getByTestId("pheno-generation-list");
    const items = within(list).getAllByRole("listitem");
    // Oldest first — F1 leads.
    expect(items[0].textContent).toMatch(/F1/);
    expect(within(list).getByTestId("pheno-generation-axis-f1-nose_loudness")).toHaveTextContent(
      /1 of 2 scored met it \(50%\)/,
    );
    expect(within(list).getByTestId("pheno-generation-axis-f2-nose_loudness")).toHaveTextContent(
      /2 of 2 scored met it \(100%\)/,
    );
  });

  it("badges a larger share without claiming the line improved", () => {
    const model = buildGenerationProgress([
      hunt("f1", null, [{ nose_loudness: 8 }, { nose_loudness: 4 }]),
      hunt("f2", "f1", [{ nose_loudness: 8 }, { nose_loudness: 9 }]),
    ]);
    render(<PhenoGenerationProgress model={model} />);
    expect(screen.getByTestId("pheno-generation-trend-badge-nose_loudness")).toHaveTextContent(
      /Larger share met/i,
    );
    expect(screen.getByTestId("pheno-generation-trend-nose_loudness")).toHaveTextContent(
      /not proof the line improved/i,
    );
  });

  it("shows 'not yet scored' rather than 0% when nothing was scored", () => {
    const model = buildGenerationProgress([
      hunt("f1", null, [null, null]),
      hunt("f2", "f1", [{ nose_loudness: 9 }]),
    ]);
    render(<PhenoGenerationProgress model={model} />);
    expect(screen.getByTestId("pheno-generation-axis-f1-nose_loudness")).toHaveTextContent(
      /not yet scored/i,
    );
    expect(screen.getByTestId("pheno-generation-trend-badge-nose_loudness")).toHaveTextContent(
      /Not comparable/i,
    );
  });

  it("carries the honesty caveat", () => {
    const model = buildGenerationProgress([
      hunt("f1", null, [{ nose_loudness: 8 }]),
      hunt("f2", "f1", [{ nose_loudness: 9 }]),
    ]);
    render(<PhenoGenerationProgress model={model} />);
    expect(screen.getByTestId("pheno-generation-progress")).toHaveTextContent(
      /never proof the line improved, and never a forecast/i,
    );
  });

  describe("static safety", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/PhenoGenerationProgress.tsx"),
      "utf8",
    );
    it("never persists, ranks, or makes a causal claim", () => {
      expect(src).not.toMatch(/from ["'][^"']*supabase/i);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(code).not.toMatch(/\bwinner\b/i);
      expect(code).not.toMatch(/\brank(ed|ing)?\b/i);
      expect(code).not.toMatch(/\bbest\b/i);
      expect(code).not.toMatch(/\bimproved\b/i);
    });
  });
});
