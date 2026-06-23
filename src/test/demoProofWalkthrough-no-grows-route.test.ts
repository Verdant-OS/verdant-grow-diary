/**
 * Docs/static guard: the user-facing Verdant app has no standalone "Grow"
 * page. The Demo Proof Walkthrough must never link operators at `/grows`
 * as the entry point, and docs that describe the demo path must not
 * present `/grows` as a route to navigate.
 *
 * Conceptual prose like "Grow → Tent → Plant → Quick Log" is allowed —
 * only route-shaped references to `/grows` are forbidden.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/demoProofWalkthroughViewModel.ts",
  "src/pages/DemoProofWalkthrough.tsx",
  "src/test/DemoProofWalkthrough.test.tsx",
  "src/test/demoProofWalkthroughViewModel.test.ts",
  "docs/one-tent-loop-rc-smoke-test.md",
  "docs/v0-release-checkpoint.md",
];

const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'href: "/grows"', re: /href\s*:\s*["']\/grows(?:["'/?])/ },
  { name: 'href="/grows"', re: /href\s*=\s*["']\/grows(?:["'/?])/ },
  { name: "(/grows) markdown link", re: /\]\(\s*\/grows(?:[)/?])/ },
  { name: "to=\"/grows\" router link", re: /to\s*=\s*["']\/grows(?:["'/?])/ },
  { name: "navigate('/grows')", re: /navigate\(\s*["']\/grows(?:["'/?])/ },
  // Route-list reference: a bullet/heading naming /grows as the demo path
  { name: "demo walkthrough route bullet", re: /demo\s+(?:walkthrough|path)[^\n]*\/grows/i },
];

describe("Demo walkthrough docs/static guard — no /grows route references", () => {
  for (const f of FILES) {
    const full = resolve(process.cwd(), f);
    if (!existsSync(full)) continue;
    const src = readFileSync(full, "utf8");
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      it(`${f}: must not contain "${name}"`, () => {
        expect(src).not.toMatch(re);
      });
    }
  }

  it("conceptual prose 'Grow → Tent → Plant' is still permitted (not a route)", () => {
    // Sanity: pattern targets only route-shaped /grows. The literal arrow
    // phrase must not be matched by any forbidden pattern.
    const sample = "Grow → Tent → Plant → Quick Log → Timeline";
    for (const { re } of FORBIDDEN_PATTERNS) {
      expect(sample).not.toMatch(re);
    }
  });
});
