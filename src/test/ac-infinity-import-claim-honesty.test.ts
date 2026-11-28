/**
 * AC-INFINITY-IMPORT-CLAIM-HONESTY
 *
 * No real AC Infinity app export has been run through Verdant's CSV importer,
 * so live copy must not promise AC Infinity import. Spider Farmer GGS import is
 * tested on real exports and may be promised.
 *
 * Rules, for every grower-facing copy source below:
 * - A sentence that names AC Infinity and talks about importing or bringing in
 *   data must also say it is "not confirmed". Questions (sentences ending in
 *   "?") are not claims and are skipped.
 * - An FAQ answer whose question names AC Infinity, and that talks about
 *   importing or bringing in data, must also say "not confirmed".
 * - Inline JSX markup (<strong>, <a> and the like) is removed first, so a claim
 *   split across tags is still read as one sentence.
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
const IMPORT_WORD = /\b(?:import(?:s|ed|ing)?|bring(?:s|ing)?\s+in|brought\s+in)\b/i;
const QUALIFIER = /\bnot\s+(?:yet\s+)?confirmed\b/i;

const STRING = String.raw`"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|\x60((?:[^\x60\\]|\\.)*)\x60`;
const INLINE_TAG = /<\/?(?:a|b|i|em|strong|span|code|mark|small)(?:\s[^<>]*)?>/g;

function unescape(text: string): string {
  return text.replace(/\\(['"\x60])/g, "$1");
}

/** Text a grower can read: string literals, JSX text, or the whole file for plain text. */
function readableChunks(path: string, source: string): string[] {
  if (path.endsWith(".txt")) return [source];
  const chunks: string[] = [];
  for (const m of source.matchAll(new RegExp(STRING, "g"))) {
    chunks.push(unescape(m[1] ?? m[2] ?? m[3] ?? ""));
  }
  if (path.endsWith(".tsx")) {
    const flattened = source.replace(INLINE_TAG, "");
    for (const m of flattened.matchAll(/>([^<>{}]+)</g)) chunks.push(m[1]);
  }
  return chunks;
}

function sentences(chunk: string): string[] {
  return chunk
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** FAQ question/answer pairs written as `question: "...", answer: "..."`. */
function faqPairs(source: string): Array<{ question: string; answer: string }> {
  const pair = new RegExp(String.raw`question:\s*(?:${STRING})\s*,\s*answer:\s*(?:${STRING})`, "g");
  const pairs: Array<{ question: string; answer: string }> = [];
  for (const m of source.matchAll(pair)) {
    pairs.push({
      question: unescape(m[1] ?? m[2] ?? m[3] ?? ""),
      answer: unescape(m[4] ?? m[5] ?? m[6] ?? ""),
    });
  }
  return pairs;
}

function unqualifiedAcInfinityImportClaims(path: string, source: string): string[] {
  const found: string[] = [];
  for (const chunk of readableChunks(path, source)) {
    for (const s of sentences(chunk)) {
      if (s.endsWith("?")) continue;
      if (AC_INFINITY.test(s) && IMPORT_WORD.test(s) && !QUALIFIER.test(s)) found.push(s);
    }
  }
  for (const { question, answer } of faqPairs(source)) {
    if (AC_INFINITY.test(question) && IMPORT_WORD.test(answer) && !QUALIFIER.test(answer)) {
      found.push(`${question} → ${answer}`);
    }
  }
  return found;
}

describe("AC Infinity import claims stay qualified until a real export passes", () => {
  it.each(COPY_SOURCES)("%s makes no unqualified AC Infinity import claim", (rel) => {
    const source = readFileSync(resolve(process.cwd(), rel), "utf8");
    expect(unqualifiedAcInfinityImportClaims(rel, source)).toEqual([]);
  });

  it("accepts a qualified claim and a bare question", () => {
    const f = "x.ts";
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

  it.each([
    ["a plain import claim", "x.ts", '"Verdant imports AC Infinity CSVs on Free."'],
    [
      "the original launcher intro",
      "x.tsx",
      "<p>Bring in an AC Infinity CSV or other environment export.</p>",
    ],
    [
      "the original CSV_IMPORT_DESCRIPTION",
      "x.ts",
      '"Bring in your Spider Farmer, AC Infinity, or other environment CSV. Verdant will source-tag it as historical CSV context."',
    ],
    [
      "an old FAQ answer that names neither brand",
      "x.ts",
      'question: "Does Verdant live-sync my AC Infinity or Spider Farmer controller?",\n  answer:\n    "No. Support for those brands is CSV import, included on Free."',
    ],
    [
      "another old FAQ answer that names neither brand",
      "x.ts",
      'question: "Can I mix AC Infinity and Spider Farmer data in one Verdant account?",\n  answer:\n    "Yes. Both import into the same account, one CSV per controller."',
    ],
    [
      "a claim split by inline JSX",
      "x.tsx",
      "<p>Import an <strong>AC Infinity</strong> CSV on Free.</p>",
    ],
  ])("flags %s", (_label, path, source) => {
    expect(unqualifiedAcInfinityImportClaims(path, source).length).toBeGreaterThan(0);
  });
});
