/**
 * Contract test for docs/grow-os-architecture.md.
 *
 * Pins the architectural contract for the grower-facing Grow OS so future
 * refactors don't quietly drop the Live/Manual/Demo/Stale/Unavailable
 * sensor labeling rule, the record that useGrowData has no mock fallback, the
 * Leads admin-only boundary, or the AI safety contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/grow-os-architecture.md");

const USE_GROW_DATA_ROW = /^\|\s*`src\/hooks\/useGrowData\.ts`.*$/m;

/**
 * Present-tense ways of saying the hook substitutes mock data. The history in
 * §4 is written in the past tense ("fell back", "was dropped") and stays legal.
 */
const PRESENT_TENSE_FALLBACK = [
  /\b(?:falls|falling) (?:back|through)\b[^.\n]*\b(?:mock|fixture|demo)/i,
  /\b(?:performs|does|has|uses|keeps|applies)\b[^.\n]*\bmock[- ]?fallback\b/i,
  /\b(?:returns|serves|substitutes|swaps in|shows)\b[^.\n]*\b(?:mock|fixture) (?:rows|data|tents|plants|readings|fixtures?)\b/i,
];

/**
 * Every place the doc claims, in any wording, that useGrowData still falls
 * back to mock data. Checks the claim rather than one exact sentence:
 * - the useGrowData row of the current-state table must say "no mock fallback"
 *   and mention no other fallback;
 * - no line may describe a mock fallback in the present tense.
 */
function findStaleFallbackClaims(doc: string): string[] {
  const found: string[] = [];
  const row = doc.match(USE_GROW_DATA_ROW)?.[0];
  if (!row) {
    found.push("missing useGrowData row in the current-state table");
  } else {
    const rest = row.replace(/no mock fallback/gi, "");
    if (!/no mock fallback/i.test(row) || /fall(?:s|ing)? ?back|fell back|substitut/i.test(rest)) {
      found.push(row.trim());
    }
  }
  for (const line of doc.split("\n")) {
    if (PRESENT_TENSE_FALLBACK.some((re) => re.test(line))) found.push(line.trim());
  }
  return found;
}

describe("docs/grow-os-architecture.md — contract", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  it("documents all five sensor label states", () => {
    for (const label of ["Live", "Manual", "Demo", "Stale", "Unavailable"]) {
      expect(DOC).toContain(label);
    }
  });

  it("records that useGrowData no longer falls back to mock data", () => {
    // The fallback was removed; the doc must not describe it as current.
    expect(DOC).toMatch(/useGrowData/);
    expect(findStaleFallbackClaims(DOC)).toEqual([]);
  });

  it("keeps the fallback history under a Resolved heading", () => {
    expect(DOC).toMatch(/^## 4\. Resolved Risk\b.*useGrowData.*mock fallback/m);
  });

  it("documents useMockData as a mock surface", () => {
    expect(DOC).toMatch(/useMockData/);
  });

  it("documents diary_entries as real Supabase-backed", () => {
    expect(DOC).toMatch(/diary_entries/);
  });

  it("documents the diary-photos storage bucket", () => {
    expect(DOC).toMatch(/diary-photos/);
  });

  it("states Leads is separate, internal, admin/operator only", () => {
    expect(DOC).toMatch(/Leads/);
    expect(DOC).toMatch(/separate from Grow OS/i);
    expect(DOC).toMatch(/admin\s*\/\s*operator/i);
    expect(DOC).toMatch(/internal/i);
  });

  it("states mock/demo data must not be presented as live", () => {
    expect(DOC).toMatch(/must never be presented as live/i);
  });

  it("states empty real Supabase results must produce empty states", () => {
    expect(DOC).toMatch(/empty real Supabase results\s+must produce empty states/i);
  });

  it("states AI confidence must be limited when context is missing or demo-backed", () => {
    expect(DOC).toMatch(/AI/);
    expect(DOC).toMatch(/must not give high-confidence/i);
    expect(DOC).toMatch(/Demo data must not raise AI confidence/i);
  });
});

describe("stale useGrowData fallback detector", () => {
  const ROW_OK =
    "| `src/hooks/useGrowData.ts` | Supabase only, **no mock fallback**: empty reads stay empty |";

  it.each([
    [
      "the original table wording",
      "| `src/hooks/useGrowData.ts` | Supabase, then **silently falls back to mock** on empty/error |",
    ],
    [
      "a reworded table row",
      "| `src/hooks/useGrowData.ts` | Reads Supabase; uses a mock fallback when a read fails |",
    ],
    ["a row that drops the no-fallback record", "| `src/hooks/useGrowData.ts` | Supabase only |"],
    ["the original prose", `${ROW_OK}\n\`useGrowData\` performs a silent mock fallback.`],
    [
      "reworded prose",
      `${ROW_OK}\nWhen Supabase is empty, useGrowData quietly falls back to the demo fixture.`,
    ],
    [
      "a substitution claim",
      `${ROW_OK}\nOn error the hook returns mock rows without a Demo label.`,
    ],
    ["a missing row", "No table here."],
  ])("flags %s", (_label, doc) => {
    expect(findStaleFallbackClaims(doc)).not.toEqual([]);
  });

  it.each([
    ["the current row", ROW_OK],
    [
      "past-tense history",
      `${ROW_OK}\nThis section used to say that useGrowData silently fell back to mock rows.`,
    ],
    ["a dropped fallback", `${ROW_OK}\n_Status:_ done; the fallback was dropped.`],
  ])("allows %s", (_label, doc) => {
    expect(findStaleFallbackClaims(doc)).toEqual([]);
  });
});
