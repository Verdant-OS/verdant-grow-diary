/**
 * AC-INFINITY-IMPORT-CLAIM-HONESTY
 *
 * No real AC Infinity app export has been run through Verdant's CSV importer,
 * so live copy must not promise AC Infinity import. Spider Farmer GGS import is
 * tested on real exports and may be promised.
 *
 * Rule: in every grower-facing copy source below, any sentence that names AC
 * Infinity and talks about importing must also say it is "not confirmed".
 * Questions (sentences ending in "?") are not claims and are skipped.
 *
 * When a real AC Infinity export passes the importer, update the copy and this
 * test together.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COPY_SOURCES = [
  "src/constants/verdantSeoContent.ts",
  "src/constants/verdantSeoCopy.ts",
  "src/lib/publicGrowGuideArticles.ts",
  "src/lib/environmentCsvPreviewCopyRules.ts",
  "src/lib/sensorImportPreviewCopy.ts",
  "src/pages/HardwareIntegrations.tsx",
  "src/pages/GuidesIndex.tsx",
  "src/components/EnvironmentCsvImportLauncher.tsx",
  "public/llms.txt",
] as const;

const AC_INFINITY = /\bAC\s+Infinity\b/i;
const IMPORT_WORD = /\bimport(?:s|ed|ing)?\b/i;
const QUALIFIER = /\bnot\s+(?:yet\s+)?confirmed\b/i;

/** Text a grower can read: string literals, JSX text, or the whole file for plain text. */
function readableChunks(path: string, source: string): string[] {
  if (path.endsWith(".txt")) return [source];
  const chunks: string[] = [];
  const literal = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of source.matchAll(literal)) chunks.push(m[1] ?? m[2] ?? m[3] ?? "");
  if (path.endsWith(".tsx")) {
    for (const m of source.matchAll(/>([^<>{}]+)</g)) chunks.push(m[1]);
  }
  return chunks;
}

function sentences(chunk: string): string[] {
  return chunk
    .replace(/\\'/g, "'")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function unqualifiedAcInfinityImportClaims(path: string, source: string): string[] {
  const found: string[] = [];
  for (const chunk of readableChunks(path, source)) {
    for (const s of sentences(chunk)) {
      if (s.endsWith("?")) continue;
      if (AC_INFINITY.test(s) && IMPORT_WORD.test(s) && !QUALIFIER.test(s)) found.push(s);
    }
  }
  return found;
}

describe("AC Infinity import claims stay qualified until a real export passes", () => {
  it.each(COPY_SOURCES)("%s makes no unqualified AC Infinity import claim", (rel) => {
    const source = readFileSync(resolve(process.cwd(), rel), "utf8");
    expect(unqualifiedAcInfinityImportClaims(rel, source)).toEqual([]);
  });

  it("flags an unqualified claim and accepts a qualified one or a question", () => {
    const f = "x.ts";
    expect(
      unqualifiedAcInfinityImportClaims(f, '"Verdant imports AC Infinity CSVs on Free."'),
    ).toHaveLength(1);
    expect(
      unqualifiedAcInfinityImportClaims(
        f,
        '"Spider Farmer exports import on Free; AC Infinity app exports are not confirmed yet."',
      ),
    ).toEqual([]);
    expect(unqualifiedAcInfinityImportClaims(f, '"Can Verdant import AC Infinity CSVs?"')).toEqual(
      [],
    );
  });
});
