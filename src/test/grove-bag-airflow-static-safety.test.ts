/**
 * Static-safety guard for the Grove Bag airflow slice.
 *
 * Asserts the new files contain no imports or wording that would violate
 * V0 safety rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILES = [
  "src/constants/groveBagCureFields.ts",
  "src/lib/groveBagAirflowRules.ts",
];

const FORBIDDEN_IMPORT_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "AI gateway import", re: /from\s+["']@\/lib\/ai(?:Doctor|Coach|Gateway)/i },
  { name: "model invoke", re: /functions\.invoke\(/i },
  { name: "alerts persistence", re: /from\s+["'][^"']*alerts?\/(persist|create|insert)/i },
  { name: "action_queue write", re: /action_queue.*\b(insert|update|upsert|delete)\b/i },
  { name: "supabase write call", re: /\.from\([^)]+\)\.(insert|update|upsert|delete)\(/i },
  { name: "supabase client import", re: /@\/integrations\/supabase\/client/ },
  { name: "service_role token", re: /service_role/i },
];

const FORBIDDEN_WORDING: Array<{ name: string; re: RegExp }> = [
  { name: "automated airflow", re: /\bautomated\s+airflow\b/i },
  { name: "auto-adjust", re: /\bauto[- ]?adjust\b/i },
  { name: "device control", re: /\bdevice[- ]?control\b/i },
  { name: "guaranteed cure", re: /\bguaranteed\s+cure\b/i },
  { name: "AI recommends", re: /\bAI\s+recommends\b/i },
  { name: "autopilot", re: /\bautopilot\b/i },
];

describe("Grove Bag airflow slice static safety", () => {
  for (const file of FILES) {
    it(`${file} contains no forbidden imports/wording`, () => {
      const text = readFileSync(file, "utf8");
      for (const p of FORBIDDEN_IMPORT_PATTERNS) {
        expect(p.re.test(text), `${file}: forbidden import ${p.name}`).toBe(false);
      }
      for (const p of FORBIDDEN_WORDING) {
        expect(p.re.test(text), `${file}: forbidden wording ${p.name}`).toBe(false);
      }
    });
  }
});
