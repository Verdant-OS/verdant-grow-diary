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
const SENTINEL_PAGE_PATH = "src/pages/OperatorGgsRealPayloadIngest.tsx";
const SENTINEL_PANEL_PATH = "src/components/GgsSentinelSmokeRunnerPanel.tsx";
const SENTINEL_RULES_PATH = "src/lib/ggsSentinelSmokeRunner.ts";
const SENTINEL_VM_PATH = "src/lib/ggsSentinelSmokeRunnerViewModel.ts";

/**
 * Static safety guards for the operator GGS real-payload ingest surface.
 *
 * Asserts the panel + page source code:
 *   - never renders raw_payload bodies
 *   - never emits `ggs_live` / `ggs_csv` source values
 *   - never imports AI / Action Queue / alert / device control modules
 *   - routes writes only through `pi_ingest_commit_batch` (no direct
 *     `.from("sensor_readings").insert(...)`)
 *   - requires the operator role check before rendering the panel
 *   - attestation checkbox is wired before commit
 */
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

// Strip /** ... */ block comments so safety regexes don't match documentation
// that intentionally references the forbidden patterns.
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

const SENTINEL_PAGE = read(SENTINEL_PAGE_PATH);
const SENTINEL_PANEL = read(SENTINEL_PANEL_PATH);
const SENTINEL_RULES = read(SENTINEL_RULES_PATH);
const SENTINEL_VM = read(SENTINEL_VM_PATH);

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

const FORBIDDEN_AI_TOKENS = ["@/lib/ai/", "ai-doctor-review", "ai-coach", "openai", "anthropic"];

const REAL_PAYLOAD_PANEL = stripBlockComments(read("src/components/GgsRealPayloadIngestPanel.tsx"));
const REAL_PAYLOAD_PAGE = stripBlockComments(read("src/pages/OperatorGgsRealPayloadIngest.tsx"));
const REAL_PAYLOAD_COMMIT = stripBlockComments(read("src/lib/ggsRealPayloadCommit.ts"));
const REAL_PAYLOAD_VM = stripBlockComments(read("src/lib/ggsRealPayloadIngestViewModel.ts"));

describe("static safety — GGS Sentinel page", () => {
  for (const term of FORBIDDEN_WRITE_TOKENS) {
    it(`page does not reference \`${term}\``, () => {
      expect(SENTINEL_PAGE).not.toContain(term);
    });
  }
  for (const term of FORBIDDEN_AI_TOKENS) {
    it(`page does not reference AI surface \`${term}\``, () => {
      expect(SENTINEL_PAGE).not.toContain(term);
    });
  }
  it("page does not import raw_payload from anywhere", () => {
    expect(SENTINEL_PAGE).not.toMatch(/raw_payload/);
  });
  it("page does not publish or broadcast", () => {
    expect(SENTINEL_PAGE).not.toMatch(/\b(publish|broadcast|emit|dispatch)\s*\(/);
  });
});

describe("static safety — GgsSentinelSmokeRunnerPanel.tsx", () => {
  for (const term of [...FORBIDDEN_WRITE_TOKENS, ...FORBIDDEN_AI_TOKENS]) {
    it(`panel does not reference \`${term}\``, () => {
      expect(SENTINEL_PANEL).not.toContain(term);
    });
  }
  it("panel does not import Supabase client", () => {
    expect(SENTINEL_PANEL).not.toMatch(/@\/integrations\/supabase\/client/);
  });
  it("panel does not render raw_payload", () => {
    expect(SENTINEL_PANEL).not.toMatch(/raw_payload/i);
  });
});

describe("static safety — pure modules stay pure", () => {
  it("rules module does not import React or Supabase", () => {
    expect(SENTINEL_RULES).not.toMatch(/from\s+["']react["']/);
    expect(SENTINEL_RULES).not.toMatch(/@\/integrations\/supabase\/client/);
  });
  it("view-model module does not import React or Supabase", () => {
    expect(SENTINEL_VM).not.toMatch(/from\s+["']react["']/);
    expect(SENTINEL_VM).not.toMatch(/@\/integrations\/supabase\/client/);
  });
  it("rules module exports no command/control symbols", () => {
    expect(SENTINEL_RULES).not.toMatch(
      /export\s+(function|const)\s+\w*(command|control|setpoint|write|publish)/i,
    );
  });
});

describe("evaluator priority unchanged — explanatory note pinned verbatim", () => {
  it("view-model exports the exact explanatory note string", () => {
    expect(SENTINEL_VM).toContain(
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
      expect(SENTINEL_RULES).toContain(code);
    }
  });
});

describe("operator GGS real-payload ingest — static safety", () => {
  it("panel never renders raw_payload body fields", () => {
    expect(REAL_PAYLOAD_PANEL).not.toMatch(/raw_payload\.payload/);
    expect(REAL_PAYLOAD_PANEL).not.toMatch(/JSON\.stringify\(.*raw_payload/);
    expect(REAL_PAYLOAD_PANEL).not.toMatch(/preview\.payload/);
  });

  it("nothing emits ggs_live or ggs_csv source values", () => {
    for (const src of [
      REAL_PAYLOAD_PANEL,
      REAL_PAYLOAD_PAGE,
      REAL_PAYLOAD_COMMIT,
      REAL_PAYLOAD_VM,
    ]) {
      expect(src).not.toMatch(/"ggs_live"/);
      expect(src).not.toMatch(/"ggs_csv"/);
    }
  });

  it("commit wrapper only calls pi_ingest_commit_batch, not direct sensor_readings inserts", () => {
    expect(REAL_PAYLOAD_COMMIT).toMatch(/pi_ingest_commit_batch/);
    expect(REAL_PAYLOAD_COMMIT).not.toMatch(/\.from\(\s*["']sensor_readings["']\s*\)/);
  });

  it("panel does not import AI / alerts / Action Queue / device control modules", () => {
    const forbidden = [
      "ai-doctor",
      "aiDoctor",
      "ActionQueue",
      "action-queue",
      "alerts/",
      "deviceControl",
      "device-control",
    ];
    for (const f of forbidden) {
      expect(REAL_PAYLOAD_PANEL.includes(f), `panel must not import ${f}`).toBe(false);
      expect(REAL_PAYLOAD_PAGE.includes(f), `page must not import ${f}`).toBe(false);
    }
  });

  it("page gates panel rendering on operator role status", () => {
    expect(REAL_PAYLOAD_PAGE).toMatch(/Operator access required/);
    expect(REAL_PAYLOAD_PAGE).toMatch(/role\.status\s*===\s*["']denied["']/);
    expect(REAL_PAYLOAD_PAGE).toMatch(/role\.status\s*===\s*["']unauthenticated["']/);
    expect(REAL_PAYLOAD_PAGE).toMatch(/role\.status\s*===\s*["']granted["']/);
  });

  it("panel disables commit unless attestation is checked", () => {
    expect(REAL_PAYLOAD_PANEL).toMatch(/attested/);
    // Button is disabled unless vm.canCommit is true.
    expect(REAL_PAYLOAD_PANEL).toMatch(/disabled=\{[^}]*canCommit/);
  });

  it("panel goes through the commitGgsRealPayload helper, never raw RPC", () => {
    expect(REAL_PAYLOAD_PANEL).toMatch(/commitGgsRealPayload/);
    expect(REAL_PAYLOAD_PANEL).not.toMatch(/rpc\(\s*["']pi_ingest_commit_batch["']/);
  });
});
