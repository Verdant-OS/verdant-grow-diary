import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const FILES = [
  "src/lib/growRepo.ts",
  "src/lib/growTentSelectionRules.ts",
  "src/hooks/useSoilMoistureCalibrations.ts",
  "src/pages/Tents.tsx",
  "src/pages/Dashboard.tsx",
  "src/components/PlantDetailAiDoctorReadiness.tsx",
  "src/components/PlantDetailAiDoctorLiveReview.tsx",
] as const;

describe("grow UUID validation centralization", () => {
  it.each(FILES)("uses the shared validator in %s", (path) => {
    const source = readFileSync(resolve(ROOT, path), "utf8");
    expect(source).toMatch(/from ["']@\/lib\/isUuid["']|from ["']\.\/isUuid["']/);
    expect(source).not.toMatch(/\[0-9a-f\]\{8\}.*\[0-9a-f\]\{12\}/i);
  });
});
