/**
 * #1002 — every secret / HMAC comparison goes through timingSafeCompareRules.
 *
 * Source scans are the right tool here: they prove a forbidden construct
 * (a local XOR compare loop) is absent, and that each known call site imports
 * the shared helper. Covers src/lib, every Edge function, and the
 * HAND-MAINTAINED Edge mirror supabase/functions/_shared/ecowittRealIngestAuth.ts.
 * The generated mirror (_shared/lib/**) is excluded: it is checked by
 * verify-edge-shared-in-sync instead.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const HELPER = "src/lib/timingSafeCompareRules.ts";
const GENERATED_MIRROR = "supabase/functions/_shared/lib/";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(rel);
  }
  return out;
}

const SCANNED = [...walk("src/lib"), ...walk("supabase/functions")]
  .map((p) => relative(ROOT, join(ROOT, p)).replaceAll("\\", "/"))
  .filter((p) => p !== HELPER && !p.startsWith(GENERATED_MIRROR))
  .filter((p) => !/(_test|\.test)\.(ts|tsx)$/.test(p));

/** `a.charCodeAt(i) ^ b.charCodeAt(i)`-style hand-rolled compare loops. */
const XOR_COMPARE = /charCodeAt\([^)]*\)[^;\n]*\^[^;\n]*charCodeAt\(/;

const CALL_SITES: Record<string, RegExp> = {
  "src/lib/piIngestAuthRules.ts": /from "@\/lib\/timingSafeCompareRules"/,
  "src/lib/ecowittRealIngestAuth.ts": /from "@\/lib\/timingSafeCompareRules"/,
  "supabase/functions/_shared/ecowittRealIngestAuth.ts":
    /from "\.\/lib\/lib\/timingSafeCompareRules\.ts"/,
  "supabase/functions/paddle-webhook/verifyPaddleSignature.ts":
    /from "\.\.\/_shared\/lib\/lib\/timingSafeCompareRules\.ts"/,
  "supabase/functions/send-transactional-email/contract.ts":
    /from "\.\.\/_shared\/lib\/lib\/timingSafeCompareRules\.ts"/,
  "supabase/functions/preview-transactional-email/index.ts":
    /from "\.\.\/_shared\/lib\/lib\/timingSafeCompareRules\.ts"/,
  "supabase/functions/auth-email-hook/index.ts":
    /from "\.\.\/_shared\/lib\/lib\/timingSafeCompareRules\.ts"/,
  "supabase/functions/edge-metrics-alert-check/index.ts":
    /from "\.\.\/_shared\/lib\/lib\/timingSafeCompareRules\.ts"/,
};

describe("timing-safe compare — call sites", () => {
  it("scans a meaningful set of files, including the hand-maintained EcoWitt mirror", () => {
    expect(SCANNED).toContain("supabase/functions/_shared/ecowittRealIngestAuth.ts");
    expect(SCANNED.length).toBeGreaterThan(100);
  });

  it("no file outside the helper hand-rolls an XOR compare loop", () => {
    const offenders = SCANNED.filter((p) => XOR_COMPARE.test(readFileSync(join(ROOT, p), "utf8")));
    expect(offenders).toEqual([]);
  });

  for (const [file, importRe] of Object.entries(CALL_SITES)) {
    it(`${file} imports the shared helper`, () => {
      expect(readFileSync(join(ROOT, file), "utf8")).toMatch(importRe);
    });
  }

  it("the newer direct secret comparisons are gone", () => {
    const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
    expect(read("supabase/functions/preview-transactional-email/index.ts")).not.toMatch(
      /token !== apiKey/,
    );
    expect(read("supabase/functions/auth-email-hook/index.ts")).not.toMatch(
      /authHeader !== `Bearer \$\{apiKey\}`/,
    );
    expect(read("supabase/functions/edge-metrics-alert-check/index.ts")).not.toMatch(
      /providedCronSecret === cronSecret/,
    );
  });
});
