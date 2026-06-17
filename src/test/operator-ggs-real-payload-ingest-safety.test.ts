import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static safety scan for the GGS Sentinel page + panel.
 *
 * These tests guard the AGENTS.md "Hard Safety Rules" for this slice:
 *   - No writes, no rpc, no functions.invoke, no Action Queue mutation,
 *     no AI imports, no device control, no raw_payload rendering,
 *     no MQTT publishing, no ggs_live/ggs_csv test-data labels.
 */
const PAGE_PATH = "src/pages/OperatorGgsRealPayloadIngest.tsx";
const PANEL_PATH = "src/components/GgsSentinelSmokeRunnerPanel.tsx";
const RULES_PATH = "src/lib/ggsSentinelSmokeRunner.ts";
const VM_PATH = "src/lib/ggsSentinelSmokeRunnerViewModel.ts";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PAGE = read(PAGE_PATH);
const PANEL = read(PANEL_PATH);
const RULES = read(RULES_PATH);
const VM = read(VM_PATH);

const FORBIDDEN_WRITE_TOKENS = [
  ".insert(",
  ".update(",
  ".delete(",
  ".upsert(",
  ".rpc(",
  "functions.invoke",
  "service_role",
  "action_queue",
  "alerts.insert",
  "mqtt.connect",
  "publish(",
  "device_command",
  "setpoint",
  "ggs_live",
  "ggs_csv",
];

const FORBIDDEN_AI_TOKENS = [
  "@/lib/ai/",
  "ai-doctor-review",
  "ai-coach",
  "openai",
  "anthropic",
];

describe("static safety — GGS Sentinel page", () => {
  for (const term of FORBIDDEN_WRITE_TOKENS) {
    it(`page does not reference \`${term}\``, () => {
      expect(PAGE).not.toContain(term);
    });
  }
  for (const term of FORBIDDEN_AI_TOKENS) {
    it(`page does not reference AI surface \`${term}\``, () => {
      expect(PAGE).not.toContain(term);
    });
  }
  it("page does not import raw_payload from anywhere", () => {
    expect(PAGE).not.toMatch(/raw_payload/);
  });
  it("page does not publish or broadcast", () => {
    expect(PAGE).not.toMatch(/\b(publish|broadcast|emit|dispatch)\s*\(/);
  });
});

describe("static safety — GgsSentinelSmokeRunnerPanel.tsx", () => {
  for (const term of [...FORBIDDEN_WRITE_TOKENS, ...FORBIDDEN_AI_TOKENS]) {
    it(`panel does not reference \`${term}\``, () => {
      expect(PANEL).not.toContain(term);
    });
  }
  it("panel does not import Supabase client", () => {
    expect(PANEL).not.toMatch(/@\/integrations\/supabase\/client/);
  });
  it("panel does not render raw_payload", () => {
    expect(PANEL).not.toMatch(/raw_payload/i);
  });
});

describe("static safety — pure modules stay pure", () => {
  it("rules module does not import React or Supabase", () => {
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/@\/integrations\/supabase\/client/);
  });
  it("view-model module does not import React or Supabase", () => {
    expect(VM).not.toMatch(/from\s+["']react["']/);
    expect(VM).not.toMatch(/@\/integrations\/supabase\/client/);
  });
  it("rules module exports no command/control symbols", () => {
    expect(RULES).not.toMatch(/export\s+(function|const)\s+\w*(command|control|setpoint|write|publish)/i);
  });
});

describe("evaluator priority unchanged — explanatory note pinned verbatim", () => {
  it("view-model exports the exact explanatory note string", () => {
    expect(VM).toContain(
      "Freshness guidance does not change Sentinel result priority. It only explains why each metric is fresh, aging, stale, or missing.",
    );
  });
  it("rules module's verdict ladder includes all and only the 9 documented states", () => {
    const expected = [
      "PASS_LIVE_SENTINEL_READY",
      "BLOCKED_NO_GGS_ROWS",
      "BLOCKED_NO_SOIL_TEMP_C",
      "BLOCKED_NO_EC",
      "BLOCKED_VENDOR_PROVENANCE_MISSING",
      "BLOCKED_SOURCE_NOT_CANONICAL",
      "BLOCKED_STALE_READING",
      "BLOCKED_VALIDATION_ERROR",
      "BLOCKED_RAW_PAYLOAD_RENDER_RISK",
    ];
    for (const code of expected) {
      expect(RULES).toContain(code);
    }
  });
});
