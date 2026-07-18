/**
 * phenoStabilityRunRules — pure stability-ledger model.
 *
 * Covers sanitization, baseline-vs-later hold/drift evaluation, verdicts,
 * copy, and a static-safety scan stricter than the standard pheno fence:
 * this module must never make a premature stability/keeper claim.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import {
  evaluateStability,
  isValidIsoCalendarDate,
  MAX_STABILITY_RUNS,
  sanitizeStabilityRuns,
  stabilityVerdictCopy,
  STABILITY_LEDGER_CAVEAT,
  type StabilityRun,
} from "@/lib/phenoStabilityRunRules";

const NOSE = LOUD_TRAIT_AXES.find((a) => a.key === "nose_loudness")!; // 0..10
const VIGOR = LOUD_TRAIT_AXES.find((a) => a.key === "vigor")!; // 1..5

function run(
  label: string,
  traits: Record<string, number>,
  overrides: Partial<StabilityRun> = {},
): StabilityRun {
  return { runLabel: label, observedAt: null, traits, note: null, ...overrides };
}

describe("sanitizeStabilityRuns", () => {
  it("keeps valid runs and drops unknown axes / out-of-range values", () => {
    const out = sanitizeStabilityRuns([
      {
        runLabel: "Run 1",
        observedAt: "2026-02-01",
        traits: { nose_loudness: 8, made_up: 3, vigor: 99 },
        note: "gassy",
      },
    ]);
    expect(out).toEqual([
      { runLabel: "Run 1", observedAt: "2026-02-01", traits: { nose_loudness: 8 }, note: "gassy" },
    ]);
  });

  it("drops runs with no label (the grower must tell runs apart)", () => {
    expect(sanitizeStabilityRuns([{ runLabel: "   ", traits: { vigor: 4 } }])).toEqual([]);
  });

  it("normalizes a malformed observedAt to null and trims/bounds label + note", () => {
    const out = sanitizeStabilityRuns([
      { runLabel: "  Winter  ", observedAt: "not-a-date", traits: {}, note: "  ok  " },
    ]);
    expect(out[0].observedAt).toBeNull();
    expect(out[0].runLabel).toBe("Winter");
    expect(out[0].note).toBe("ok");
  });

  it("calendar-validates dates, including Gregorian leap-year boundaries", () => {
    expect(isValidIsoCalendarDate("2024-02-29")).toBe(true);
    expect(isValidIsoCalendarDate("2000-02-29")).toBe(true);
    expect(isValidIsoCalendarDate("2025-02-29")).toBe(false);
    expect(isValidIsoCalendarDate("1900-02-29")).toBe(false);
    expect(isValidIsoCalendarDate("2026-04-31")).toBe(false);
    expect(isValidIsoCalendarDate("2026-13-01")).toBe(false);
    expect(isValidIsoCalendarDate("0000-01-01")).toBe(false);

    const out = sanitizeStabilityRuns([
      { runLabel: "Leap", observedAt: " 2024-02-29 ", traits: {} },
      { runLabel: "Impossible", observedAt: "2025-02-29", traits: {} },
    ]);
    expect(out.map((r) => r.observedAt)).toEqual(["2024-02-29", null]);
  });

  it("caps the number of runs and is null-safe", () => {
    const many = Array.from({ length: MAX_STABILITY_RUNS + 5 }, (_, i) => ({
      runLabel: `Run ${i}`,
      traits: { vigor: 4 },
    }));
    expect(sanitizeStabilityRuns(many).length).toBe(MAX_STABILITY_RUNS);
    expect(sanitizeStabilityRuns(null)).toEqual([]);
    expect(sanitizeStabilityRuns([null, 5, "x"] as unknown[])).toEqual([]);
  });
});

describe("evaluateStability", () => {
  it("no runs → no_runs", () => {
    expect(evaluateStability([]).verdict).toBe("no_runs");
  });

  it("one run → unconfirmed (a single run can never confirm)", () => {
    expect(evaluateStability([run("Run 1", { nose_loudness: 8 })]).verdict).toBe("unconfirmed");
  });

  it("two runs within tolerance → holding", () => {
    const e = evaluateStability([
      run("Run 1", { nose_loudness: 8, vigor: 4 }),
      run("Run 2", { nose_loudness: 9, vigor: 4 }), // nose +1 (tol 2), vigor +0 (tol 1)
    ]);
    expect(e.verdict).toBe("holding");
    expect(e.runCount).toBe(2);
    expect(e.evidenceRunCount).toBe(2);
    expect(e.driftedAxes).toEqual([]);
    const noseTrend = e.axisTrends.find((t) => t.axisKey === "nose_loudness")!;
    expect(noseTrend.baseline).toBe(8);
    expect(noseTrend.laterValues).toEqual([9]);
    expect(noseTrend.held).toBe(true);
    expect(noseTrend.tolerance).toBe(2);
  });

  it("a trait moving beyond tolerance → drifting, naming the axis", () => {
    const e = evaluateStability([
      run("Run 1", { nose_loudness: 8 }),
      run("Run 2", { nose_loudness: 4 }), // -4, tol 2 → drift
    ]);
    expect(e.verdict).toBe("drifting");
    expect(e.driftedAxes).toEqual([NOSE.label]);
    expect(e.axisTrends[0].held).toBe(false);
    expect(e.axisTrends[0].maxDrift).toBe(4);
  });

  it("only judges axes with a baseline AND a later re-score", () => {
    const e = evaluateStability([
      run("Run 1", { nose_loudness: 8, vigor: 4 }),
      run("Run 2", { nose_loudness: 8 }), // vigor not re-scored → excluded
    ]);
    expect(e.axisTrends.map((t) => t.axisKey)).toEqual(["nose_loudness"]);
  });

  it("two runs but no shared re-scored axis → unconfirmed, not a false hold", () => {
    const e = evaluateStability([run("Run 1", { nose_loudness: 8 }), run("Run 2", { vigor: 4 })]);
    expect(e.verdict).toBe("unconfirmed");
    expect(e.evidenceRunCount).toBe(1);
    expect(e.axisTrends).toEqual([]);
  });

  it("fails closed when a later run has no baseline-comparable evidence", () => {
    const e = evaluateStability([
      run("Run 1", { nose_loudness: 8 }),
      run("Run 2", { nose_loudness: 9 }),
      run("Run 3", { vigor: 4 }),
    ]);
    expect(e.runCount).toBe(3);
    expect(e.evidenceRunCount).toBe(2);
    expect(e.verdict).toBe("unconfirmed");
    expect(stabilityVerdictCopy(e)).toMatch(/Only 2 of 3 recorded grow-outs/);
    expect(stabilityVerdictCopy(e)).not.toMatch(/held across 3/i);
  });

  it("fails closed when different later runs score disjoint baseline traits", () => {
    const e = evaluateStability([
      run("Run 1", { nose_loudness: 8, vigor: 4 }),
      run("Run 2", { nose_loudness: 9 }),
      run("Run 3", { vigor: 4 }),
    ]);
    expect(e.runCount).toBe(3);
    expect(e.evidenceRunCount).toBe(3);
    expect(e.verdict).toBe("unconfirmed");
    expect(stabilityVerdictCopy(e)).toMatch(
      /no single baseline trait was re-scored across every run/i,
    );
    expect(stabilityVerdictCopy(e)).not.toMatch(/held across 3/i);
  });

  it("still reports observed drift when another later run is incomplete", () => {
    const e = evaluateStability([
      run("Run 1", { nose_loudness: 8 }),
      run("Run 2", { nose_loudness: 2 }),
      run("Run 3", {}),
    ]);
    expect(e.evidenceRunCount).toBe(2);
    expect(e.verdict).toBe("drifting");
  });

  it("is null-safe against malformed run elements (never throws)", () => {
    // Type-contract-violating input a hand-built / unsanitized caller might pass:
    // null run elements or a null traits map. Must degrade, never throw.
    expect(() => evaluateStability([null, null] as unknown as StabilityRun[])).not.toThrow();
    expect(
      evaluateStability([
        { runLabel: "R1", observedAt: null, traits: null, note: null },
        { runLabel: "R2", observedAt: null, traits: { nose_loudness: 8 }, note: null },
      ] as unknown as StabilityRun[]).verdict,
    ).toBe("unconfirmed"); // null baseline traits → no axis to hold to
    const e = evaluateStability([
      { runLabel: "R1", observedAt: null, traits: { nose_loudness: 8 }, note: null },
      null,
    ] as unknown as StabilityRun[]);
    expect(e.verdict).toBe("unconfirmed"); // later run malformed → nothing re-scored
  });

  it("uses the widest later drift, not the last run's value", () => {
    const e = evaluateStability([
      run("Run 1", { [VIGOR.key]: 4 }),
      run("Run 2", { [VIGOR.key]: 1 }), // -3, tol 1 → drift
      run("Run 3", { [VIGOR.key]: 4 }), // back to baseline
    ]);
    expect(e.verdict).toBe("drifting");
    expect(e.axisTrends[0].maxDrift).toBe(3);
  });
});

describe("stabilityVerdictCopy", () => {
  it("phrases each verdict honestly, never promising future stability", () => {
    expect(stabilityVerdictCopy(evaluateStability([]))).toMatch(/No grow-outs recorded yet/);
    expect(stabilityVerdictCopy(evaluateStability([run("R1", { vigor: 4 })]))).toMatch(
      /a single run can't tell you/,
    );
    const holding = stabilityVerdictCopy(
      evaluateStability([run("R1", { vigor: 4 }), run("R2", { vigor: 4 })]),
    );
    expect(holding).toMatch(/baseline trait held within tolerance across 2 recorded grow-outs/);
    expect(holding).toMatch(/not a promise about future runs/);
    const drift = stabilityVerdictCopy(
      evaluateStability([run("R1", { nose_loudness: 8 }), run("R2", { nose_loudness: 2 })]),
    );
    expect(drift).toMatch(/shifted on re-grow/);
  });
});

describe("static safety — module source (premature-stability fence)", () => {
  const rawSrc = readFileSync(path.resolve(__dirname, "../lib/phenoStabilityRunRules.ts"), "utf8");
  // Strip comments before banned-word scans (repo convention): the doc
  // comment legitimately names what NOT to do; only executable code counts.
  const code = rawSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("is pure: no I/O, React, Supabase, AI, writes, or clock", () => {
    expect(rawSrc).not.toMatch(/from ["'][^"']*supabase/i);
    expect(rawSrc).not.toMatch(/from ["']react["']/);
    expect(rawSrc).not.toMatch(
      /\bfetch\(|\.rpc\(|functions\.invoke|\.insert\(|\.update\(|\.delete\(/,
    );
    expect(rawSrc).not.toMatch(/\bnew Date\(|Date\.now\(|Math\.random\(/);
    expect(rawSrc).not.toMatch(/openai|anthropic|claude|gemini/i);
  });

  it("never makes a premature stability / keeper / ranking claim in executable copy", () => {
    // The strongest claim allowed is "held across N grow-outs". These must
    // not appear in executable strings or identifiers (doc comments exempt).
    expect(code).not.toMatch(/\bguaranteed\b/i);
    expect(code).not.toMatch(/\bproven\b/i);
    expect(code).not.toMatch(/\breproducible\b/i);
    expect(code).not.toMatch(/\bpermanently stable\b/i);
    expect(code).not.toMatch(/\bwinner\b/i);
    expect(code).not.toMatch(/\brank(ed|ing)?\b/i);
    expect(code).not.toMatch(/auto[-_ ]?(select|rank)/i);
  });

  it("the caveat explicitly disclaims any future-stability promise", () => {
    expect(STABILITY_LEDGER_CAVEAT).toMatch(/record of what you saw/);
    expect(STABILITY_LEDGER_CAVEAT).toMatch(/never a promise/);
  });

  it("does not reuse the taken replication vocabulary / ids in executable code", () => {
    expect(code).not.toMatch(/replication_readiness|clone_readiness/);
    // Must not import or route through the comparability grader (which
    // treats a second grow as a confound — backwards for a re-run).
    expect(code).not.toMatch(/gradeComparability|assessReplication/);
    expect(rawSrc).toMatch(/from "@\/lib\/phenoExpressionRules"/);
  });
});
