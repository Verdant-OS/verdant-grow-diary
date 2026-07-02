/**
 * One-Tent Demo Docs Safety v1
 *
 * Ensures demo scripts do not use unsafe automation / certainty / device-control
 * phrases outside of an explicit fenced Do-Not-Say block.
 *
 * Scope: docs/one-tent-evidence-chain-demo-script-v1.md (path-scoped).
 * Safety: docs-only, no product code, no writes, no schema.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const BANNED_PHRASES = [
  "AI grows for you",
  "guaranteed yield",
  "fully automated",
  "controls your grow",
  "automatically executes",
  "diagnosed with certainty",
  "fake live",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
] as const;

export const BEGIN_MARKER = "DEMO-SCRIPT-DO-NOT-SAY:BEGIN";
export const END_MARKER = "DEMO-SCRIPT-DO-NOT-SAY:END";

export interface DemoDocsSafetyFailure {
  kind:
    | "banned-outside-fence"
    | "missing-end-marker"
    | "missing-begin-marker"
    | "unbalanced-markers";
  phrase?: string;
  line?: number;
  detail: string;
}

/**
 * Pure scanner. Deterministic. Returns all failures (empty array = pass).
 */
export function scanDemoDocForSafety(text: string): DemoDocsSafetyFailure[] {
  const failures: DemoDocsSafetyFailure[] = [];
  const lines = text.split("\n");

  const beginLines: number[] = [];
  const endLines: number[] = [];
  lines.forEach((line, idx) => {
    if (line.includes(BEGIN_MARKER)) beginLines.push(idx);
    if (line.includes(END_MARKER)) endLines.push(idx);
  });

  if (beginLines.length !== endLines.length) {
    if (beginLines.length > endLines.length) {
      failures.push({
        kind: "missing-end-marker",
        detail: `Found ${beginLines.length} BEGIN marker(s) and ${endLines.length} END marker(s).`,
      });
    } else {
      failures.push({
        kind: "missing-begin-marker",
        detail: `Found ${endLines.length} END marker(s) and ${beginLines.length} BEGIN marker(s).`,
      });
    }
  }

  // Compute fenced ranges from sorted, paired markers (in source order).
  const fenced: Array<[number, number]> = [];
  const pairCount = Math.min(beginLines.length, endLines.length);
  for (let i = 0; i < pairCount; i++) {
    const b = beginLines[i];
    const e = endLines[i];
    if (e <= b) {
      failures.push({
        kind: "unbalanced-markers",
        detail: `END marker on line ${e + 1} precedes or equals BEGIN on line ${b + 1}.`,
      });
      continue;
    }
    fenced.push([b, e]);
  }

  const inFence = (lineIdx: number): boolean => fenced.some(([b, e]) => lineIdx > b && lineIdx < e);

  lines.forEach((line, idx) => {
    if (inFence(idx)) return;
    const lower = line.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) {
        failures.push({
          kind: "banned-outside-fence",
          phrase,
          line: idx + 1,
          detail: `Banned phrase "${phrase}" found outside Do-Not-Say block at line ${idx + 1}.`,
        });
      }
    }
  });

  return failures;
}

const DOCS_DIR = resolve(process.cwd(), "docs");

/**
 * Deterministically discover demo script docs matching `docs/*demo-script*.md`.
 * Files only, sorted lexicographically.
 */
export function discoverDemoScriptDocs(): string[] {
  const entries = readdirSync(DOCS_DIR);
  return entries
    .filter((name) => /demo-script.*\.md$/i.test(name))
    .filter((name) => {
      try {
        return statSync(resolve(DOCS_DIR, name)).isFile();
      } catch {
        return false;
      }
    })
    .map((name) => resolve(DOCS_DIR, name))
    .sort((a, b) => a.localeCompare(b));
}

describe("One-Tent demo docs safety v1", () => {
  it("discovers at least one docs/*demo-script*.md file", () => {
    const paths = discoverDemoScriptDocs();
    expect(paths.length).toBeGreaterThan(0);
  });

  it("includes the One-Tent Evidence Chain demo script", () => {
    const paths = discoverDemoScriptDocs();
    expect(paths.some((p) => p.endsWith("one-tent-evidence-chain-demo-script-v1.md"))).toBe(true);
  });

  it("discovered paths are sorted deterministically", () => {
    const paths = discoverDemoScriptDocs();
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sorted);
  });

  it("every discovered demo script passes the safety scan", () => {
    const paths = discoverDemoScriptDocs();
    expect(paths.length).toBeGreaterThan(0);
    const aggregate: Array<{ file: string; failures: DemoDocsSafetyFailure[] }> = [];
    for (const p of paths) {
      const text = readFileSync(p, "utf8");
      const failures = scanDemoDocForSafety(text);
      if (failures.length > 0) aggregate.push({ file: p, failures });
    }
    expect(aggregate).toEqual([]);
  });

  it("aggregate check fails if any discovered doc has a banned phrase outside the fence", () => {
    // Simulate the aggregate by scanning a synthetic doc set including a bad entry.
    const docs = [
      "# Clean\nVerdant preserves source-labeled evidence.\n",
      "# Bad\nVerdant is fully automated.\n",
    ];
    const anyFailed = docs.some((text) => scanDemoDocForSafety(text).length > 0);
    expect(anyFailed).toBe(true);
  });

  it("flags a banned phrase that appears outside the fence", () => {
    const sample = [
      "# Sample",
      "Verdant is fully automated and grows for you.",
      "<!-- DEMO-SCRIPT-DO-NOT-SAY:BEGIN -->",
      '- "AI grows for you"',
      "<!-- DEMO-SCRIPT-DO-NOT-SAY:END -->",
    ].join("\n");
    const failures = scanDemoDocForSafety(sample);
    expect(failures.some((f) => f.kind === "banned-outside-fence")).toBe(true);
    expect(failures.find((f) => f.kind === "banned-outside-fence")?.phrase).toBe("fully automated");
  });

  it("fails when BEGIN marker exists without END marker", () => {
    const sample = [
      "# Sample",
      "<!-- DEMO-SCRIPT-DO-NOT-SAY:BEGIN -->",
      '- "guaranteed yield"',
    ].join("\n");
    const failures = scanDemoDocForSafety(sample);
    expect(failures.some((f) => f.kind === "missing-end-marker")).toBe(true);
  });

  it("fails when END marker exists without BEGIN marker", () => {
    const sample = ["# Sample", '- "guaranteed yield"', "<!-- DEMO-SCRIPT-DO-NOT-SAY:END -->"].join(
      "\n",
    );
    const failures = scanDemoDocForSafety(sample);
    expect(failures.some((f) => f.kind === "missing-begin-marker")).toBe(true);
  });

  it("passes when there are no banned phrases and no markers", () => {
    const sample = [
      "# Clean Demo",
      "Verdant preserves source-labeled evidence. The grower decides.",
    ].join("\n");
    expect(scanDemoDocForSafety(sample)).toEqual([]);
  });

  it("phrase matching is case-insensitive", () => {
    const sample = "Verdant is FULLY AUTOMATED today.";
    const failures = scanDemoDocForSafety(sample);
    expect(failures.some((f) => f.phrase === "fully automated")).toBe(true);
  });
});
