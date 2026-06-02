/**
 * Sensor Bridge Health — static safety tests.
 *
 * Asserts that the new read-only surface never:
 *  - writes to alerts / action_queue / ai_doctor_sessions
 *  - calls device-control vocabulary
 *  - reads or renders raw_payload or bridge tokens
 *  - embeds service_role / API keys in the frontend
 *  - duplicates the validation tables in sensorBridgeIntakeRules
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const VM = read("src/lib/sensorBridgeHealthViewModel.ts");
const HOOK = read("src/hooks/useSensorBridgeHealth.ts");
const CARD = read("src/components/SensorBridgeHealthCard.tsx");
const ALL = `${VM}\n${HOOK}\n${CARD}`;

describe("sensor bridge health — static safety", () => {
  it("never writes to alerts / action_queue / ai_doctor_sessions", () => {
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
    expect(ALL).not.toMatch(/\.insert\s*\(/);
    expect(ALL).not.toMatch(/\.update\s*\(/);
    expect(ALL).not.toMatch(/\.delete\s*\(/);
    expect(ALL).not.toMatch(/\.upsert\s*\(/);
    expect(ALL).not.toMatch(/\.rpc\s*\(/);
  });

  it("contains no device-control vocabulary", () => {
    const banned = [
      /turn[_\s-]?on\s*\(/i,
      /turn[_\s-]?off\s*\(/i,
      /actuate/i,
      /relay/i,
      /pump_command/i,
      /valve_command/i,
      /fan_command/i,
      /light_command/i,
      /set_power/i,
    ];
    for (const re of banned) expect(ALL).not.toMatch(re);
  });

  it("never reads or renders raw_payload or bridge tokens", () => {
    expect(ALL).not.toMatch(/raw_payload/);
    expect(ALL).not.toMatch(/token_hash/);
    expect(ALL).not.toMatch(/secret_hash/);
    expect(ALL).not.toMatch(/secret_ciphertext/);
    expect(ALL).not.toMatch(/secret_nonce/);
    expect(ALL).not.toMatch(/bridge_tokens/);
    expect(ALL).not.toMatch(/pi_ingest_bridge_credentials/);
  });

  it("never embeds service_role or API keys in the frontend bundle", () => {
    expect(ALL).not.toMatch(/service_role/i);
    expect(ALL).not.toMatch(/SUPABASE_SERVICE_ROLE/i);
    expect(ALL).not.toMatch(/sk_live_/);
    expect(ALL).not.toMatch(/api[_-]?key\s*[:=]/i);
  });

  it("hook only reads sensor_ingest_audit_log with a safe column allowlist", () => {
    expect(HOOK).toMatch(/from\(["']sensor_ingest_audit_log["']\)/);
    expect(HOOK).not.toMatch(/select\(\s*["']\*["']/);
    expect(HOOK).not.toMatch(/raw_payload/);
    expect(HOOK).not.toMatch(/token/);
    expect(HOOK).not.toMatch(/secret/);
  });

  it("view-model does not duplicate validation tables from sensorBridgeIntakeRules", () => {
    // The intake rules file defines vendor + metric validation tables. The
    // health view-model must not redefine them; it operates on audit counts.
    expect(VM).not.toMatch(/HUMIDITY_STUCK/);
    expect(VM).not.toMatch(/SOIL_STUCK/);
    expect(VM).not.toMatch(/CELSIUS_AS_FAHRENHEIT/);
    expect(VM).not.toMatch(/PH_RANGE/);
    expect(VM).not.toMatch(/METRIC_VALIDATORS/);
  });

  it("card renders the No device control disclosure literal", () => {
    expect(CARD).toMatch(/No device control\./);
  });

  it("uses safe snake_case reason codes only", () => {
    // Reason codes must be lowercase tokens, never SQL keywords or UUIDs.
    const codes = ["partial_accept", "none_inserted"];
    for (const c of codes) {
      expect(c).toMatch(/^[a-z][a-z0-9_]{2,40}$/);
    }
  });
});
