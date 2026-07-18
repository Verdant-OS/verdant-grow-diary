/**
 * PhenoStabilityLedger — presenter for a keeper's stability-run ledger.
 *
 * Verifies the honest verdict/copy render, the add/remove whole-set save
 * contract (the component never mutates persistence itself), trait validation,
 * the cap, and a static-safety scan that the component makes no premature
 * stability claim and never routes a write directly.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PhenoStabilityLedger from "@/components/PhenoStabilityLedger";
import { MAX_STABILITY_RUNS, type StabilityRun } from "@/lib/phenoStabilityRunRules";

function run(
  label: string,
  traits: Record<string, number> = {},
  overrides: Partial<StabilityRun> = {},
): StabilityRun {
  return { runLabel: label, observedAt: null, traits, note: null, ...overrides };
}

function setup(runs: readonly StabilityRun[], saving = false) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<PhenoStabilityLedger keeperId="k1" runs={runs} onSave={onSave} saving={saving} />);
  return { onSave };
}

describe("PhenoStabilityLedger — verdict & empty state", () => {
  it("shows the empty ledger copy and 'no grow-outs' verdict with no runs", () => {
    setup([]);
    expect(screen.getByTestId("pheno-stability-empty-k1")).toBeInTheDocument();
    expect(screen.getByTestId("pheno-stability-verdict-badge-k1")).toHaveTextContent(
      /No grow-outs recorded/i,
    );
    expect(screen.getByTestId("pheno-stability-verdict-k1")).toHaveTextContent(
      /Record a run to start tracking/i,
    );
  });

  it("a single run reads as unconfirmed — never a confirmation", () => {
    setup([run("Baseline", { nose_loudness: 8 })]);
    expect(screen.getByTestId("pheno-stability-verdict-badge-k1")).toHaveTextContent(
      /Re-grow evidence incomplete/i,
    );
    expect(screen.getByTestId("pheno-stability-verdict-k1")).toHaveTextContent(
      /a single run can't tell you/i,
    );
    // The first run is labelled the baseline.
    expect(screen.getByTestId("pheno-stability-run-k1-0")).toHaveTextContent(/Baseline/);
  });

  it("two holding runs read as held, with a per-axis held read-out", () => {
    setup([run("R1", { nose_loudness: 8 }), run("R2", { nose_loudness: 9 })]);
    expect(screen.getByTestId("pheno-stability-verdict-badge-k1")).toHaveTextContent(
      /Held on re-grow/i,
    );
    const axis = screen.getByTestId("pheno-stability-axis-k1-nose_loudness");
    expect(axis).toHaveTextContent(/8 → 9/);
    expect(axis).toHaveTextContent(/held/);
  });

  it("a drift beyond tolerance reads as drifted and names the axis move", () => {
    setup([run("R1", { nose_loudness: 8 }), run("R2", { nose_loudness: 2 })]);
    expect(screen.getByTestId("pheno-stability-verdict-badge-k1")).toHaveTextContent(
      /Drifted on re-grow/i,
    );
    expect(screen.getByTestId("pheno-stability-axis-k1-nose_loudness")).toHaveTextContent(
      /drifted ±6/,
    );
  });
});

describe("PhenoStabilityLedger — whole-set save contract", () => {
  it("adding a run calls onSave with the appended set and clears the form", async () => {
    const { onSave } = setup([run("R1", { vigor: 4 })]);
    fireEvent.change(screen.getByTestId("pheno-stability-label-k1"), { target: { value: "R2" } });
    fireEvent.change(screen.getByTestId("pheno-stability-trait-k1-vigor"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByTestId("pheno-stability-date-k1"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.click(screen.getByTestId("pheno-stability-add-k1"));
    expect(onSave).toHaveBeenCalledWith([
      run("R1", { vigor: 4 }),
      { runLabel: "R2", observedAt: "2026-03-01", traits: { vigor: 4 }, note: null },
    ]);
    // Form clears after a successful save.
    await screen.findByTestId("pheno-stability-add-k1");
    expect((screen.getByTestId("pheno-stability-label-k1") as HTMLInputElement).value).toBe("");
  });

  it("removing a run calls onSave with that run filtered out", () => {
    const { onSave } = setup([run("R1", { vigor: 4 }), run("R2", { vigor: 3 })]);
    fireEvent.click(screen.getByTestId("pheno-stability-run-remove-k1-1"));
    expect(onSave).toHaveBeenCalledWith([run("R1", { vigor: 4 })]);
  });

  it("blocks a run with no label and does not save", () => {
    const { onSave } = setup([]);
    // Add is disabled with an empty label; force a click by typing whitespace.
    fireEvent.change(screen.getByTestId("pheno-stability-label-k1"), { target: { value: "  " } });
    expect((screen.getByTestId("pheno-stability-add-k1") as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range trait with an inline error and no save", () => {
    const { onSave } = setup([]);
    fireEvent.change(screen.getByTestId("pheno-stability-label-k1"), { target: { value: "R1" } });
    fireEvent.change(screen.getByTestId("pheno-stability-trait-k1-vigor"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByTestId("pheno-stability-add-k1"));
    expect(screen.getByTestId("pheno-stability-error-k1")).toHaveTextContent(/between 1 and 5/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("hides the add form and shows a cap note at the maximum run count", () => {
    const many = Array.from({ length: MAX_STABILITY_RUNS }, (_, i) => run(`R${i}`, { vigor: 4 }));
    setup(many);
    expect(screen.getByTestId("pheno-stability-cap-k1")).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-stability-add-k1")).toBeNull();
  });
});

describe("PhenoStabilityLedger — static safety", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/PhenoStabilityLedger.tsx"),
    "utf8",
  );

  it("never writes to Supabase directly — persistence is the injected onSave", () => {
    expect(src).not.toMatch(/from ["'][^"']*supabase/i);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
    expect(src).not.toMatch(/pheno_keepers/);
  });

  it("makes no premature stability / ranking claim in the component copy", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(code).not.toMatch(/\bguaranteed\b/i);
    expect(code).not.toMatch(/\bproven\b/i);
    expect(code).not.toMatch(/\bwinner\b/i);
    expect(code).not.toMatch(/\brank(ed|ing)?\b/i);
  });
});
