/**
 * Static guardrail: any full-suite Vitest baseline claim in docs must
 * either match the current checkpoint baseline or be clearly labeled as
 * a historical snapshot with a pointer to the checkpoint doc.
 *
 * Docs/test-assertion only — no product behavior asserted here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CHECKPOINT_DOC = "docs/v0-release-checkpoint.md";
const CURRENT_BASELINE = "3010";

// Counts that were ever pinned as a full-suite baseline at some point.
const KNOWN_HISTORICAL = ["1886", "2878", "2932", "2933", "2944", "2972", "2981", "2982"];

const SCAN_DIRS = ["docs"];

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));

describe("stale baseline claims · docs", () => {
  it("checkpoint doc pins the current baseline", () => {
    const text = readFileSync(resolve(ROOT, CHECKPOINT_DOC), "utf8");
    const re = new RegExp(`${CURRENT_BASELINE}\\s*/\\s*${CURRENT_BASELINE}`);
    expect(text).toMatch(re);
  });

  it.each(files.map((f) => [f]))(
    "%s — any pinned NNNN/NNNN baseline claim is current or labeled historical",
    (file) => {
      const text = readFileSync(file, "utf8");
      const matches = [...text.matchAll(/\b(\d{4,5})\s*\/\s*\1\b/g)];
      for (const m of matches) {
        const n = m[1];
        if (n === CURRENT_BASELINE) continue;
        if (!KNOWN_HISTORICAL.includes(n)) continue; // unrelated NNNN/NNNN
        // Must be labeled historical AND link to the checkpoint doc.
        expect(text.toLowerCase()).toMatch(/historical/);
        expect(text).toContain("v0-release-checkpoint.md");
      }
    },
  );
});
