/**
 * Static safety scans for the local EcoWitt test sender script.
 *
 * Verdant sensor truth rules: the local PC bridge / dev test sender must
 * never write directly to Supabase tables, must never use service_role,
 * must never bypass the validated ingest webhook, must redact tokens in
 * logs, and must support --dry-run / --invalid for safe local validation.
 *
 * Pure file-content scans. No network, no shelling out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = readFileSync(
  resolve(ROOT, "scripts/send-ecowitt-test-payload.ts"),
  "utf8",
);

describe("ecowitt local test sender — safety", () => {
  // Strip comments before scanning for forbidden runtime tokens so that
  // safety-rule documentation (e.g. "never uses service_role") doesn't
  // create false positives.
  const CODE = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  it("never references service_role in executable code", () => {
    expect(CODE).not.toMatch(/service[_-]?role/i);
    expect(CODE).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("does not import the supabase client / SDK directly", () => {
    expect(SCRIPT).not.toMatch(/@supabase\/supabase-js/);
    expect(SCRIPT).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });

  it("does not write directly to sensor_readings or any public table", () => {
    expect(SCRIPT).not.toMatch(/\.from\(\s*["']sensor_readings/);
    expect(SCRIPT).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });

  it("posts only to the existing ingest webhook URL (env-driven)", () => {
    expect(SCRIPT).toMatch(/VERDANT_INGEST_URL/);
    // Single fetch call — to the env-supplied URL.
    const fetchCalls = SCRIPT.match(/fetch\s*\(/g) ?? [];
    expect(fetchCalls.length).toBeLessThanOrEqual(1);
  });

  it("supports --dry-run and skips the fetch in dry-run mode", () => {
    expect(SCRIPT).toMatch(/--dry-run/);
    expect(SCRIPT).toMatch(/dryRun/);
    expect(SCRIPT).toMatch(/dry-run complete/i);
  });

  it("supports --invalid for the safety-rejection test", () => {
    expect(SCRIPT).toMatch(/--invalid/);
  });

  it("uses Bearer auth and redacts the token in logs", () => {
    expect(SCRIPT).toMatch(/Authorization:\s*`Bearer \$\{token\}`/);
    expect(SCRIPT).toMatch(/redactBridgeToken\(token\)/);
    // The script must never console.log the raw `token` identifier
    // unwrapped — only the redacted form is permitted.
    const rawTokenLogs = (CODE.match(
      /console\.log\([^)]*\btoken\b[^)]*\)/g,
    ) ?? []).filter((line) => !line.includes("redactBridgeToken"));
    expect(rawTokenLogs).toEqual([]);
  });

  it("does not request a Supabase user_id from the caller", () => {
    // tent_id is required; user_id must come from the server's JWT/bridge token.
    expect(SCRIPT).not.toMatch(/VERDANT_USER_ID/);
  });

  it("does not contain device-control or action-queue write language", () => {
    expect(SCRIPT).not.toMatch(/action_queue/i);
    expect(SCRIPT).not.toMatch(/device_command|relay_on|valve_open|light_on/i);
  });
});
