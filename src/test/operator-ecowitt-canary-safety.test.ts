/**
 * Static safety scan for the Operator EcoWitt Canary Audit page.
 * Ensures the page never adds DB writes, RPCs, automation, or device control.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "src/pages/OperatorEcowittCanary.tsx",
  "src/lib/ecowittCanaryAuditRules.ts",
];

const FORBIDDEN: { pattern: RegExp; name: string }[] = [
  { pattern: /\.insert\s*\(/, name: ".insert(" },
  { pattern: /\.update\s*\(/, name: ".update(" },
  { pattern: /\.upsert\s*\(/, name: ".upsert(" },
  { pattern: /\.delete\s*\(/, name: ".delete(" },
  { pattern: /\.rpc\s*\(/, name: ".rpc(" },
  { pattern: /functions\.invoke/, name: "functions.invoke" },
  { pattern: /service_role/i, name: "service_role" },
  { pattern: /\bmqtt\b/i, name: "mqtt" },
  { pattern: /home[_-]?assistant/i, name: "home_assistant" },
  { pattern: /\brelay\b/i, name: "relay" },
  { pattern: /\bactuator\b/i, name: "actuator" },
  { pattern: /from\(["']action_queue["']\)/, name: "action_queue table" },
  { pattern: /from\(["']alerts["']\)/, name: "alerts table" },
];

describe("Operator EcoWitt Canary static safety", () => {
  for (const f of files) {
    it(`${f} contains no forbidden write/automation surfaces`, () => {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      // strip line comments + block comments
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const { pattern, name } of FORBIDDEN) {
        expect(stripped, `${f} contains forbidden token: ${name}`).not.toMatch(pattern);
      }
    });
  }
});
