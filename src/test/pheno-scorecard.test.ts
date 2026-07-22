/**
 * Pheno Comparison scorecard — pure rules + wiring + migration guardrails.
 *
 * Grower 1-5 trait ratings (pheno_candidate_scores) fill the phenotype rows of
 * the Pro comparison. These tests pin: rating validation (integers 1-5 only,
 * bad values dropped not clamped), the DB↔engine bridge, that scores turn a
 * "thin record" into a real one, the read/write wiring, and the RLS-scoped,
 * ownership-checked migration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildScoreTraitsPayload,
  countRatedTraits,
  isValidTraitRating,
  normalizeScoreTraits,
  phenotypeInputFromScoreTraits,
  PHENO_SCORECARD_TRAITS,
} from "@/lib/phenoScorecardRules";
import { buildRealPhenoComparisonInput } from "@/lib/phenoComparisonRealInput";
import { buildPhenoComparisonViewModel } from "@/lib/phenoComparisonViewModel";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("scorecard rating validation", () => {
  it("accepts integers 1-5 (number or numeric string), rejects the rest", () => {
    for (const v of [1, 2, 3, 4, 5, "3"]) expect(isValidTraitRating(v)).toBe(true);
    for (const v of [0, 6, -1, 2.5, "x", null, undefined, NaN, {}])
      expect(isValidTraitRating(v)).toBe(false);
  });

  it("normalizes a raw blob, dropping unknown keys and invalid values (never clamps)", () => {
    const norm = normalizeScoreTraits({
      vigor: 4,
      aroma: "5",
      resin: 9, // out of range → dropped
      bogus_trait: 3, // unknown key → dropped
      structure: 0, // out of range → dropped
    });
    expect(norm).toEqual({ vigor: 4, aroma: 5 });
    expect(countRatedTraits({ vigor: 4, aroma: 5, resin: 99 })).toBe(2);
  });

  it("payload keeps only valid ratings (blank/invalid become absent, not 0)", () => {
    const payload = buildScoreTraitsPayload({ vigor: 5, aroma: null, resin: 7 as never });
    expect(payload).toEqual({ vigor: 5 });
  });
});

describe("DB → engine phenotype bridge", () => {
  it("maps each rated trait to { value } and omits unrated ones", () => {
    const input = phenotypeInputFromScoreTraits({ vigor: 4, aroma: 5, resin: 0 });
    expect(input.vigor).toEqual({ value: 4 });
    expect(input.aroma).toEqual({ value: 5 });
    expect(input.resin).toBeUndefined();
  });

  it("a fully-scored candidate is no longer a thin record in the engine", () => {
    // Rate all six core traits.
    const traits: Record<string, number> = {
      structure: 4,
      bud_density: 5,
      resin: 5,
      aroma: 4,
      vigor: 4,
      finish: 3,
    };
    const built = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: {},
      candidates: [
        {
          id: "p1",
          candidate_label: "#1",
          name: "BD #1",
          strain: "Blue Dream",
          stage: "flower",
          grow_id: "g1",
          tent_id: "t1",
        },
      ],
      activityByPlant: {},
      scoreTraitsByPlant: { p1: traits },
    });
    const vm = buildPhenoComparisonViewModel(built);
    const c = vm.candidates[0];
    expect(c.selectionEvidence.recordedCoreCount).toBe(6);
    expect(c.selectionEvidence.strength).not.toBe("thin");
    const codes = c.selectionCaveats.map((x) => x.code);
    expect(codes).not.toContain("thin_phenotype");
  });

  it("unscored candidates keep the honest 'Not recorded' gaps", () => {
    const built = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: {},
      candidates: [
        { id: "p1", candidate_label: "#1", name: null, strain: null, stage: null, grow_id: "g1", tent_id: null },
      ],
      activityByPlant: {},
      scoreTraitsByPlant: {},
    });
    expect(built.candidates[0].phenotype).toBeUndefined();
  });
});

describe("wiring — read + write are RLS-scoped and single-table", () => {
  const HOOK = read("src/hooks/useGrowPhenoComparison.ts");
  const SAVE = read("src/hooks/useSaveCandidateScore.ts");
  const PAGE = read("src/pages/GrowPhenoComparison.tsx");
  const DIALOG = read("src/components/PhenoScorecardDialog.tsx");

  it("loader reads pheno_candidate_scores for the hunt and feeds the mapper", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']pheno_candidate_scores["']\s*\)/);
    expect(HOOK).toMatch(/scoreTraitsByPlant/);
  });

  it("save upserts a single row and invalidates the comparison query", () => {
    expect(SAVE).toMatch(/\.from\(\s*["']pheno_candidate_scores["']\s*\)\s*\.upsert\(/);
    expect(SAVE).toMatch(/onConflict:\s*["']hunt_id,plant_id["']/);
    expect(SAVE).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["grow_pheno_comparison"\]/);
    // No RPC / AI / device surface.
    expect(SAVE).not.toMatch(/\.rpc\(|functions\.invoke|ai_credit/);
  });

  it("the scorecard dialog is mounted on the live (Pro) comparison only", () => {
    expect(PAGE).toMatch(/<PhenoScorecardDialog/);
    // It lives inside the entitled live branch, not the locked/paywall branch.
    const liveIdx = PAGE.indexOf('grow-pheno-comparison-live');
    const dialogIdx = PAGE.indexOf("<PhenoScorecardDialog");
    expect(liveIdx).toBeGreaterThan(-1);
    expect(dialogIdx).toBeGreaterThan(liveIdx);
  });

  it("dialog renders a row per trait key and never claims to rank/pick", () => {
    expect(PHENO_SCORECARD_TRAITS.length).toBe(10);
    // Rows are generated by mapping PHENO_SCORECARD_TRAITS; the testid is built
    // from each trait key via a template literal.
    expect(DIALOG).toMatch(/PHENO_SCORECARD_TRAITS\.map/);
    expect(DIALOG).toMatch(/pheno-scorecard-trait-\$\{t\.key\}/);
    expect(DIALOG.toLowerCase()).not.toMatch(/\bwinner\b|picks the keeper|best pheno/);
  });
});

describe("migration — pheno_candidate_scores RLS + ownership", () => {
  const MIG = (() => {
    const dir = resolve(ROOT, "supabase/migrations");
    const f = readdirSync(dir).find((n) =>
      /pheno_candidate_scores_foundation\.sql$/.test(n),
    );
    return f ? readFileSync(join(dir, f), "utf8") : "";
  })();

  it("creates the table with a hunt+plant unique key and an object-traits check", () => {
    expect(MIG).toMatch(/CREATE\s+TABLE\s+public\.pheno_candidate_scores/i);
    expect(MIG).toMatch(/UNIQUE\s*\(\s*hunt_id\s*,\s*plant_id\s*\)/i);
    expect(MIG).toMatch(/jsonb_typeof\(traits\)\s*=\s*'object'/i);
  });

  it("enables RLS and scopes every policy to the owner (no anon grant)", () => {
    expect(MIG).toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(MIG).toMatch(/FOR\s+SELECT\s+TO\s+authenticated[\s\S]*auth\.uid\(\)\s*=\s*user_id/i);
    expect(MIG).not.toMatch(/TO\s+anon\b/i);
  });

  it("insert/update require the hunt AND the plant to belong to the caller", () => {
    expect(MIG).toMatch(
      /WITH\s+CHECK[\s\S]*public\.pheno_hunts[\s\S]*h\.user_id\s*=\s*auth\.uid\(\)[\s\S]*public\.plants[\s\S]*p\.pheno_hunt_id\s*=\s*hunt_id/i,
    );
  });
});
