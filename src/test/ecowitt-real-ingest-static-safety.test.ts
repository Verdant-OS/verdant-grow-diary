/**
 * Static safety scan — EcoWitt Real Ingest Phase 0 module surface.
 *
 * Phase 0 is server-contract + pure validator only. These files must not
 * import Supabase, perform I/O, call models, write to action_queue or
 * alerts tables, touch device-control surfaces, or reference any secret.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

const TARGET_PATHS = [
  "src/lib/ecowittRealIngestTypes.ts",
  "src/lib/ecowittRealIngestValidator.ts",
  "src/lib/ecowittRealIngestRedaction.ts",
  "src/lib/ecowittRealIngestDedupe.ts",
] as const;

function stripComments(src: string): string {
  // Strip block + line comments so doc text mentioning forbidden patterns
  // cannot trip the scan.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const sources = TARGET_PATHS.map((p) => ({
  path: p,
  src: stripComments(readFileSync(resolve(ROOT, p), "utf8")),
}));

describe("ecowitt-real-ingest — Phase 0 static safety", () => {
  it.each(sources)("[$path] does not reference service_role", ({ src }) => {
    expect(src).not.toMatch(/service_role/);
  });

  it.each(sources)("[$path] does not embed bridge token literals", ({ src }) => {
    expect(src).not.toMatch(/bridge[_\s-]?token/i);
  });

  it.each(sources)("[$path] does not import Supabase or use supabase.from", ({ src }) => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
    expect(src).not.toMatch(/supabase\.from\(/);
  });

  it.each(sources)("[$path] does not use DB write helpers", ({ src }) => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it.each(sources)("[$path] does not call functions.invoke, fetch, or axios", ({ src }) => {
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\baxios\b/);
  });

  it.each(sources)("[$path] does not touch localStorage or sessionStorage", ({ src }) => {
    expect(src).not.toMatch(/\blocalStorage\b/);
    expect(src).not.toMatch(/\bsessionStorage\b/);
  });

  it.each(sources)(
    "[$path] does not reference action_queue or alerts write paths",
    ({ src }) => {
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
    },
  );

  it.each(sources)(
    "[$path] does not embed device-control words in code identifiers/strings",
    ({ src }) => {
      // We allow neutral comments (stripped above) and metric names like
      // co2_ppm/ppfd. Block device-control words used as identifiers or
      // plain-string commands.
      const banned = [
        /\bfan\b/i,
        /\blight\b/i,
        /\bpump\b/i,
        /\bhumidifier\b/i,
        /\bdehumidifier\b/i,
        /\bheater\b/i,
      ];
      for (const rx of banned) expect(src).not.toMatch(rx);
    },
  );

  it.each(sources)(
    "[$path] does not embed executable command language",
    ({ src }) => {
      const banned = [
        /["']\s*turn\s+(on|off)\b/i,
        /["']\s*power\s+(on|off)\b/i,
        /["']\s*set\s+(fan|light|pump|heater)/i,
        /["']\s*dose\s+\d/i,
        /["']\s*irrigate\s+now/i,
      ];
      for (const rx of banned) expect(src).not.toMatch(rx);
    },
  );

  it("validator source does not call Date.now() directly", () => {
    const validatorSrc = sources.find(
      (s) => s.path === "src/lib/ecowittRealIngestValidator.ts",
    )!.src;
    expect(validatorSrc).not.toMatch(/\bDate\.now\s*\(/);
  });
});
