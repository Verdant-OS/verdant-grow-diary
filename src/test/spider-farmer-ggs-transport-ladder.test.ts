/**
 * Docs-only test: locks the Spider Farmer GGS transport ladder ADR so
 * future edits cannot silently weaken Verdant's read-only, demo-first
 * stance or imply an official partnership.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(
  resolve(__dirname, "../../docs/integrations/spider-farmer-ggs-transport-ladder.md"),
  "utf8",
);
const LOWER = DOC.toLowerCase();

describe("Spider Farmer GGS transport ladder ADR", () => {
  it("declares the exact three-rung ladder in order", () => {
    expect(DOC).toMatch(/1\.\s+\*\*GGS BLE read-only capture\*\*/);
    expect(DOC).toMatch(/2\.\s+\*\*Synthetic ?\/ ?demo MQTT adapter \(first\)\*\*/);
    expect(DOC).toMatch(/3\.\s+\*\*Validated live adapter \(later, gated\)\*\*/);

    const bleIdx = DOC.indexOf("GGS BLE read-only capture");
    const demoIdx = DOC.indexOf("Synthetic / demo MQTT adapter");
    const liveIdx = DOC.indexOf("Validated live adapter");
    expect(bleIdx).toBeGreaterThan(-1);
    expect(demoIdx).toBeGreaterThan(bleIdx);
    expect(liveIdx).toBeGreaterThan(demoIdx);
  });

  it("clarifies MQTT is Verdant-owned bridge transport", () => {
    expect(DOC).toContain("Verdant-owned bridge transport");
  });

  it("clarifies it is not a documented Spider Farmer local MQTT broker", () => {
    expect(DOC).toContain("not a documented Spider Farmer local MQTT broker");
  });

  it("requires source=demo for synthetic/demo adapter payloads", () => {
    expect(DOC).toMatch(/source=demo/);
    const demoSection = DOC.indexOf("Synthetic / demo MQTT adapter");
    const liveSection = DOC.indexOf("Validated live adapter");
    const demoIdx = DOC.indexOf("source=demo");
    expect(demoIdx).toBeGreaterThan(demoSection);
    expect(demoIdx).toBeLessThan(liveSection);
  });

  it("gates source=live behind explicit validation checks", () => {
    expect(DOC).toMatch(/source=live.*ONLY after/);
    for (const check of [
      "exact controller model confirmed",
      "real BLE payload observed",
      "timestamp and units validated",
      "compared against the controller",
      "stale and invalid checks pass",
    ]) {
      expect(DOC).toContain(check);
    }
  });

  it("requires BLE testing to be read-only (notifications only, no writes/setpoints/commands)", () => {
    expect(DOC).toMatch(/BLE notifications only\./);
    expect(DOC).toMatch(/No write characteristic use\./);
    expect(DOC).toMatch(/No setpoints\./);
    expect(DOC).toMatch(/No commands\./);
    expect(DOC).toMatch(/No device control\./);
  });

  it("calls out Tuya local / Tuya cloud / ESPHome as separate non-GGS fallback routes", () => {
    expect(DOC).toContain("Tuya local API");
    expect(DOC).toContain("Tuya cloud API");
    expect(DOC).toContain("ESPHome flashing");
    expect(DOC).toMatch(/not the default GGS assumption/);
  });

  it("does not claim an official Spider Farmer partnership", () => {
    expect(LOWER).toContain("not an official spider farmer partner");
    expect(LOWER).not.toMatch(/official(ly)? (partner|endorsed|certified) (by|with) spider farmer/);
    expect(LOWER).not.toMatch(/spider farmer (partnership|endorsement|certification)/);
  });

  it("does not claim production-readiness", () => {
    expect(LOWER).not.toMatch(/\bproduction[- ]ready\b/);
    expect(LOWER).not.toMatch(/\bready for production\b/);
    expect(LOWER).not.toMatch(/\bga\b|general availability/);
    expect(LOWER).toContain("experimental");
  });

  it("contains no device-control language or secrets", () => {
    const FORBIDDEN = [
      /\bturn on the (fan|light|pump|heater|humidifier|dehumidifier)\b/i,
      /\bturn off the (fan|light|pump|heater|humidifier|dehumidifier)\b/i,
      /\bset fan speed\b/i,
      /\bset light intensity\b/i,
      /\bsend command\b/i,
      /\bissue command\b/i,
      /\bcontrol the (fan|light|pump|heater|humidifier|dehumidifier)\b/i,
      /\bservice_role\b/i,
      /\bbearer\s+[A-Za-z0-9]/i,
      /\bvbt_/i,
      /\bapi[_-]?key\s*[:=]/i,
    ];
    for (const re of FORBIDDEN) expect(DOC).not.toMatch(re);
  });

  it("locks the no-Supabase / no-Edge-Function / no-UI safety fences", () => {
    expect(DOC).toMatch(/No Supabase writes/);
    expect(DOC).toMatch(/no Edge Functions/);
    expect(DOC).toMatch(/no UI changes/);
    expect(DOC).toMatch(/No Action Queue writes/);
  });
});
