import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const QUICK_LOG = read("src/components/QuickLogAllActivitiesSection.tsx");
const TIMELINE = read("src/pages/Timeline.tsx");
const RULES = read("src/lib/symptomEvidenceChecklistRules.ts");
const SITEMAP = read("public/sitemap.xml");

describe("Symptom Check static safety", () => {
  it("keeps the canonical issue observation route and performs no write on symptom selection", () => {
    expect(QUICK_LOG).toContain('bindQuickLogActivityDraft("issue_observation"');
    expect(QUICK_LOG).toContain("validateGuidedSymptomCheck");
    expect(QUICK_LOG).not.toMatch(/from\(["'](?:action_queue|sensor_readings)["']\).*insert/s);
    expect(QUICK_LOG).not.toMatch(/service_role|device.?control/i);
  });

  it("rechecks guided Symptom Check plant identity before the persistence seam", () => {
    expect(QUICK_LOG).toMatch(/validateGuidedSymptomCheck\(\{\s*plantId,\s*symptomId:/);
    expect(QUICK_LOG.indexOf("validateGuidedSymptomCheck({")).toBeLessThan(
      QUICK_LOG.indexOf("const result = await save({"),
    );
  });

  it("pins a pure 14-day, past-only, scope-aware Timeline evidence path", () => {
    expect(RULES).toContain("SYMPTOM_EVIDENCE_LOOKBACK_DAYS = 14");
    expect(RULES).toContain("candidate.occurredMs <= symptomMs");
    expect(RULES).toContain("entry.growId !== symptom.growId");
    expect(RULES).toContain("samePlant(entry, symptom)");
    expect(TIMELINE).toContain("buildSymptomEvidenceChecklist");
    expect(TIMELINE).toContain("<SymptomEvidenceChecklistCard");
  });

  it("publishes every canonical symptom route", () => {
    for (const path of [
      "cannabis-leaf-symptoms",
      "cannabis-leaves-turning-yellow",
      "cannabis-leaf-spots-lesions",
      "cannabis-burnt-crispy-leaf-tips",
    ]) {
      expect(SITEMAP).toContain(`https://verdantgrowdiary.com/guides/${path}`);
    }
  });
});
