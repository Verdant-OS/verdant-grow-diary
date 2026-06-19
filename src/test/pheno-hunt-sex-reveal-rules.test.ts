/**
 * Tests for the Pheno Hunt sex-reveal safety classifier.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifySexReveal,
  SEX_REVEAL_COPY,
  SEX_REVEAL_PROMPT_INSTRUCTION,
  type SexRevealResult,
  type SexRevealSignals,
} from "@/lib/phenoHuntSexRevealRules";

function sig(over: Partial<SexRevealSignals> = {}): SexRevealSignals {
  return {
    pistilNodeCount: 0,
    pollenSacNodeCount: 0,
    bananaStructures: false,
    earlyRoundedNodeOnly: false,
    imageQuality: "sharp",
    nodesVisible: 3,
    reproductiveStructureVisible: true,
    ...over,
  };
}

function expectAlwaysHasContext(res: SexRevealResult) {
  expect(Array.isArray(res.missing_information)).toBe(true);
  expect(typeof res.follow_up).toBe("string");
  expect(res.follow_up.length).toBeGreaterThan(0);
}

describe("classifySexReveal", () => {
  it("requires multiple pollen-sac nodes for confirmed_male", () => {
    const single = classifySexReveal(
      sig({ pollenSacNodeCount: 1, earlyRoundedNodeOnly: true }),
    );
    expect(single.assessment).not.toBe("confirmed_male");

    const many = classifySexReveal(sig({ pollenSacNodeCount: 3 }));
    expect(many.assessment).toBe("confirmed_male");
    expect(many.confidence).toBe("high");
    expectAlwaysHasContext(many);
  });

  it("classifies a single rounded preflower node with no pistils as likely_male", () => {
    const res = classifySexReveal(
      sig({
        earlyRoundedNodeOnly: true,
        pistilNodeCount: 0,
        pollenSacNodeCount: 0,
      }),
    );
    expect(res.assessment).toBe("likely_male");
    expect(res.confidence).not.toBe("high");
    expect(res.immediate_action).toBe(SEX_REVEAL_COPY.likely_male);
  });

  it("returns unclear for blurry / single-node / no-feature inputs", () => {
    const blurry = classifySexReveal(
      sig({ imageQuality: "blurry", pollenSacNodeCount: 3 }),
    );
    expect(blurry.assessment).toBe("unclear");

    const oneNode = classifySexReveal(sig({ nodesVisible: 1 }));
    expect(oneNode.assessment).toBe("unclear");

    const noFeature = classifySexReveal(
      sig({ reproductiveStructureVisible: false }),
    );
    expect(noFeature.assessment).toBe("unclear");

    for (const r of [blurry, oneNode, noFeature]) {
      expect(r.confidence).toBe("low");
      expect(r.immediate_action).toBe(SEX_REVEAL_COPY.unclear);
      expectAlwaysHasContext(r);
    }
  });

  it("requires multi-node pistils for confirmed_female", () => {
    const oneNode = classifySexReveal(sig({ pistilNodeCount: 1 }));
    expect(oneNode.assessment).toBe("likely_female");

    const multi = classifySexReveal(sig({ pistilNodeCount: 2 }));
    expect(multi.assessment).toBe("confirmed_female");
    expect(multi.confidence).toBe("high");
  });

  it("pistils + pollen sacs → possible_herm", () => {
    const res = classifySexReveal(
      sig({ pistilNodeCount: 2, pollenSacNodeCount: 1 }),
    );
    expect(res.assessment).toBe("possible_herm");
    expect(res.immediate_action).toBe(SEX_REVEAL_COPY.possible_herm);
  });

  it("pistils + banana structures → possible_herm", () => {
    const res = classifySexReveal(
      sig({ pistilNodeCount: 2, bananaStructures: true }),
    );
    expect(res.assessment).toBe("possible_herm");
  });

  it("never produces high confidence from weak evidence", () => {
    const weakInputs: SexRevealSignals[] = [
      sig({ imageQuality: "blurry", pollenSacNodeCount: 4 }),
      sig({ nodesVisible: 1, pistilNodeCount: 5 }),
      sig({ earlyRoundedNodeOnly: true, pollenSacNodeCount: 1 }),
      sig({ pistilNodeCount: 1 }),
      sig({ reproductiveStructureVisible: false }),
    ];
    for (const s of weakInputs) {
      const r = classifySexReveal(s);
      expect(r.confidence).not.toBe("high");
    }
  });

  it("always includes missing_information and follow_up", () => {
    const all = [
      classifySexReveal(sig({ pollenSacNodeCount: 3 })),
      classifySexReveal(sig({ pistilNodeCount: 2 })),
      classifySexReveal(sig({ pistilNodeCount: 1 })),
      classifySexReveal(sig({ earlyRoundedNodeOnly: true })),
      classifySexReveal(sig({ pistilNodeCount: 2, bananaStructures: true })),
      classifySexReveal(sig({ imageQuality: "blurry" })),
    ];
    for (const r of all) {
      expectAlwaysHasContext(r);
    }
  });

  it("includes do-not-cull copy for likely / unclear / herm outputs", () => {
    const cases = [
      classifySexReveal(sig({ earlyRoundedNodeOnly: true })),
      classifySexReveal(sig({ pistilNodeCount: 1 })),
      classifySexReveal(sig({ imageQuality: "blurry" })),
      classifySexReveal(sig({ pistilNodeCount: 2, pollenSacNodeCount: 1 })),
    ];
    for (const r of cases) {
      const text = r.what_not_to_do.join(" ").toLowerCase();
      expect(text).toMatch(/cull|destroy/);
      expect(text).toMatch(/irreversible/);
    }
  });

  it("never emits irreversible-action language in likely/unclear immediate_action", () => {
    const cases = [
      classifySexReveal(sig({ earlyRoundedNodeOnly: true })),
      classifySexReveal(sig({ pistilNodeCount: 1 })),
      classifySexReveal(sig({ imageQuality: "blurry" })),
    ];
    for (const r of cases) {
      const t = r.immediate_action.toLowerCase();
      expect(t).not.toMatch(/cull|destroy|chop|kill/);
    }
  });

  it("is deterministic across repeated calls for the same input", () => {
    const s = sig({ pistilNodeCount: 2 });
    expect(classifySexReveal(s)).toEqual(classifySexReveal(s));
  });

  it("normalizes non-finite / negative numeric inputs safely", () => {
    const r = classifySexReveal(
      sig({
        pistilNodeCount: -3,
        pollenSacNodeCount: Number.NaN as unknown as number,
        nodesVisible: -1,
      }),
    );
    expect(r.assessment).toBe("unclear");
  });

  it("exports a non-empty reusable prompt instruction block", () => {
    expect(SEX_REVEAL_PROMPT_INSTRUCTION.length).toBeGreaterThan(100);
    expect(SEX_REVEAL_PROMPT_INSTRUCTION.toLowerCase()).toContain(
      "never confirm plant sex",
    );
  });
});

describe("phenoHuntSexRevealRules — static safety", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/phenoHuntSexRevealRules.ts"),
    "utf8",
  );
  // Strip comments so docstrings don't trigger false positives.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("imports no AI / alerts / action-queue / device modules", () => {
    expect(code).not.toMatch(/from\s+["']@\/lib\/ai/);
    expect(code).not.toMatch(/from\s+["']@\/lib\/alerts/);
    expect(code).not.toMatch(/from\s+["']@\/lib\/actionQueue/);
    expect(code.toLowerCase()).not.toMatch(/device[_-]?control/);
    expect(code.toLowerCase()).not.toMatch(/automation/);
  });

  it("imports nothing at all (pure module)", () => {
    expect(code).not.toMatch(/^\s*import\s/m);
  });

  it("never references service_role or bridge tokens", () => {
    expect(code).not.toMatch(/service[_-]?role/i);
    expect(code).not.toMatch(/bridge[_-]?token/i);
  });
});
