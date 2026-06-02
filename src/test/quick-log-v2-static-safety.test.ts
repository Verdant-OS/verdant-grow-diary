import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const files = [
  "src/lib/quickLogV2Rules.ts",
  "src/lib/quickLogV2SavePayload.ts",
  "src/hooks/useQuickLogV2Save.ts",
  "src/components/QuickLogV2Sheet.tsx",
  "src/components/QuickLogV2Fab.tsx",
];

const banned = [
  /\bautopilot\b/i,
  /\bcontrol enabled\b/i,
  /\bdevice connected\b/i,
  /\bautomation\b/i,
  /\bsynced\b/i,
  /\bimported\b/i,
  /\bservice[_ ]role\b/i,
  /\bbridge[_ ]token\b/i,
  /VITE_SUPABASE_SERVICE/i,
];

// Device-control verbs in imperative form (not advisory).
const deviceControl = [
  /\bturn on (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
  /\bturn off (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
  /\bactivate (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
];

const fakeLive = [/\blive (?:reading|data)\b/i, /\bconnected sensor\b/i];

const writeTargets = [
  /from\(["']alerts["']\)/,
  /from\(["']action_queue["']\)/,
  /from\(["']ai_doctor_sessions["']\)/,
];

describe("QuickLog v2 static safety", () => {
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");

    it(`${rel} has no banned wording`, () => {
      for (const re of banned) expect(src).not.toMatch(re);
    });

    it(`${rel} has no device-control imperatives`, () => {
      for (const re of deviceControl) expect(src).not.toMatch(re);
    });

    it(`${rel} does not imply fake live data`, () => {
      for (const re of fakeLive) expect(src).not.toMatch(re);
    });

    it(`${rel} does not write alerts/action_queue/ai_doctor_sessions`, () => {
      for (const re of writeTargets) expect(src).not.toMatch(re);
    });
  }
});
