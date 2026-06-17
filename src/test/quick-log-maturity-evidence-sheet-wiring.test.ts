import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SHEET_PATH = join(process.cwd(), "src/components/QuickLogV2Sheet.tsx");

function source() {
  return readFileSync(SHEET_PATH, "utf8");
}

describe("Quick Log maturity evidence sheet wiring", () => {
  it("mounts maturity evidence fields only for plant-scoped non-feed logs", () => {
    const text = source();

    expect(text).toContain("QuickLogMaturityEvidenceFields");
    expect(text).toContain('form.action !== "feed" && resolvedTarget.ok && resolvedTarget.targetType === "plant"');
    expect(text).toContain("visible={showMaturityEvidence}");
  });

  it("builds details before save and forwards them through the existing payload seam", () => {
    const text = source();

    expect(text).toContain("buildQuickLogMaturityEvidenceDetails");
    expect(text).toContain("quickLogMaturityEvidenceReasonToMessage");
    expect(text).toContain("details: maturityEvidence.details");
  });

  it("resets maturity evidence with the Quick Log sheet session", () => {
    const text = source();

    expect(text).toContain("setMaturityEvidenceForm(EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM)");
  });
});
