/**
 * pheno-copy-regression — guards Pheno Tracker copy against language that
 * conflates Setup complete with Comparison-ready, or that implies AI /
 * automated keeper selection.
 *
 * Scope: static scan of Pheno-related presenter and constant files.
 * No app behavior, no network, no Supabase.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PHENO_COMPARISON_READY_DEFINITION,
  PHENO_SETUP_COMPLETE_DEFINITION,
} from "@/constants/phenoOnboardingCopy";

const ROOTS = ["src/components", "src/pages", "src/lib", "src/constants"];
const PHENO_HINT = /pheno/i;
const SELF_PATH_SUBSTR = "pheno-copy-regression";

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const ALL_FILES = ROOTS.flatMap((r) => walk(r));

const PHENO_FILES = ALL_FILES.filter((p) => {
  if (p.includes(SELF_PATH_SUBSTR)) return false;
  if (PHENO_HINT.test(p)) return true;
  try {
    return PHENO_HINT.test(readFileSync(p, "utf8"));
  } catch {
    return false;
  }
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Pheno copy regression", () => {
  it("scan covers at least the Pheno onboarding + workspace surfaces", () => {
    const expected = [
      "src/components/PhenoHuntSetupProgressCard.tsx",
      "src/components/PhenoComparisonReadyChecklist.tsx",
      "src/components/PhenoCompareCandidatesAction.tsx",
      "src/constants/phenoOnboardingCopy.ts",
      "src/lib/phenoHuntOnboardingViewModel.ts",
      "src/lib/phenoComparisonActionState.ts",
    ];
    for (const e of expected) {
      expect(PHENO_FILES.some((f) => f.endsWith(e))).toBe(true);
    }
  });

  it("Setup complete and Comparison-ready are never presented as synonyms", () => {
    // Forbid phrasings that literally equate the two.
    const patterns: RegExp[] = [
      /setup\s+complete\s*[:=]\s*comparison[- ]?ready/i,
      /setup\s+is\s+complete[^.?!]{0,40}so[^.?!]{0,40}comparison[- ]?ready/i,
      /once\s+setup\s+is\s+complete[^.?!]{0,60}comparison[- ]?ready/i,
      /setup\s+complete\s+means\s+comparison[- ]?ready/i,
      /comparison[- ]?ready\s+means\s+setup\s+complete/i,
    ];
    for (const file of PHENO_FILES) {
      const src = read(file);
      for (const pat of patterns) {
        expect(pat.test(src), `${file} equates setup complete with comparison-ready`).toBe(false);
      }
    }
  });

  it("does not imply candidate comparison is valid with missing evidence", () => {
    const patterns: RegExp[] = [
      /valid\s+comparison[^.?!]{0,40}missing\s+evidence/i,
      /compare\s+candidates?\s+without\s+evidence/i,
      /comparison\s+is\s+valid\s+even\s+when\s+evidence\s+is\s+missing/i,
      /honest\s+comparison\s+without\s+evidence/i,
    ];
    for (const file of PHENO_FILES) {
      const src = read(file);
      for (const pat of patterns) {
        expect(pat.test(src), `${file} implies comparison is valid without evidence`).toBe(false);
      }
    }
  });

  it("does not contain forbidden marketing phrases", () => {
    const forbidden = [
      /guaranteed\s+keeper/i,
      /ai\s+picks?\s+winners?/i,
      /automated\s+breeding/i,
      /ai\s+chooses?\s+the\s+keeper/i,
      /auto[- ]?select(?:s|ed)?\s+the\s+keeper/i,
    ];
    for (const file of PHENO_FILES) {
      const src = read(file);
      for (const pat of forbidden) {
        expect(pat.test(src), `${file} contains forbidden phrase ${pat}`).toBe(false);
      }
    }
  });

  it("canonical definitions exist and are used verbatim in workspace card", () => {
    expect(PHENO_SETUP_COMPLETE_DEFINITION).toMatch(/candidates and evidence goals/i);
    expect(PHENO_COMPARISON_READY_DEFINITION).toMatch(/enough evidence to compare honestly/i);
    const card = read("src/components/PhenoHuntSetupProgressCard.tsx");
    expect(card).toMatch(/PHENO_SETUP_COMPLETE_DEFINITION/);
    expect(card).toMatch(/PHENO_COMPARISON_READY_DEFINITION/);
  });
});
