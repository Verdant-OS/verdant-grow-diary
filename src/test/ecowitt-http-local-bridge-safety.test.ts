/**
 * Static safety scan for scripts/dev/ecowitt-http-local-bridge.ts.
 *
 * The HTTP→MQTT bridge must NEVER:
 *   - import the supabase client / SDK
 *   - perform direct DB writes (.insert/.upsert/.update/.delete)
 *   - reference service_role
 *   - reference action_queue or device-control identifiers
 *   - call the Verdant ingest webhook (fetch to VERDANT_INGEST_URL)
 *   - require / read VERDANT_BRIDGE_TOKEN
 *   - print MQTT password
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/dev/ecowitt-http-local-bridge.ts");
const SRC = readFileSync(SCRIPT_PATH, "utf8");
// Strip comments for executable-code checks.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("ecowitt-http-local-bridge — static safety", () => {
  it("does not import supabase SDK", () => {
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });

  it("never performs DB writes", () => {
    expect(CODE).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(CODE).not.toMatch(/\.from\(\s*["']sensor_readings/);
  });

  it("never references service_role", () => {
    expect(CODE).not.toMatch(/service[_-]?role/i);
  });

  it("does not reference action_queue or device-control identifiers", () => {
    // Comment-stripped code must be clean. Assembled at runtime is fine
    // in source comments but not present here.
    expect(CODE).not.toMatch(/action_queue/i);
    expect(CODE).not.toMatch(/device_command|relay_on|valve_open|light_on/i);
  });

  it("does not call the Verdant ingest webhook or require a bridge token", () => {
    expect(CODE).not.toMatch(/VERDANT_INGEST_URL/);
    expect(CODE).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(CODE).not.toMatch(/sensor-ingest-webhook/);
  });

  it("does not call fetch() — bridge is local HTTP -> local MQTT only", () => {
    expect(CODE).not.toMatch(/\bfetch\s*\(/);
  });

  it("uses the documented default broker, port, endpoint, and topic", () => {
    expect(SRC).toMatch(/mqtt:\/\/127\.0\.0\.1:1883/);
    expect(SRC).toMatch(/\/data\/report/);
    expect(SRC).toMatch(/ecowitt\/grow/);
    expect(SRC).toMatch(/8080/);
  });

  it("redacts MQTT password and token-like strings in logs", () => {
    expect(SRC).toMatch(/password\|token\|secret/);
    // No raw console.log of mqttPassword.
    const rawPwdLogs = ((CODE.match(/console\.log\([^)]*mqttPassword[^)]*\)/g) ?? []) as string[])
      .filter((l) => !l.includes("redacted"));
    expect(rawPwdLogs).toEqual([]);
  });

  it("supports the documented CLI flags", () => {
    for (const flag of ["--port", "--endpoint", "--mqtt-url", "--topic", "--dry-run", "--once"]) {
      expect(SRC).toContain(flag);
    }
  });
});
