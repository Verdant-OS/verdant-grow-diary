import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const FILES = [
  "src/constants/strainReferenceLibrary.ts",
  "src/lib/cultivarReferenceSearchRules.ts",
  "src/lib/cultivarReferenceViewModel.ts",
  "src/lib/sharedSearchTextRules.ts",
  "src/pages/CultivarsIndex.tsx",
  "src/pages/CultivarPage.tsx",
];
const SOURCE = FILES.map((file) => readFileSync(resolve(ROOT, file), "utf8")).join("\n");
const EXECUTABLE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("Strain Reference Library V1 static safety", () => {
  it("stays read-only and does not invoke private or write boundaries", () => {
    expect(EXECUTABLE).not.toMatch(/integrations\/supabase\/client/);
    expect(EXECUTABLE).not.toMatch(/functions\.invoke/);
    expect(EXECUTABLE).not.toMatch(/\.(insert|update|upsert)\s*\(/);
    expect(EXECUTABLE).not.toMatch(/\.from\([^\n]+\)\.delete\s*\(/);
    expect(EXECUTABLE).not.toMatch(/service[_-]?role/i);
  });

  it("does not create AI, alert, Action Queue, automation, or device-control behavior", () => {
    expect(EXECUTABLE).not.toMatch(/action_queue/i);
    expect(EXECUTABLE).not.toMatch(/mqtt\.publish|device_command|relay_on|valve_open/i);
    expect(EXECUTABLE).not.toMatch(/createAlert|insertAlert|createAction|executeDevice/i);
  });

  it("keeps the grower-authority and sample-data boundary visible", () => {
    expect(SOURCE).toMatch(/sample reference data/i);
    expect(SOURCE).toMatch(/logs[\s\S]{0,200}sensors[\s\S]{0,200}truth/i);
    expect(SOURCE).toMatch(/never create alerts/i);
  });
});
