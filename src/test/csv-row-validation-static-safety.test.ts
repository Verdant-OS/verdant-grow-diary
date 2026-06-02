/**
 * Static safety scans for the per-row validation helpers + constants.
 *
 * Ensures no Supabase writes, no functions.invoke, no service_role, no
 * action_queue/alerts/ai_doctor_sessions/sensor_readings writes, and the
 * page does not duplicate validation range tables.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const TARGETS = [
  { name: "csvValidationRanges", path: "src/constants/csvValidationRanges.ts" },
  { name: "csvRowValidationRules", path: "src/lib/csvRowValidationRules.ts" },
  { name: "RepresentativeCsvPreview", path: "src/pages/RepresentativeCsvPreview.tsx" },
] as const;

describe("csv row validation — static safety scan", () => {
  for (const t of TARGETS) {
    const src = stripSourceComments(read(t.path));
    it(`${t.name}: no Supabase write surface`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/service_role/);
    });
    it(`${t.name}: no writes to action_queue / alerts / ai_doctor_sessions / sensor_readings`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/ai_doctor_sessions/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });
  }

  it("page does not duplicate validation range tables (must import from constants)", () => {
    const page = stripSourceComments(read("src/pages/RepresentativeCsvPreview.tsx"));
    expect(page).not.toMatch(/PH_REALISTIC_RANGE\s*=/);
    expect(page).not.toMatch(/HUMIDITY_STUCK_VALUES\s*=/);
    expect(page).not.toMatch(/EC_SUSPICIOUS_MSCM_MAX\s*=/);
    expect(page).not.toMatch(/CSV_VALIDATION_RANGES\s*=/);
  });
});
