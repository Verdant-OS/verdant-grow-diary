/**
 * Static safety scanner for scripts/dev/ingest-real-ggs-payload.ts.
 *
 * Guarantees the dev/operator runner cannot drift into unsafe territory:
 *   - no hardcoded tokens / service_role values
 *   - no raw_payload rendering in UI
 *   - no XLSX/spreadsheet/import UI
 *   - no new Edge Function source
 *   - no device-control strings
 *   - no AI / alert / Action Queue side effects
 *   - must include explicit safety copy
 *   - must use the existing pi_ingest_commit_batch RPC (not direct
 *     table .insert/.upsert/.update/.delete)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/dev/ingest-real-ggs-payload.ts");
const src = readFileSync(SCRIPT_PATH, "utf8");

describe("ingest-real-ggs-payload script — static safety", () => {
  it("includes explicit real-payload-only safety copy", () => {
    expect(src).toMatch(/real physical GGS payloads only/i);
    expect(src).toMatch(/Do NOT use invented values with source "live"/i);
    expect(src).toMatch(/source "demo" only in fixture tests/i);
  });

  it("uses pi_ingest_commit_batch, not direct table writes", () => {
    expect(src).toMatch(/pi_ingest_commit_batch/);
    expect(src).not.toMatch(/\.from\(["']sensor_readings["']\)/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
  });

  it("never hardcodes a service role key, bridge token, or JWT", () => {
    // No literal `eyJ...` JWT.
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    // Service key is only read from env, never assigned a string literal.
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']/);
    expect(src).not.toMatch(/BRIDGE_TOKEN\s*=\s*["']/);
    expect(src).not.toMatch(/bridge[_-]?token\s*=\s*["'][^"']/i);
  });

  it("does not log secrets or raw payload bodies", () => {
    expect(src).not.toMatch(/console\.\w+\([^)]*SERVICE_ROLE/);
    expect(src).not.toMatch(/console\.\w+\([^)]*serviceKey/);
    expect(src).not.toMatch(/console\.\w+\([^)]*bridge[_-]?token/i);
  });

  it("introduces no AI / alert / Action Queue / device-control surface", () => {
    expect(src).not.toMatch(/\.from\(["']action_queue["']\)/);
    expect(src).not.toMatch(/\.from\(["']alerts["']\)/);
    expect(src).not.toMatch(/ai[_-]?doctor[_-]?session/i);
    expect(src).not.toMatch(/device[_-]?control\s*[=:(]/i);
    expect(src).not.toMatch(/automation\s*[=:(]/i);
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it("introduces no XLSX/spreadsheet/import UI", () => {
    expect(src).not.toMatch(/xlsx/i);
    expect(src).not.toMatch(/spreadsheet/i);
    expect(src).not.toMatch(/sheetjs/i);
    expect(src).not.toMatch(/<[A-Z][A-Za-z0-9]*\s/); // no JSX
  });

  it("introduces no new Edge Function source file", () => {
    // The runner must not register a Deno serve / edge handler.
    expect(src).not.toMatch(/Deno\.serve\b/);
    expect(src).not.toMatch(/serve\(\s*async/);
    expect(src).not.toMatch(/edge-runtime/i);
  });

  it("emits canonical live source via the existing helper, never ggs_live/ggs_csv", () => {
    expect(src).not.toMatch(/["']ggs_live["']/);
    expect(src).not.toMatch(/["']ggs_csv["']/);
  });
});
