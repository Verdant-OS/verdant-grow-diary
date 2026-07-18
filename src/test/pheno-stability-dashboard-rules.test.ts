/**
 * phenoStabilityDashboardRules — pure cross-keeper stability roll-up.
 *
 * Covers per-keeper verdict evaluation (each against its OWN baseline),
 * aggregate counts, neutral (non-ranking) ordering, hunt-name resolution +
 * fallback, null-safety, and a static-safety scan that the roll-up never
 * becomes a leaderboard or makes a premature stability claim.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildStabilityDashboard,
  STABILITY_DASHBOARD_CAVEAT,
  STABILITY_DASHBOARD_VERDICT_ORDER,
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

function keeper(
  keeperId: string,
  keeperName: string,
  huntId: string,
  stabilityRuns: StabilityRun[],
): StabilityDashboardKeeperInput {
  return { keeperId, keeperName, huntId, stabilityRuns };
}

const HUNT_NAMES = { h1: "Blue Dream F2", h2: "Gassy Hunt" };

describe("buildStabilityDashboard", () => {
  it("evaluates each keeper against its own baseline and counts the spread", () => {
    const model = buildStabilityDashboard(
      [
        keeper("k1", "Gas", "h1", runs({ nose_loudness: 8 }, { nose_loudness: 8 })), // holding
        keeper("k2", "Cake", "h2", runs({ nose_loudness: 8 }, { nose_loudness: 2 })), // drifting
        keeper("k3", "Sherb", "h1", runs({ nose_loudness: 8 })), // one run → unconfirmed
        keeper("k4", "Runtz", "h2", []), // no runs
      ],
      HUNT_NAMES,
    );
    expect(model.totalKeepers).toBe(4);
    expect(model.keepersWithRuns).toBe(3); // all but the no-runs keeper
    expect(model.counts).toEqual({ holding: 1, drifting: 1, unconfirmed: 1, no_runs: 1 });
    const k1 = model.entries.find((e) => e.keeperId === "k1")!;
    expect(k1.verdict).toBe("holding");
    expect(k1.detail).toMatch(/Held across 2 recorded grow-outs/);
    const k2 = model.entries.find((e) => e.keeperId === "k2")!;
    expect(k2.verdict).toBe("drifting");
    expect(k2.detail).toMatch(/Drifted on re-grow/);
  });

  it("resolves each keeper's hunt name and falls back when the hunt is unknown", () => {
    const model = buildStabilityDashboard(
      [keeper("k1", "Gas", "h1", []), keeper("k2", "Cake", "h-missing", [])],
      HUNT_NAMES,
    );
    expect(model.entries.find((e) => e.keeperId === "k1")!.huntName).toBe("Blue Dream F2");
    expect(model.entries.find((e) => e.keeperId === "k2")!.huntName).toBe("Untitled hunt");
  });

  it("orders entries neutrally by hunt then keeper name — never by how well they held", () => {
    // Deliberately feed a holding keeper AFTER a drifting one, in a hunt that
    // sorts later, to prove ordering is structural (hunt, name) not quality.
    const model = buildStabilityDashboard(
      [
        keeper("kZ", "Zeta", "h2", runs({ nose_loudness: 8 }, { nose_loudness: 8 })), // holding, hunt h2
        keeper("kA", "Alpha", "h1", runs({ nose_loudness: 8 }, { nose_loudness: 1 })), // drifting, hunt h1
      ],
      HUNT_NAMES,
    );
    // h1 "Blue Dream F2" < h2 "Gassy Hunt" alphabetically → drifting kA first.
    expect(model.entries.map((e) => e.keeperId)).toEqual(["kA", "kZ"]);
  });

  it("orders keepers WITHIN one hunt by name, NOT by verdict quality (anti-leaderboard)", () => {
    // The load-bearing anti-leaderboard pin: both keepers share hunt h1, and
    // alphabetical name order (Alpha, Zeta) DISAGREES with verdict quality
    // (Zeta holds, Alpha drifts). If the roll-up ever ranked by how well a
    // keeper held, holding "Zeta" would jump ahead. Name order must win.
    const model = buildStabilityDashboard(
      [
        keeper("kZeta", "Zeta", "h1", runs({ nose_loudness: 8 }, { nose_loudness: 8 })), // holding
        keeper("kAlpha", "Alpha", "h1", runs({ nose_loudness: 8 }, { nose_loudness: 1 })), // drifting
      ],
      HUNT_NAMES,
    );
    expect(model.entries.map((e) => e.keeperName)).toEqual(["Alpha", "Zeta"]);
  });

  it("breaks ties on keeperId when hunt and name match (stable, structural)", () => {
    const model = buildStabilityDashboard(
      [keeper("kB", "Same", "h1", []), keeper("kA", "Same", "h1", [])],
      HUNT_NAMES,
    );
    expect(model.entries.map((e) => e.keeperId)).toEqual(["kA", "kB"]);
  });

  it("a 2+-run keeper with no shared re-scored axis is unconfirmed, with honest detail", () => {
    const model = buildStabilityDashboard(
      [keeper("k1", "Gas", "h1", runs({ nose_loudness: 8 }, { vigor: 4 }))],
      HUNT_NAMES,
    );
    expect(model.entries[0].verdict).toBe("unconfirmed");
    expect(model.entries[0].detail).toMatch(/no shared trait was re-scored/);
    expect(model.counts.unconfirmed).toBe(1);
  });

  it("a single-run keeper's detail says it was recorded once", () => {
    const model = buildStabilityDashboard(
      [keeper("k1", "Gas", "h1", runs({ nose_loudness: 8 }))],
      HUNT_NAMES,
    );
    expect(model.entries[0].detail).toMatch(/Recorded once/);
  });

  it("falls back for a blank keeper name and a non-string huntId, and skips malformed", () => {
    const model = buildStabilityDashboard(
      [
        { keeperId: "k1", keeperName: "   ", huntId: 123 as unknown as string, stabilityRuns: [] },
        null as unknown as StabilityDashboardKeeperInput,
        { keeperId: 5 as unknown as string, keeperName: "x", huntId: "h1", stabilityRuns: [] },
      ] as StabilityDashboardKeeperInput[],
      HUNT_NAMES,
    );
    expect(model.totalKeepers).toBe(1);
    expect(model.entries[0].keeperName).toBe("Unnamed keeper");
    expect(model.entries[0].huntName).toBe("Untitled hunt");
    expect(model.entries[0].huntId).toBe("");
  });

  it("is null-safe and skips malformed keepers", () => {
    const model = buildStabilityDashboard(
      [
        keeper("k1", "Gas", "h1", []),
        { keeperId: "", keeperName: "x", huntId: "h1", stabilityRuns: [] },
      ] as StabilityDashboardKeeperInput[],
      HUNT_NAMES,
    );
    expect(model.totalKeepers).toBe(1);
    const empty = buildStabilityDashboard([], {});
    expect(empty.totalKeepers).toBe(0);
    expect(empty.counts).toEqual({ holding: 0, drifting: 0, unconfirmed: 0, no_runs: 0 });
  });

  it("names all four verdicts in the stat-chip order (a stats layout, not a rank)", () => {
    expect([...STABILITY_DASHBOARD_VERDICT_ORDER].sort()).toEqual(
      ["drifting", "holding", "no_runs", "unconfirmed"].sort(),
    );
  });
});

describe("static safety — dashboard rules source", () => {
  const rawSrc = readFileSync(
    path.resolve(__dirname, "../lib/phenoStabilityDashboardRules.ts"),
    "utf8",
  );
  const code = rawSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("is pure: no I/O, React, Supabase, AI, writes, or clock", () => {
    expect(rawSrc).not.toMatch(/from ["'][^"']*supabase/i);
    expect(rawSrc).not.toMatch(/from ["']react["']/);
    expect(rawSrc).not.toMatch(/\bfetch\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
    expect(rawSrc).not.toMatch(/\bnew Date\(|Date\.now\(|Math\.random\(/);
  });

  it("never becomes a leaderboard or makes a premature stability claim", () => {
    expect(code).not.toMatch(/\bwinner\b/i);
    expect(code).not.toMatch(/\bbest\b/i);
    expect(code).not.toMatch(/\brank(ed|ing)?\b/i);
    expect(code).not.toMatch(/\bleaderboard\b/i);
    expect(code).not.toMatch(/\bguaranteed\b/i);
    expect(code).not.toMatch(/\bproven\b/i);
    expect(code).not.toMatch(/\breproducible\b/i);
    expect(code).not.toMatch(/\bpermanently stable\b/i);
  });

  it("the caveat disclaims both ranking and any future-stability promise", () => {
    expect(STABILITY_DASHBOARD_CAVEAT).toMatch(/never orders your keepers against each other/i);
    expect(STABILITY_DASHBOARD_CAVEAT).toMatch(/never a promise/i);
  });

  it("reuses the single stability model rather than a divergent copy", () => {
    expect(rawSrc).toMatch(/from "@\/lib\/phenoStabilityRunRules"/);
    expect(rawSrc).toMatch(/evaluateStability/);
  });
});
