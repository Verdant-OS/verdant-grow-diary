/**
 * Static-safety tests for the EcoWitt ingest audit proof slice.
 * Guards against writes, AI/model calls, private-field exposure, and
 * forbidden imports.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

const RULES = read("src/lib/ecowittIngestAuditProofRules.ts");
const HOOK = read("src/hooks/useEcowittIngestAuditProofRows.ts");
const PANEL = read("src/components/EcowittIngestAuditProofPanel.tsx");
const ALL = `${RULES}\n${HOOK}\n${PANEL}`;

describe("EcoWitt ingest audit proof — static safety", () => {
  it("contains no Supabase writes anywhere in the slice", () => {
    expect(ALL).not.toMatch(/\.insert\(/);
    expect(ALL).not.toMatch(/\.update\(/);
    expect(ALL).not.toMatch(/\.delete\(/);
    expect(ALL).not.toMatch(/\.upsert\(/);
    expect(ALL).not.toMatch(/functions\.invoke\(/);
  });

  it("hook selects only the safe audit-counts column allowlist", () => {
    const selectMatch = HOOK.match(/\.select\(\s*"([^"]+)"\s*\)/);
    expect(selectMatch).toBeTruthy();
    const cols = (selectMatch?.[1] ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    expect(cols.sort()).toEqual(
      [
        "captured_at",
        "created_at",
        "rows_inserted",
        "rows_received",
        "source",
        "tent_id",
      ].sort(),
    );
  });

  it("hook never selects user_id or bridge_token_id", () => {
    expect(HOOK).not.toMatch(/user_id/);
    expect(HOOK).not.toMatch(/bridge_token_id/);
    expect(HOOK).not.toMatch(/raw_payload/);
  });

  it("rules + panel never reference private identifiers", () => {
    const RP = `${RULES}\n${PANEL}`;
    expect(RP).not.toMatch(/user_id/);
    expect(RP).not.toMatch(/bridge_token_id/);
    expect(RP).not.toMatch(/raw_payload/);
    expect(RP).not.toMatch(/service_role/);
    expect(RP).not.toMatch(/PASSKEY/);
    expect(RP).not.toMatch(/Bearer\s/);
  });

  it("contains no AI/model/provider/Action Queue/device-control surfaces", () => {
    expect(ALL).not.toMatch(/openai|anthropic|model_tier|model:/i);
    expect(ALL).not.toMatch(/action_queue/);
    expect(ALL).not.toMatch(/device_control|relay|actuate/i);
  });

  it("rules file is dependency-light (no Supabase/React imports)", () => {
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/from\s+["']react["']/);
  });

  it("uses 'current proof window' wording, not 'all-time'", () => {
    expect(ALL).toMatch(/current proof window/);
    expect(ALL).not.toMatch(/all[- ]time/i);
    expect(ALL).not.toMatch(/complete proof/i);
  });

  it("does not use disallowed words like 'healthy'/'ideal'/'auto execute'", () => {
    expect(ALL).not.toMatch(/\bhealthy\b/i);
    expect(ALL).not.toMatch(/\bideal\b/i);
    expect(ALL).not.toMatch(/auto[- ]?execute/i);
    expect(ALL).not.toMatch(/actuate/i);
  });
});
