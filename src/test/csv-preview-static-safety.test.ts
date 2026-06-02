/**
 * CSV preview static safety scans — covers the new mapping template,
 * preset storage, validation hint helpers, and the page wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const TARGETS: Array<{ name: string; path: string }> = [
  { name: "csvMappingTemplates", path: "src/lib/csvMappingTemplates.ts" },
  { name: "csvMappingPresetStorage", path: "src/lib/csvMappingPresetStorage.ts" },
  { name: "csvRowValidationRules", path: "src/lib/csvRowValidationRules.ts" },
  { name: "RepresentativeCsvPreview", path: "src/pages/RepresentativeCsvPreview.tsx" },
];

describe("csv preview — static safety scan", () => {
  for (const target of TARGETS) {
    const src = stripSourceComments(read(target.path));
    it(`${target.name}: no insert/upsert/update/delete/rpc writes`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    });
    it(`${target.name}: no action_queue / alerts / ai_doctor_sessions / sensor_readings writes`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/ai_doctor_sessions/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });
    it(`${target.name}: no functions.invoke / service_role / live labeling`, () => {
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/=\s*['"]live['"]/);
    });
  }

  it("RepresentativeCsvPreview surfaces preview-safe copy", () => {
    const raw = read("src/pages/RepresentativeCsvPreview.tsx");
    expect(raw).toMatch(/Preview only/);
    expect(raw).toMatch(/No data has been saved/);
    expect(raw).toMatch(/CSV source, not live data/);
    expect(raw).toMatch(/Review units before trusting values/);
    expect(raw).toMatch(/blocked from canonical preview/i);
  });

  it("RepresentativeCsvPreview does not duplicate template synonym tables (rules live in csvMappingTemplates.ts)", () => {
    const page = stripSourceComments(read("src/pages/RepresentativeCsvPreview.tsx"));
    expect(page).not.toMatch(/CSV_MAPPING_TEMPLATES\s*=\s*\[/);
    expect(page).not.toMatch(/synonyms\s*:\s*\[/);
  });
});
