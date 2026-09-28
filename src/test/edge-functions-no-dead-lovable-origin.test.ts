/**
 * No edge function may reference the retired published Lovable host.
 *
 * QA 2026-09-24 (#1683): https://verdantgrowdiary-com.lovable.app now answers
 * HTTP 404 "No Lovable project found at this address." Production is
 * https://verdantgrowdiary.com. The dead host lingered in two CORS
 * allow-lists (sensor-ingest-webhook, operator-ggs-real-payload-commit) and
 * in auth-email-hook's preview sample URL.
 *
 * @source-scan-justified: this proves a string is ABSENT from Deno sources
 * that vitest cannot import (npm:/Deno APIs); the allow-lists' resolved
 * behaviour is asserted by the functions' own Deno CORS tests.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FUNCTIONS_DIR = path.resolve(__dirname, "../../supabase/functions");
const DEAD_HOST = "verdantgrowdiary-com.lovable.app";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("edge functions and the retired Lovable host", () => {
  it("no edge function source names the dead published host", () => {
    const offenders = sourceFiles(FUNCTIONS_DIR)
      .filter((file) => fs.readFileSync(file, "utf8").includes(DEAD_HOST))
      .map((file) => path.relative(FUNCTIONS_DIR, file));
    expect(offenders).toEqual([]);
  });

  it("the CORS allow-lists still carry the canonical site", () => {
    for (const rel of [
      "sensor-ingest-webhook/index.ts",
      "operator-ggs-real-payload-commit/handler.ts",
    ]) {
      const src = fs.readFileSync(path.join(FUNCTIONS_DIR, rel), "utf8");
      expect(src, rel).toContain('"https://verdantgrowdiary.com"');
      expect(src, rel).toContain('"https://www.verdantgrowdiary.com"');
    }
  });
});
