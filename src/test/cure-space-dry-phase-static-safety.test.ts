/**
 * Static-safety guard for V0 cure_space_setup + dry_phase_check
 * foundations. Asserts no AI, alerts persistence, Action Queue writes,
 * Supabase writes, automation/device-control wording, or service_role
 * leakage in the new files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILES = [
  "src/constants/cureSpaceSetupFields.ts",
  "src/constants/dryPhaseCheckFields.ts",
  "src/lib/cureSpaceSetupRules.ts",
  "src/lib/dryPhaseCheckRules.ts",
];

const FORBIDDEN_IMPORTS: Array<{ name: string; re: RegExp }> = [
  { name: "AI gateway import", re: /from\s+["']@\/lib\/ai(?:Doctor|Coach|Gateway)/i },
  { name: "model invoke", re: /functions\.invoke\(/i },
  { name: "alerts persistence", re: /from\s+["'][^"']*alerts?\/(persist|create|insert)/i },
  { name: "action_queue write", re: /action_queue.*\b(insert|update|upsert|delete)\b/i },
  { name: "supabase write call", re: /\.from\([^)]+\)\.(insert|update|upsert|delete)\(/i },
  { name: "supabase client import", re: /@\/integrations\/supabase\/client/ },
  { name: "service_role token", re: /service_role/i },
];

const FORBIDDEN_WORDING: Array<{ name: string; re: RegExp }> = [
  { name: "AI recommends", re: /\bAI\s+recommends\b/i },
  { name: "automated cure", re: /\bautomated\s+cure\b/i },
  { name: "automated dry", re: /\bautomated\s+dry\b/i },
  { name: "auto-adjust", re: /\bauto[- ]?adjust\b/i },
  { name: "device control", re: /\bdevice[ -]?control\b/i },
  { name: "guaranteed cure", re: /\bguaranteed\s+cure\b/i },
  { name: "competition-grade guaranteed", re: /competition[- ]grade\s+guaranteed/i },
  { name: "autopilot", re: /\bautopilot\b/i },
];

describe("cure_space_setup + dry_phase_check static safety", () => {
  for (const file of FILES) {
    it(`${file} contains no forbidden imports/wording`, () => {
      const text = readFileSync(file, "utf8");
      for (const p of FORBIDDEN_IMPORTS) {
        expect(p.re.test(text), `${file}: forbidden import ${p.name}`).toBe(false);
      }
      for (const p of FORBIDDEN_WORDING) {
        expect(p.re.test(text), `${file}: forbidden wording ${p.name}`).toBe(false);
      }
    });
  }
});
