import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import * as adapterModule from "@/lib/ecowittMqttSensorAdapter";

const ADAPTER_PATH = resolve(process.cwd(), "src/lib/ecowittMqttSensorAdapter.ts");
const CONTRACT_PATH = resolve(process.cwd(), "src/lib/sensorAdapterContract.ts");
const FIXTURE_PATH = resolve(
  process.cwd(),
  "fixtures/ecowitt-mqtt/synthetic-multi-probe-redacted.json",
);

const ADAPTER_RAW = readFileSync(ADAPTER_PATH, "utf8");
const CONTRACT_RAW = readFileSync(CONTRACT_PATH, "utf8");
const FIXTURE_RAW = readFileSync(FIXTURE_PATH, "utf8");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
}

const ADAPTER_EXECUTABLE = stripComments(ADAPTER_RAW);
const CONTRACT_EXECUTABLE = stripComments(CONTRACT_RAW);

interface StaticFixture {
  fixture_schema_version: number;
  fixture_kind: string;
  proof_status: string;
  comment: string;
  payload: Record<string, unknown>;
  channel_assignments: Array<{
    raw_field: string;
    tent_id: string;
    plant_id?: string | null;
  }>;
}

const FIXTURE = JSON.parse(FIXTURE_RAW) as StaticFixture;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("EcoWitt MQTT sensor adapter — static safety fences", () => {
  it("contains no persistence, network, browser storage, edge, or Supabase behavior", () => {
    for (const [label, pattern] of [
      ["Supabase import/client", /(?:@supabase|\bsupabase\.|createClient\s*\()/i],
      ["database mutation", /\.(?:insert|upsert|update|delete|rpc)\s*\(/i],
      ["network request", /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(?/i],
      ["MQTT publish", /(?:mqtt\s*\.\s*publish|\.publish)\s*\(/i],
      ["browser storage", /\b(?:localStorage|sessionStorage|indexedDB)\b/i],
      ["edge invocation", /functions\s*\.\s*invoke\s*\(/i],
    ] as const) {
      expect(ADAPTER_EXECUTABLE, label).not.toMatch(pattern);
      expect(CONTRACT_EXECUTABLE, label).not.toMatch(pattern);
    }
  });

  it("contains no alert, Action Queue, AI, automation, or equipment actuation calls", () => {
    for (const [label, pattern] of [
      ["Action Queue", /\baction[_-]?queue\b/i],
      ["alert write", /\b(?:create|insert|send|dispatch)[A-Za-z_]*alert\s*\(/i],
      ["AI invocation", /\b(?:aiDoctor|openai|anthropic|modelCall)\s*\(/i],
      ["automation trigger", /\btrigger[A-Za-z_]*automation\s*\(/i],
      [
        "equipment actuation",
        /\b(?:actuate|turnOn|turnOff|setRelay|setPump|setFan|setLight|setHeater|setHumidifier)\s*\(/i,
      ],
      ["Home Assistant service call", /homeassistant\s*\.\s*services?\s*\(/i],
    ] as const) {
      expect(ADAPTER_EXECUTABLE, label).not.toMatch(pattern);
      expect(CONTRACT_EXECUTABLE, label).not.toMatch(pattern);
    }
  });

  it("exports normalization only, with no command/control/publish surface", () => {
    for (const name of Object.keys(adapterModule)) {
      expect(name).not.toMatch(
        /command|control|publish|actuat|relay|switch|pump|fan|light|heater|humidifier/i,
      );
    }
  });

  it("uses injected time and deterministic transforms with no ambient clock or randomness", () => {
    expect(ADAPTER_EXECUTABLE).not.toMatch(/Date\.now\s*\(/);
    expect(ADAPTER_EXECUTABLE).not.toMatch(/Math\.random\s*\(/);
    expect(ADAPTER_EXECUTABLE).not.toMatch(/crypto\.randomUUID\s*\(/);
    expect(CONTRACT_EXECUTABLE).not.toMatch(/Date\.now\s*\(/);
    expect(CONTRACT_EXECUTABLE).not.toMatch(/Math\.random\s*\(/);
    expect(CONTRACT_EXECUTABLE).not.toMatch(/crypto\.randomUUID\s*\(/);
  });

  it("does not read environment credentials, embed production-shaped secrets, or log", () => {
    for (const source of [ADAPTER_EXECUTABLE, CONTRACT_EXECUTABLE]) {
      expect(source).not.toMatch(/(?:process|Deno)\.env|import\.meta\.env/);
      expect(source).not.toMatch(/(?:sk|sbp|vbt)_(?:live|prod)_[A-Za-z0-9_-]{12,}/i);
      expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug|trace)\s*\(/);
    }
  });

  it("delegates VPD math to the central helper and does not duplicate the formula", () => {
    expect(ADAPTER_RAW).toMatch(
      /import\s*\{[\s\S]*calculateAirVpdKpa[\s\S]*\}\s*from\s*["']@\/lib\/vpdRules["']/,
    );
    expect(ADAPTER_EXECUTABLE).not.toMatch(/0\.6108/);
    expect(ADAPTER_EXECUTABLE).not.toMatch(/17\.27/);
    expect(ADAPTER_EXECUTABLE).not.toMatch(/237\.3/);
  });

  it("keeps raw payload access behind the redacted result reference", () => {
    expect(ADAPTER_RAW).toMatch(/function sanitizeRedactedPayload/);
    expect(ADAPTER_RAW).toMatch(/top-level and primitive-only/);
    expect(ADAPTER_RAW).not.toMatch(/import\s*\{\s*redactForLog/);
    expect(ADAPTER_RAW).not.toMatch(/function\s+walk\s*\(/);
    expect(CONTRACT_RAW).toMatch(
      /SENSOR_ADAPTER_REDACTED_PAYLOAD_REF\s*=\s*\n?\s*["']adapter_result\.redacted_payload["']/,
    );
    expect(CONTRACT_RAW).not.toMatch(/\braw_payload\s*:/);
  });
});

describe("synthetic EcoWitt MQTT fixture — proof and credential safety", () => {
  it("is explicitly synthetic and explicitly not real-device/live-ingest proof", () => {
    expect(FIXTURE.fixture_schema_version).toBe(1);
    expect(FIXTURE.fixture_kind).toBe("synthetic_contract_fixture");
    expect(FIXTURE.proof_status).toBe("not_real_device_or_live_ingest_proof");
    expect(FIXTURE.comment).toMatch(/synthetic/i);
    expect(FIXTURE.comment).toMatch(/not evidence of a real EcoWitt device/i);
    expect(FIXTURE.payload._fixture_kind).toBe("synthetic_contract_fixture");
    expect(FIXTURE.payload._proof_status).toBe("not_real_device_or_live_ingest_proof");
  });

  it("uses structurally valid UUIDs for every configured tent and plant", () => {
    for (const mapping of FIXTURE.channel_assignments) {
      expect(mapping.tent_id, `${mapping.raw_field} tent_id`).toMatch(UUID_RE);
      if (mapping.plant_id !== undefined && mapping.plant_id !== null) {
        expect(mapping.plant_id, `${mapping.raw_field} plant_id`).toMatch(UUID_RE);
      }
    }
  });

  it("uses only inert sentinel credentials plus reserved synthetic network identifiers", () => {
    expect(FIXTURE.payload.PASSKEY).toBe("SYNTHETIC_INERT_PASSKEY_NOT_REAL");
    expect(FIXTURE.payload.password).toBe("SYNTHETIC_INERT_PASSWORD_NOT_REAL");
    expect(FIXTURE.payload.token).toBe("SYNTHETIC_INERT_TOKEN_NOT_REAL");
    expect(FIXTURE.payload.api_key).toBe("SYNTHETIC_INERT_API_KEY_NOT_REAL");
    expect(FIXTURE.payload.authorization).toBe("Bearer SYNTHETIC_INERT_AUTH_NOT_REAL");
    expect(FIXTURE.payload.privileged_marker).toBe("service-role:SYNTHETIC_INERT_NOT_REAL");
    expect(FIXTURE.payload.bridge_credential).toBe("vbt_synthetic_inert_not_real");
    expect(FIXTURE.payload.mac).toBe("02:00:00:00:00:01");
    expect(FIXTURE.payload.local_ip).toBe("192.168.254.254");
  });

  it("contains no public IP, production credential prefix, or real-proof claim", () => {
    expect(FIXTURE_RAW).not.toMatch(/\b(?:8\.8\.8\.8|1\.1\.1\.1)\b/);
    expect(FIXTURE_RAW).not.toMatch(/(?:sk|sbp|vbt)_(?:live|prod)_[A-Za-z0-9_-]{8,}/i);
    expect(FIXTURE_RAW).not.toMatch(/"proof_status"\s*:\s*"(?:real|live|verified)"/i);
  });
});
