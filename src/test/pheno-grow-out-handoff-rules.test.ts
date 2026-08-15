/**
 * phenoGrowOutHandoffRules — pure keeper → next-grow handoff model.
 *
 * Covers which clones yield a proposal, pre-fill from the grower's OWN
 * recorded traits, the de-duplication that stops one grow-out counting twice,
 * honest handling of a linked plant with no traits, neutral ordering, and a
 * static-safety scan that the module proposes but never writes or ranks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildGrowOutSuggestions,
  GROW_OUT_HANDOFF_CAVEAT,
  type GrowOutCloneInput,
  type GrowOutPlantInput,
} from "@/lib/phenoGrowOutHandoffRules";
import type { StabilityRun } from "@/lib/phenoStabilityRunRules";

function clone(
  cloneId: string,
  cloneLabel: string,
  clonePlantId: string | null,
): GrowOutCloneInput {
  return { cloneId, cloneLabel, clonePlantId };
}

function plant(
  plantId: string,
  plantName: string | null,
  growName: string | null,
  traits: Record<string, number> | null,
): GrowOutPlantInput {
  return { plantId, plantName, growName, traits };
}

const PLANTS: Record<string, GrowOutPlantInput> = {
  p1: plant("p1", "Gas cut #2", "Winter Run", { nose_loudness: 8, vigor: 4 }),
  p2: plant("p2", "Cake cut #1", null, null),
};

describe("buildGrowOutSuggestions", () => {
  it("proposes a run pre-filled from the traits recorded on the linked plant", () => {
    const out = buildGrowOutSuggestions({
      clones: [clone("c1", "cut #2", "p1")],
      plantsById: PLANTS,
      existingRuns: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].hasRecordedTraits).toBe(true);
    expect(out[0].proposedRun.traits).toEqual({ nose_loudness: 8, vigor: 4 });
    expect(out[0].proposedRun.sourcePlantId).toBe("p1");
    // Label is built from what the grower already named, never invented.
    expect(out[0].proposedRun.runLabel).toBe("Gas cut #2 · Winter Run");
    expect(out[0].detail).toMatch(/Pre-filled from the 2 trait scores/);
  });

  it("skips clones never linked to a plant (nothing to hand off)", () => {
    const out = buildGrowOutSuggestions({
      clones: [clone("c1", "cut #1", null), clone("c2", "cut #2", "   ")],
      plantsById: PLANTS,
      existingRuns: [],
    });
    expect(out).toEqual([]);
  });

  it("never proposes a plant already carried into the ledger (no double-count)", () => {
    const existing: StabilityRun[] = [
      {
        runLabel: "Winter",
        observedAt: null,
        traits: { nose_loudness: 8 },
        note: null,
        sourcePlantId: "p1",
      },
    ];
    const out = buildGrowOutSuggestions({
      clones: [clone("c1", "cut #2", "p1")],
      plantsById: PLANTS,
      existingRuns: existing,
    });
    expect(out).toEqual([]);
  });

  it("still proposes when the ledger holds only hand-typed runs (no provenance)", () => {
    // A hand-typed run carries no sourcePlantId, so it must not accidentally
    // suppress every suggestion.
    const existing: StabilityRun[] = [
      { runLabel: "Typed by hand", observedAt: null, traits: { vigor: 4 }, note: null },
    ];
    const out = buildGrowOutSuggestions({
      clones: [clone("c1", "cut #2", "p1")],
      plantsById: PLANTS,
      existingRuns: existing,
    });
    expect(out).toHaveLength(1);
  });

  it("proposes a linked plant with NO recorded traits, but says so honestly", () => {
    const out = buildGrowOutSuggestions({
      clones: [clone("c2", "cut #1", "p2")],
      plantsById: PLANTS,
      existingRuns: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0].hasRecordedTraits).toBe(false);
    expect(out[0].proposedRun.traits).toEqual({});
    expect(out[0].detail).toMatch(/no recorded trait scores yet/i);
    expect(out[0].detail).toMatch(/will not count toward the stability comparison/i);
  });

  it("drops unknown axes and out-of-range values rather than guessing", () => {
    const out = buildGrowOutSuggestions({
      clones: [clone("c1", "cut", "px")],
      plantsById: {
        px: plant("px", "Odd", null, { nose_loudness: 8, made_up: 3, vigor: 99 }),
      },
      existingRuns: [],
    });
    expect(out[0].proposedRun.traits).toEqual({ nose_loudness: 8 });
  });

  it("collapses two clones pointing at one plant into a single proposal", () => {
    const out = buildGrowOutSuggestions({
      clones: [clone("c1", "cut a", "p1"), clone("c2", "cut b", "p1")],
      plantsById: PLANTS,
      existingRuns: [],
    });
    expect(out).toHaveLength(1);
  });

  it("skips a link whose plant is unreadable (deleted or not owned)", () => {
    const out = buildGrowOutSuggestions({
      clones: [clone("c1", "cut", "gone")],
      plantsById: PLANTS,
      existingRuns: [],
    });
    expect(out).toEqual([]);
  });

  it("orders proposals structurally by clone label, never by trait quality", () => {
    const out = buildGrowOutSuggestions({
      // "Zeta" has rich traits, "Alpha" has none — if quality ever drove the
      // order, Zeta would lead. Label order must win.
      clones: [clone("cZ", "Zeta", "p1"), clone("cA", "Alpha", "p2")],
      plantsById: PLANTS,
      existingRuns: [],
    });
    expect(out.map((s) => s.cloneLabel)).toEqual(["Alpha", "Zeta"]);
  });

  it("is null-safe against malformed input", () => {
    expect(
      buildGrowOutSuggestions({
        clones: [null as unknown as GrowOutCloneInput, clone("", "x", "p1")],
        plantsById: PLANTS,
        existingRuns: [],
      }),
    ).toEqual([]);
    expect(
      buildGrowOutSuggestions({
        clones: [],
        plantsById: {},
        existingRuns: null as unknown as StabilityRun[],
      }),
    ).toEqual([]);
  });
});

describe("static safety — grow-out handoff source", () => {
  const rawSrc = readFileSync(
    path.resolve(__dirname, "../lib/phenoGrowOutHandoffRules.ts"),
    "utf8",
  );
  const code = rawSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("is pure: no I/O, React, Supabase, AI, writes, or clock", () => {
    expect(rawSrc).not.toMatch(/from ["'][^"']*supabase/i);
    expect(rawSrc).not.toMatch(/from ["']react["']/);
    expect(rawSrc).not.toMatch(/\bfetch\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
    expect(rawSrc).not.toMatch(/\bnew Date\(|Date\.now\(|Math\.random\(/);
    expect(rawSrc).not.toMatch(/openai|anthropic|claude|gemini/i);
  });

  it("proposes only — it never auto-accepts, ranks, or over-claims", () => {
    expect(code).not.toMatch(/\bwinner\b/i);
    expect(code).not.toMatch(/\brank(ed|ing)?\b/i);
    expect(code).not.toMatch(/auto[-_ ]?(accept|add|save|select)/i);
    expect(code).not.toMatch(/\bguaranteed\b/i);
    expect(code).not.toMatch(/\bproven\b/i);
  });

  it("the caveat states nothing is added without the grower accepting it", () => {
    expect(GROW_OUT_HANDOFF_CAVEAT).toMatch(/Nothing is added until you accept/i);
    expect(GROW_OUT_HANDOFF_CAVEAT).toMatch(/only the ones you recorded yourself/i);
  });
});
