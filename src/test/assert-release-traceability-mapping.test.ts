import { describe, it, expect } from "vitest";
import {
  REQUIRED_MAPPINGS,
  REQUIRED_RULES,
  checkMappings,
} from "../../scripts/assert-release-traceability-mapping.mjs";

const FULL_TABLE = `
## 12. Cross-Sheet Traceability Mapping

| From | To | Required for |
|---|---|---|
| \`Seed_Production_Tracking.A Seed Lot ID\` | \`Commercial_Release_Review_Traceability.C Seed Lot ID\` | x |
| \`Seed_Production_Tracking.Y Linked Commercial Checklist Row\` | \`Commercial_Release_Checklist.Row ID / Checklist ID\` | x |
| \`Commercial_Release_Review_Traceability.I Linked Commercial Release Checklist Row\` | \`Commercial_Release_Checklist.Row ID / Checklist ID\` | x |
| \`Commercial_Release_Review_Traceability.J Linked Pheno Comparison Row(s)\` | \`Pheno_Comparison_v2_Enhanced.Phase/Pheno Row ID\` or \`Pheno ID\` | x |
| \`Commercial_Release_Review_Traceability.K Linked F1 / Backcross / Stabilization Row(s)\` | one or more of \`F1_Population_Tracker.Project or Row ID\`, \`Backcross_Line_Development.Backcross Line ID\`, \`F2_Stabilization_Tracker.Line ID\` | x |
| \`Commercial_Release_Review_Traceability.AD Verdant Diary Evidence\` | Verdant diary entry references | x |
| \`Commercial_Release_Review_Traceability.AE Verdant Action Queue Draft\` | draft text only | must not create Action Queue items automatically |
`;

describe("assert-release-traceability-mapping", () => {
  it("passes when all 7 required mappings are present", () => {
    expect(checkMappings(FULL_TABLE)).toEqual([]);
  });

  it("flags missing Seed Lot ID mapping", () => {
    const partial = FULL_TABLE.split("\n")
      .filter((l) => !/A Seed Lot ID/.test(l))
      .join("\n");
    const missing = checkMappings(partial);
    expect(missing.some((m) => /Seed Lot ID/.test(m))).toBe(true);
  });

  it("flags missing Action Queue draft-only mapping", () => {
    const partial = FULL_TABLE.split("\n")
      .filter((l) => !/AE Verdant Action Queue Draft/.test(l))
      .join("\n");
    const missing = checkMappings(partial);
    expect(missing.some((m) => /Action Queue Draft/.test(m))).toBe(true);
  });

  it("declares Missing Evidence Count rule and Action-Queue safety rule", () => {
    const labels = REQUIRED_RULES.map((r) => r.label).join(" | ");
    expect(labels).toMatch(/Missing Evidence Count/);
    expect(labels).toMatch(/Action Queue items must not be created automatically/);
  });

  it("publishes all 7 required mapping contracts", () => {
    expect(REQUIRED_MAPPINGS).toHaveLength(7);
  });
});
