import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ADR_PATH = path.resolve(
  __dirname,
  "../../docs/integrations/spider-farmer-ggs-backhaul-decision.md"
);

function readAdr(): string {
  return fs.readFileSync(ADR_PATH, "utf-8");
}

describe("Spider Farmer GGS Backhaul ADR", () => {
  it("ADR file exists", () => {
    expect(fs.existsSync(ADR_PATH)).toBe(true);
  });

  describe("status", () => {
    it("says experimental read-only bridge", () => {
      const adr = readAdr();
      expect(adr).toMatch(/experimental read-only bridge/i);
    });
  });

  describe("decision summary", () => {
    it("includes ESP-NOW / ESP-MESH first", () => {
      const adr = readAdr();
      expect(adr).toMatch(/ESP-NOW.*ESP-MESH.*first/i);
    });

    it("includes RF mitigation before protocol escalation", () => {
      const adr = readAdr();
      expect(adr).toMatch(/RF mitigation before protocol escalation/i);
    });

    it("includes Go-Back-N before Selective Repeat", () => {
      const adr = readAdr();
      expect(adr).toMatch(/Go-Back-N before Selective Repeat/i);
    });

    it("includes raw LoRa P2P before LoRaWAN", () => {
      const adr = readAdr();
      expect(adr).toMatch(/raw LoRa.*before LoRaWAN/i);
    });

    it("includes LoRaWAN deferred", () => {
      const adr = readAdr();
      expect(adr).toMatch(/LoRaWAN deferred/i);
    });
  });

  describe("escalation ladder order", () => {
    it("preserves step 1: placement + antenna + clean power + channel discipline", () => {
      const adr = readAdr();
      // Isolate the escalation ladder table to avoid matching the Decision section
      const ladderMatch = adr.match(/## Escalation Ladder[\s\S]*?(?=## |\Z)/);
      expect(ladderMatch).toBeTruthy();
      const ladder = ladderMatch![0];

      const step1Index = ladder.search(
        /placement.*antenna.*clean power.*channel discipline/i
      );
      const step2Index = ladder.search(/roaming stability tuning/i);
      const step3Index = ladder.search(/Go-Back-N buffering/i);
      const step4Index = ladder.search(/Selective Repeat/i);
      const step5Index = ladder.search(/raw LoRa P2P/i);
      const step6Index = ladder.search(/LoRaWAN only for many gateways/i);

      expect(step1Index).toBeGreaterThan(-1);
      expect(step2Index).toBeGreaterThan(-1);
      expect(step3Index).toBeGreaterThan(-1);
      expect(step4Index).toBeGreaterThan(-1);
      expect(step5Index).toBeGreaterThan(-1);
      expect(step6Index).toBeGreaterThan(-1);

      expect(step1Index).toBeLessThan(step2Index);
      expect(step2Index).toBeLessThan(step3Index);
      expect(step3Index).toBeLessThan(step4Index);
      expect(step4Index).toBeLessThan(step5Index);
      expect(step5Index).toBeLessThan(step6Index);
    });
  });

  describe("architecture", () => {
    it("includes the canonical architecture line", () => {
      const adr = readAdr();
      // The canonical architecture line from the ADR:
      // GGS BLE/controller data → Leaf/Gateway → ESP-NOW/ESP-MESH backhaul → Root → MQTT/adapter contract → Verdant normalizer
      expect(adr).toMatch(/GGS BLE/i);
      expect(adr).toMatch(/Leaf/i);
      expect(adr).toMatch(/Gateway/i);
      expect(adr).toMatch(/ESP-NOW/i);
      expect(adr).toMatch(/Root/i);
      expect(adr).toMatch(/MQTT/i);
      expect(adr).toMatch(/Verdant normalizer/i);
    });
  });

  describe("integration boundaries", () => {
    it("includes read-only language", () => {
      const adr = readAdr();
      expect(adr).toMatch(/read-only/i);
    });

    it("includes publish-only from bridge to Verdant language", () => {
      const adr = readAdr();
      expect(adr).toMatch(/publish-only/i);
    });

    it("includes no device-control language", () => {
      const adr = readAdr();
      expect(adr).toMatch(/no device control/i);
    });

    it("includes no setpoint writes language", () => {
      const adr = readAdr();
      expect(adr).toMatch(/no setpoint writes/i);
    });

    it("includes no automation language", () => {
      const adr = readAdr();
      expect(adr).toMatch(/no automation/i);
    });
  });

  describe("sensor-truth warning", () => {
    it("includes warning about preserving original captured_at", () => {
      const adr = readAdr();
      expect(adr).toMatch(/original.*captured_at/i);
      expect(adr).toMatch(/preserve/i);
    });

    it("includes stale/invalid classification guidance", () => {
      const adr = readAdr();
      expect(adr).toMatch(/stale/i);
      expect(adr).toMatch(/invalid/i);
    });
  });

  describe("validation metrics", () => {
    it("includes ESP-NOW retry / NACK logging guidance", () => {
      const adr = readAdr();
      expect(adr).toMatch(/ESP-NOW retry/i);
      expect(adr).toMatch(/NACK/i);
    });

    it("includes ESP-MESH parent change logging guidance", () => {
      const adr = readAdr();
      expect(adr).toMatch(/parent change/i);
      expect(adr).toMatch(/routing table/i);
    });

    it("includes packet loss tracking guidance", () => {
      const adr = readAdr();
      expect(adr).toMatch(/packet loss/i);
    });

    it("includes latency measurement guidance", () => {
      const adr = readAdr();
      expect(adr).toMatch(/latency/i);
    });

    it("includes retransmit tracking guidance", () => {
      const adr = readAdr();
      expect(adr).toMatch(/retransmit/i);
    });

    it("includes stale buffered readings guidance", () => {
      const adr = readAdr();
      expect(adr).toMatch(/stale buffered/i);
    });
  });

  describe("static safety scan", () => {
    it("does not contain service_role", () => {
      const adr = readAdr();
      expect(adr).not.toMatch(/service_role/i);
    });

    it("does not contain bearer token patterns", () => {
      const adr = readAdr();
      expect(adr).not.toMatch(/bearer /i);
    });

    it("does not contain bridge token prefixes", () => {
      const adr = readAdr();
      expect(adr).not.toMatch(/vbt_/i);
    });

    it("does not contain API key patterns", () => {
      const adr = readAdr();
      expect(adr).not.toMatch(/api[_-]?key/i);
      expect(adr).not.toMatch(/sk-[a-zA-Z0-9]/i);
    });

    it("does not contain device-control implementation wording", () => {
      const adr = readAdr();
      // Look for imperative device-control sentences, not policy statements.
      // "light-schedule" in "no setpoint writes" is a policy, not a command.
      const controlWords = [
        /execute\s+(the\s+)?command/i,
        /turn\s+on\s+(the\s+)?(fan|light|pump|heater|humidifier)/i,
        /turn\s+off\s+(the\s+)?(fan|light|pump|heater|humidifier)/i,
        /set\s+(the\s+)?fan\s+(speed|to)/i,
        /set\s+(the\s+)?light\s+(schedule|intensity|to\s+\d)/i,
        /set\s+(the\s+)?pump\s+(rate|to)/i,
        /control\s+(the\s+)?fan/i,
        /control\s+(the\s+)?pump/i,
        /activate\s+(the\s+)?(fan|light|pump|heater|humidifier)/i,
        /deactivate\s+(the\s+)?(fan|light|pump|heater|humidifier)/i,
      ];
      for (const pattern of controlWords) {
        expect(adr).not.toMatch(pattern);
      }
    });
  });

  describe("truth-in-labeling", () => {
    it("does not claim official Spider Farmer partnership", () => {
      const adr = readAdr();
      expect(adr).not.toMatch(/official.*partner/i);
      expect(adr).not.toMatch(/certified.*Spider Farmer/i);
    });

    it("does not claim production readiness", () => {
      const adr = readAdr();
      expect(adr).not.toMatch(/production-ready/i);
      expect(adr).not.toMatch(/production ready/i);
    });

    it("explicitly notes experimental status", () => {
      const adr = readAdr();
      expect(adr).toMatch(/experimental/i);
    });
  });
});
