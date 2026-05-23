/**
 * Static guardrails for the manual pi-ingest deployed smoke workflow.
 *
 * The workflow must be MANUAL-ONLY (workflow_dispatch), never run on push/PR/schedule,
 * must execute only the smoke test file, must reference the documented secrets via
 * `${{ secrets.* }}` (no hardcoded values), and must not deploy or modify functions.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const WF_PATH = resolve(ROOT, ".github/workflows/pi-ingest-smoke.yml");
const SMOKE_PATH = "supabase/functions/pi-ingest-readings/smoke.test.ts";

describe("pi-ingest smoke workflow — static guardrails", () => {
  it("workflow file exists", () => {
    expect(existsSync(WF_PATH)).toBe(true);
  });

  const yml = existsSync(WF_PATH) ? readFileSync(WF_PATH, "utf8") : "";

  it("uses workflow_dispatch trigger", () => {
    expect(yml).toMatch(/^on:\s*\n\s*workflow_dispatch:\s*$/m);
  });

  it("does not trigger on push", () => {
    expect(yml).not.toMatch(/^\s*push:/m);
  });

  it("does not trigger on pull_request", () => {
    expect(yml).not.toMatch(/pull_request/);
  });

  it("does not trigger on schedule", () => {
    expect(yml).not.toMatch(/schedule:/);
  });

  it("runs only the smoke test file", () => {
    expect(yml).toMatch(/supabase\/functions\/pi-ingest-readings\/smoke\.test\.ts/);
    // Exactly one `deno test` invocation in the workflow.
    const denoTestLines = yml.match(/deno test[^\n]*/g) ?? [];
    expect(denoTestLines.length).toBe(1);
    // No reference to other Edge Function paths.
    expect(yml).not.toMatch(/supabase\/functions\/(?!pi-ingest-readings\/smoke\.test\.ts|pi-ingest-readings\b\s*$)/m);
  });


  it("references all required secrets via secrets.* expressions", () => {
    for (const name of [
      "PI_INGEST_SMOKE_FUNCTION_URL",
      "PI_INGEST_SMOKE_BRIDGE_ID",
      "PI_INGEST_SMOKE_BRIDGE_SECRET",
      "PI_INGEST_SMOKE_TENT_ID",
    ]) {
      const re = new RegExp(
        `${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`,
      );
      expect(yml).toMatch(re);
    }
  });

  it("does not hardcode any obvious secret material", () => {
    // No raw hex >= 32 chars, no inline URLs to supabase.co, no Bearer tokens.
    expect(yml).not.toMatch(/[A-Fa-f0-9]{32,}/);
    expect(yml).not.toMatch(/https?:\/\/[^\s${]*supabase\.co/);
    expect(yml).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("does not embed production-looking bridge/tent identifiers", () => {
    expect(yml).not.toMatch(/bridge[_-]?id\s*[:=]\s*["'][^"'$]+/i);
    expect(yml).not.toMatch(/tent[_-]?id\s*[:=]\s*["'][^"'$]+/i);
    expect(yml).not.toMatch(/\bprod(uction)?\b/i);
  });

  it("does not deploy or modify edge functions", () => {
    expect(yml).not.toMatch(/supabase\s+functions\s+deploy/);
    expect(yml).not.toMatch(/functions\s+delete/);
    expect(yml).not.toMatch(/db\s+(push|reset)/);
  });

  it("does not echo secrets", () => {
    expect(yml).not.toMatch(/echo[^\n]*secrets\./i);
    expect(yml).not.toMatch(/printenv[^\n]*PI_INGEST_SMOKE/);
  });

  it("smoke test file referenced by workflow exists", () => {
    expect(existsSync(resolve(ROOT, SMOKE_PATH))).toBe(true);
  });
});
