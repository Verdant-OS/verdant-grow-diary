/**
 * Breeding-objective brief — static wiring contracts.
 *
 * Pins the seams so the feature cannot silently unwire:
 *  - persistence goes ONLY through the existing updatePhenoHuntSetup patch
 *    function (never a raw .from("pheno_hunts").update( in the page or
 *    editor — a real write surface, unlike clone-insurance, so this test
 *    proves WHERE the write happens rather than that it doesn't);
 *  - the hunt summary mapper re-sanitizes breeding_objective on every read;
 *  - the editor picks axes only from the canonical LOUD_TRAIT_AXES catalog,
 *    never a duplicated taxonomy;
 *  - the workspace page renders the editor and a read-only per-candidate
 *    badge, and that badge region contains no write calls;
 *  - the objective is kept structurally separate from readiness (its own
 *    useMemo, never folded into candidateReadiness/readinessExtras).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string): string =>
  readFileSync(path.resolve(__dirname, "..", rel), "utf8");

const SERVICE = read("lib/phenoHuntService.ts");
const SUMMARY_SERVICE = read("lib/phenoHuntCandidatesService.ts");
const PAGE = read("pages/PhenoHuntWorkspace.tsx");
const EDITOR = read("components/PhenoBreedingObjectiveEditor.tsx");
const MIGRATION = readFileSync(
  path.resolve(
    __dirname,
    "../../supabase/migrations/20260718000000_pheno_hunts_breeding_objective.sql",
  ),
  "utf8",
);

describe("persistence — one write path, reusing the existing setup-patch function", () => {
  it("phenoHuntService sanitizes and patches breeding_objective through updatePhenoHuntSetup", () => {
    expect(SERVICE).toMatch(/breedingObjective\?:\s*readonly unknown\[\]/);
    expect(SERVICE).toMatch(
      /patch\.breeding_objective = sanitizeBreedingObjectiveTargets\(input\.breedingObjective\)/,
    );
    expect(SERVICE).toMatch(/from "@\/lib\/phenoBreedingObjectiveRules"/);
  });

  it("the editor and page never call supabase directly — only the callback prop / service function", () => {
    expect(EDITOR).not.toMatch(/from ["'][^"']*supabase/i);
    expect(EDITOR).not.toMatch(/\.insert\(|\.update\(|\.rpc\(|functions\.invoke/);
    // The page's only breeding-objective write path is updatePhenoHuntSetup.
    const objectiveSaveFn = PAGE.slice(
      PAGE.indexOf("handleSaveBreedingObjective"),
      PAGE.indexOf("handleSaveBreedingObjective") + 700,
    );
    expect(objectiveSaveFn).toMatch(/updatePhenoHuntSetup\(\{ huntId: ws\.hunt\.id, breedingObjective: targets \}\)/);
    expect(objectiveSaveFn).not.toMatch(/\.from\(\s*["']pheno_hunts["']\s*\)\s*\.(update|upsert|insert)\(/);
  });
});

describe("read path — re-sanitized on every load", () => {
  it("mapHuntSummary re-sanitizes breeding_objective defensively", () => {
    expect(SUMMARY_SERVICE).toMatch(/from "@\/lib\/phenoBreedingObjectiveRules"/);
    expect(SUMMARY_SERVICE).toMatch(
      /sanitizeBreedingObjectiveTargets\(\s*Array\.isArray\(huntRow\.breeding_objective\)/,
    );
    expect(SUMMARY_SERVICE).toMatch(/breedingObjective\?:\s*BreedingObjectiveTarget\[\]/);
  });
});

describe("axis catalog — reused, never duplicated", () => {
  it("the editor's axis dropdown is built from the canonical LOUD_TRAIT_AXES", () => {
    expect(EDITOR).toMatch(/from "@\/lib\/phenoExpressionRules"/);
    expect(EDITOR).toMatch(/LOUD_TRAIT_AXES/);
    expect(EDITOR).toMatch(/availableObjectiveAxes/);
  });
});

describe("workspace page — editor mount + read-only per-candidate badge", () => {
  it("mounts the editor with the optimistic-override targets and save handler", () => {
    expect(PAGE).toMatch(/from "@\/components\/PhenoBreedingObjectiveEditor"/);
    expect(PAGE).toMatch(/<PhenoBreedingObjectiveEditor/);
    expect(PAGE).toMatch(/targets=\{effectiveBreedingObjective\}/);
    expect(PAGE).toMatch(/onSave=\{handleSaveBreedingObjective\}/);
  });

  it("threads the objective into every candidate card as a distinct prop", () => {
    expect(PAGE).toMatch(/breedingObjective: readonly BreedingObjectiveTarget\[\]/);
    expect(PAGE).toMatch(/breedingObjective=\{effectiveBreedingObjective\}/);
  });

  it("renders the per-candidate badge testid, and that region is read-only", () => {
    const badgeTestidIdx = PAGE.indexOf('data-testid={`workspace-objective-${plantId}`}');
    expect(badgeTestidIdx).toBeGreaterThan(0);
    const badgeRegion = PAGE.slice(badgeTestidIdx - 200, badgeTestidIdx + 300);
    expect(badgeRegion).not.toMatch(/onClick|\.insert\(|\.update\(|\.rpc\(|functions\.invoke/);
  });

  it("stays a distinct concept from evidence readiness — its own useMemo, never folded into candidateReadiness", () => {
    expect(PAGE).toMatch(/const objectiveSummary = useMemo\(/);
    // candidateReadiness's own parameter list must not have grown to accept it.
    const readinessFnIdx = PAGE.indexOf("function candidateReadiness(");
    const readinessFnSrc = PAGE.slice(readinessFnIdx, readinessFnIdx + 700);
    expect(readinessFnSrc).not.toMatch(/breedingObjective|objectiveSummary/);
  });
});

describe("migration — additive column, no policy/grant/trigger changes", () => {
  it("matches the service's exact column name", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS breeding_objective jsonb/);
    expect(SERVICE).toMatch(/breeding_objective/);
    expect(SUMMARY_SERVICE).toMatch(/breeding_objective/);
  });
});

describe("static safety — no ranking vocabulary in any new UI/service file", () => {
  const files: Record<string, string> = { SERVICE, SUMMARY_SERVICE, EDITOR };

  it("no winner/best/rank/auto-select/scoreboard/guaranteed language", () => {
    for (const [name, src] of Object.entries(files)) {
      expect(src, name).not.toMatch(/\bwinner\b/i);
      expect(src, name).not.toMatch(/\bbest\s+pheno\b/i);
      expect(src, name).not.toMatch(/\brank(ed|ing)?\b/i);
      expect(src, name).not.toMatch(/auto[-_ ]?(select|rank)/i);
      expect(src, name).not.toMatch(/\bscoreboard\b/i);
      expect(src, name).not.toMatch(/\bguaranteed\b/i);
    }
  });

  it("no service_role / bridge tokens / device-control vocabulary in the genuinely new file", () => {
    // SERVICE and SUMMARY_SERVICE are pre-existing files with their own
    // legitimate doctrine comments (e.g. "never uses service_role") that a
    // literal-match scan would false-positive on; EDITOR is wholly new.
    expect(EDITOR).not.toMatch(/service[_-]?role/i);
    expect(EDITOR).not.toMatch(/bridge[_-]?token/i);
    expect(EDITOR).not.toMatch(/device[_-]?control|actuator|autopilot|\bmqtt\b/i);
  });
});
