/**
 * Static safety scan for the PowerShell EcoWitt canary harness.
 *
 * The script is operator tooling only. It must:
 *   - exist at scripts/ecowitt-canary-harness.ps1
 *   - validate the bridge token shape (starts with vbt_)
 *   - reject pasted curl commands (curl.exe in any required input)
 *   - redact bridge token, PASSKEY, and MAC in all printed output
 *   - target the deployed ecowitt-ingest endpoint
 *   - cover the three canary scenarios (main, duplicate, malformed)
 *   - NOT hardcode any real-looking secret
 *   - NOT introduce alerts / Action Queue / AI / automation / device-control
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PATH = resolve(process.cwd(), "scripts/ecowitt-canary-harness.ps1");

describe("ecowitt-canary-harness.ps1 — static safety", () => {
  it("file exists", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  const src = existsSync(PATH) ? readFileSync(PATH, "utf8") : "";

  it("validates bridge token must start with vbt_", () => {
    expect(src).toMatch(/StartsWith\('vbt_'\)/);
  });

  it("rejects pasted curl.exe commands in required inputs", () => {
    const occurrences = (src.match(/curl\\.exe/g) || []).length;
    // bridge token + PASSKEY + MAC validators
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("rejects whitespace in the bridge token", () => {
    expect(src).toMatch(/BridgeToken -match '\\\\s'/);
  });

  it("redacts the bridge token, PASSKEY, and MAC", () => {
    expect(src).toContain("vbt_REDACTED");
    expect(src).toContain("PASSKEY_REDACTED");
    expect(src).toContain("MAC_REDACTED");
    expect(src).toMatch(/Replace\(\$BridgeToken,\s*'vbt_REDACTED'\)/);
    expect(src).toMatch(/Replace\(\$TestPasskey,\s*'PASSKEY_REDACTED'\)/);
    expect(src).toMatch(/Replace\(\$TestMac,\s*'MAC_REDACTED'\)/);
  });

  it("targets the deployed ecowitt-ingest edge function", () => {
    expect(src).toContain("/functions/v1/ecowitt-ingest");
  });

  it("covers main, duplicate, and malformed canary scenarios", () => {
    expect(src).toMatch(/-Label "main"/);
    expect(src).toMatch(/-Label "duplicate"/);
    expect(src).toMatch(/-Label "malformed"/);
    expect(src).toContain("temp1f=abc"); // malformed temperature marker (in SQL block context-free check below ok)
  });

  it("posts the unmapped channel-9 negative-control fields", () => {
    expect(src).toContain("temp9f=81.0");
    expect(src).toContain("humidity9=50");
    expect(src).toContain("soilmoisture9=55");
  });

  it("emits the SQL verification block and final GO/NO-GO instruction", () => {
    expect(src).toContain("channel_9_rows");
    expect(src).toContain("null_captured_at_rows");
    expect(src).toMatch(/GO\/NO-GO/);
  });

  it("does not hardcode real-looking secrets", () => {
    // No bare vbt_ tokens with realistic length, no MAC literals
    expect(src).not.toMatch(/vbt_[A-Za-z0-9]{16,}/);
    expect(src).not.toMatch(/\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/);
    // PASSKEY=$TestPasskey is fine; PASSKEY=<32hex> would not be
    expect(src).not.toMatch(/PASSKEY=[0-9A-Fa-f]{16,}/);
  });

  it("does not introduce alerts / Action Queue / AI / automation / device control", () => {
    const forbidden = [
      "action_queue",
      "alerts",
      "ai_doctor",
      "service_role",
      "mqtt",
      "home_assistant",
      "pi_bridge",
      "relay",
      "actuator",
    ];
    for (const word of forbidden) {
      expect(src.toLowerCase()).not.toContain(word);
    }
  });
});
