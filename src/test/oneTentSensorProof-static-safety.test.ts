/**
 * Static-safety tests for the One-Tent Sensor Proof integration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

const VM = read("src/lib/oneTentSensorProofViewModel.ts");
const SECTION = read("src/components/OneTentSensorProofSection.tsx");
const PAGE = read("src/pages/OneTentLiveProof.tsx");
const ALL = `${VM}\n${SECTION}\n${PAGE}`;

describe("One-Tent Sensor Proof — static safety", () => {
  it("integration slice contains no Supabase writes", () => {
    const SLICE = `${VM}\n${SECTION}`;
    expect(SLICE).not.toMatch(/\.insert\(/);
    expect(SLICE).not.toMatch(/\.update\(/);
    expect(SLICE).not.toMatch(/\.delete\(/);
    expect(SLICE).not.toMatch(/\.upsert\(/);
    expect(SLICE).not.toMatch(/functions\.invoke\(/);
  });

  it("pure view model is dependency-light (no Supabase/React)", () => {
    expect(VM).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(VM).not.toMatch(/from\s+["']react["']/);
  });

  it("never exposes private identifiers, secrets, or raw payloads", () => {
    const SLICE = `${VM}\n${SECTION}`;
    expect(SLICE).not.toMatch(/raw_payload/);
    expect(SLICE).not.toMatch(/service_role/);
    expect(SLICE).not.toMatch(/PASSKEY/);
    expect(SLICE).not.toMatch(/Bearer\s/);
    expect(SLICE).not.toMatch(/bridge_token_id/);
  });

  it("contains no AI/model/Action Queue/device-control surfaces", () => {
    expect(ALL).not.toMatch(/openai|anthropic|model_tier/i);
    expect(ALL).not.toMatch(/device_control|actuate|relay/i);
  });

  it("uses 'current proof window' wording, not 'all-time'", () => {
    const SLICE = `${VM}\n${SECTION}`;
    expect(SLICE).toMatch(/current proof window|last 24 hours/);
    expect(SLICE).not.toMatch(/all[- ]time/i);
    expect(SLICE).not.toMatch(/forever/i);
    expect(SLICE).not.toMatch(/complete proof/i);
  });

  it("does not use disallowed positive words like 'healthy'/'ideal'/'auto execute'", () => {
    const SLICE = `${VM}\n${SECTION}`;
    expect(SLICE).not.toMatch(/\bhealthy\b/i);
    expect(SLICE).not.toMatch(/\bideal\b/i);
    expect(SLICE).not.toMatch(/auto[- ]?execute/i);
  });

  it("operator shortcut preserves operator=1", () => {
    expect(VM).toMatch(/\/sensors\?operator=1/);
  });

  it("page wires the sensor proof section and report markdown", () => {
    expect(PAGE).toMatch(/OneTentSensorProofSection/);
    expect(PAGE).toMatch(/buildOneTentSensorProofViewModel/);
    expect(PAGE).toMatch(/buildOneTentSensorProofReportSection/);
  });
});
