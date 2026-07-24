/**
 * PhenoStabilityDashboard — read-only cross-keeper stability roll-up presenter.
 *
 * Verifies the counts/entries/badges render, the grower-chosen verdict filter,
 * the self-hiding empty state, and a static-safety scan that the component
 * never persists and never turns the roll-up into a ranking.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PhenoStabilityDashboard from "@/components/PhenoStabilityDashboard";
import {
  buildStabilityDashboard,
  type StabilityDashboardKeeperInput,
} from "@/lib/phenoStabilityDashboardRules";
import type { StabilityRun } from "@/lib/phenoStabilityRunRules";

function runs(...pairs: Array<Record<string, number>>): StabilityRun[] {
  return pairs.map((traits, i) => ({
    runLabel: `R${i + 1}`,
    observedAt: null,
    traits,
    note: null,
  }));
}

function model(keepers: StabilityDashboardKeeperInput[]) {
  return buildStabilityDashboard(keepers, { h1: "Blue Dream F2", h2: "Gassy Hunt" });
}

const KEEPERS: StabilityDashboardKeeperInput[] = [
  {
    keeperId: "k1",
    keeperName: "Gas #4",
    huntId: "h1",
    stabilityRuns: runs({ nose_loudness: 8 }, { nose_loudness: 8 }),
  },
  {
    keeperId: "k2",
    keeperName: "Cake #1",
    huntId: "h2",
    stabilityRuns: runs({ nose_loudness: 8 }, { nose_loudness: 2 }),
  },
  { keeperId: "k3", keeperName: "Sherb #2", huntId: "h1", stabilityRuns: [] },
];

describe("PhenoStabilityDashboard", () => {
  it("renders nothing when there are no keepers (self-hiding empty state)", () => {
    const { container } = render(<PhenoStabilityDashboard model={model([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each keeper's own verdict badge, detail, and hunt label", () => {
    render(<PhenoStabilityDashboard model={model(KEEPERS)} />);
    expect(screen.getByTestId("pheno-stability-dashboard")).toBeInTheDocument();
    const k1 = screen.getByTestId("pheno-stability-dashboard-entry-k1");
    expect(k1.textContent).toContain("Gas #4");
    expect(k1.textContent).toContain("Blue Dream F2");
    expect(k1.textContent).toMatch(
      /baseline trait held within tolerance across 2 evidence-bearing grow-outs/,
    );
    expect(screen.getByTestId("pheno-stability-dashboard-badge-k2")).toHaveTextContent(
      /Drifted on re-grow/i,
    );
    expect(screen.getByTestId("pheno-stability-dashboard-badge-k3")).toHaveTextContent(
      /No grow-outs recorded/i,
    );
  });

  it("shows aggregate counts and disables empty verdict filters", () => {
    render(<PhenoStabilityDashboard model={model(KEEPERS)} />);
    const counts = screen.getByTestId("pheno-stability-dashboard-counts");
    expect(
      within(counts).getByTestId("pheno-stability-dashboard-filter-holding"),
    ).toHaveTextContent("1");
    // No keeper is "unconfirmed" here → that filter is disabled.
    expect(
      (
        within(counts).getByTestId(
          "pheno-stability-dashboard-filter-unconfirmed",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("filters to a single verdict and toggles back off", () => {
    render(<PhenoStabilityDashboard model={model(KEEPERS)} />);
    const holdingFilter = screen.getByTestId("pheno-stability-dashboard-filter-holding");
    fireEvent.click(holdingFilter);
    expect(screen.getByTestId("pheno-stability-dashboard-entry-k1")).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-stability-dashboard-entry-k2")).not.toBeInTheDocument();
    // Clicking again clears the filter (back to all).
    fireEvent.click(holdingFilter);
    expect(screen.getByTestId("pheno-stability-dashboard-entry-k2")).toBeInTheDocument();
  });

  it("carries the honesty caveat", () => {
    render(<PhenoStabilityDashboard model={model(KEEPERS)} />);
    expect(screen.getByTestId("pheno-stability-dashboard")).toHaveTextContent(
      /never orders your keepers against each other/i,
    );
  });

  it("renders an incomplete-evidence verdict for a multi-run keeper with no shared axis", () => {
    render(
      <PhenoStabilityDashboard
        model={model([
          {
            keeperId: "ku",
            keeperName: "Mystery",
            huntId: "h1",
            stabilityRuns: runs({ nose_loudness: 8 }, { vigor: 4 }),
          },
        ])}
      />,
    );
    expect(screen.getByTestId("pheno-stability-dashboard-badge-ku")).toHaveTextContent(
      /Re-grow evidence incomplete/i,
    );
    expect(screen.getByTestId("pheno-stability-dashboard-entry-ku").textContent).toMatch(
      /Only 1 of 2 recorded grow-outs/i,
    );
    expect(screen.getByTestId("pheno-stability-dashboard-entry-ku")).toHaveTextContent(
      /only those evidence-bearing grow-outs count/i,
    );
  });

  describe("static safety", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/PhenoStabilityDashboard.tsx"),
      "utf8",
    );
    it("never persists, and its executable copy never ranks or over-claims", () => {
      expect(src).not.toMatch(/from ["'][^"']*supabase/i);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
      // Same honesty-banned set as the rules scan (comments stripped first).
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      for (const banned of [
        /\bwinner\b/i,
        /\bbest\b/i,
        /\brank(ed|ing)?\b/i,
        /\bleaderboard\b/i,
        /\bguaranteed\b/i,
        /\bproven\b/i,
        /\breproducible\b/i,
        /\bpermanently stable\b/i,
      ]) {
        expect(code).not.toMatch(banned);
      }
    });
  });
});
