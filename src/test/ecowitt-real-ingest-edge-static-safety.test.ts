/**
 * Static safety scan — EcoWitt Real Ingest Edge `_shared` mirror modules.
 *
 * Phase 1.6 only mirrors logic. _shared files must not import Supabase,
 * make network calls, write to DB, expose secrets/tokens, or reference
 * device-control / alerts / action_queue / AI surfaces.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

const TARGET_PATHS = [
  "supabase/functions/_shared/ecowittRealIngestTypes.ts",
  "supabase/functions/_shared/ecowittRealIngestValidator.ts",
  "supabase/functions/_shared/ecowittRealIngestRedaction.ts",
  "supabase/functions/_shared/ecowittRealIngestDedupe.ts",
  "supabase/functions/_shared/ecowittRealIngestAuth.ts",
  "supabase/functions/_shared/ecowittRealIngestEndpoint.ts",
] as const;

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const sources = TARGET_PATHS.map((p) => ({
  path: p,
  src: stripComments(readFileSync(resolve(ROOT, p), "utf8")),
}));

describe("ecowitt-real-ingest — Phase 1.6 _shared static safety", () => {
  it.each(sources)("[$path] does not reference service_role", ({ src }) => {
    expect(src).not.toMatch(/service_role/);
  });

  it.each(sources)("[$path] does not embed bridge token literals", ({ src }) => {
    expect(src).not.toMatch(/ECOWITT_BRIDGE_TOKEN\s*=/);
    expect(src).not.toMatch(/bridge[_\s-]?token\s*=\s*["']/i);
  });

  it.each(sources)("[$path] does not import Supabase or use supabase.from", ({ src }) => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
    expect(src).not.toMatch(/from\s+["']npm:@supabase/);
    expect(src).not.toMatch(/supabase\.from\(/);
  });

  it.each(sources)("[$path] does not use DB write helpers", ({ src }) => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it.each(sources)(
    "[$path] does not call functions.invoke, fetch, or axios",
    ({ src }) => {
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/\baxios\b/);
    },
  );

  it.each(sources)(
    "[$path] does not touch localStorage or sessionStorage",
    ({ src }) => {
      expect(src).not.toMatch(/\blocalStorage\b/);
      expect(src).not.toMatch(/\bsessionStorage\b/);
    },
  );

  it.each(sources)(
    "[$path] does not reference action_queue or alerts write paths",
    ({ src }) => {
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
    },
  );

  it.each(sources)(
    "[$path] does not embed device-control words",
    ({ src }) => {
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
        /["']\s*set\s+(fan|light|pump|heater)/i,
        /["']\s*dose\s+\d/i,
        /["']\s*irrigate\s+now/i,
      ];
      for (const rx of banned) expect(src).not.toMatch(rx);
    },
  );

  it.each(sources)("[$path] does not reference AI/model call surfaces", ({ src }) => {
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/gemini/i);
    expect(src).not.toMatch(/LOVABLE_API_KEY/);
    expect(src).not.toMatch(/ai\.gateway/i);
  });

  it.each(sources)("[$path] does not read Deno.env (Phase 1.6 stays pure)", ({ src }) => {
    expect(src).not.toMatch(/Deno\.env/);
  });
});
