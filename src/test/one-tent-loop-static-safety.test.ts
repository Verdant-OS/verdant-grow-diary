import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/oneTentLoopNavigationRules.ts",
  "src/components/OneTentLoopNextStepCard.tsx",
];

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/** Strip comments + string literals so safety scans see real code only. */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

describe("one-tent-loop static safety", () => {
  it("the helper module has no runtime supabase / fetch / AI / device imports", () => {
    const src = stripCommentsAndStrings(read("src/lib/oneTentLoopNavigationRules.ts"));
    expect(src).not.toMatch(/from\s+["'][^"']*supabase/i);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/openai|anthropic|gemini|lovable-ai/i);
    expect(src).not.toMatch(/relay|actuator|switchbot/i);
    expect(src).not.toMatch(/auto[-_ ]?run|auto[-_ ]?execute/i);
  });

  it("the next-step card does not introduce AI / device / auto-execute paths", () => {
    const src = stripCommentsAndStrings(read("src/components/OneTentLoopNextStepCard.tsx"));
    expect(src).not.toMatch(/from\s+["'][^"']*supabase/i);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/openai|anthropic|gemini|lovable-ai/i);
    expect(src).not.toMatch(/relay|actuator|switchbot/i);
    expect(src).not.toMatch(/auto[-_ ]?run|auto[-_ ]?execute/i);
  });

  it("Action Queue wording stays approval-required", () => {
    const src = read("src/lib/oneTentLoopNavigationRules.ts");
    expect(src).toMatch(/approval-required/i);
  });

  it("no fake-live-data wording is introduced", () => {
    for (const f of FILES) {
      const src = read(f).toLowerCase();
      expect(src).not.toMatch(/fake[- ]?live/);
      expect(src).not.toMatch(/synth(et)?ic live/);
    }
  });

  it("does not call missing/stale/invalid telemetry healthy", () => {
    for (const f of FILES) {
      const src = stripCommentsAndStrings(read(f)).toLowerCase();
      expect(src).not.toMatch(/healthy/);
    }
  });

  it("preserves the six canonical sensor source labels in the rules module", () => {
    const src = read("src/lib/oneTentLoopNavigationRules.ts");
    for (const label of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(src).toContain(`"${label}"`);
    }
  });
});
