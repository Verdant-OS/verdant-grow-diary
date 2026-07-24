import { describe, expect, it } from "vitest";

import {
  PLANT_DETAIL_HARVEST_EVIDENCE_ANCHOR_ID,
  resolvePlantDetailDisclosureGroup,
  resolvePlantDetailDisclosureTarget,
} from "@/lib/plantDetailDisclosureRules";

describe("plantDetailDisclosureRules", () => {
  it.each([
    ["plant-overview", null],
    ["plant-photos", null],
    ["plant-relative-timeline", "history"],
    ["plant-recent-activity", "history"],
    ["plant-alerts", null],
    ["plant-actions", null],
    ["plant-doctor", "ai"],
    ["plant-ai-doctor-review", "ai"],
    ["plant-ai-doctor-context-panel", "ai"],
    [PLANT_DETAIL_HARVEST_EVIDENCE_ANCHOR_ID, "harvest"],
  ] as const)("maps %s to %s", (anchorId, expectedGroup) => {
    expect(resolvePlantDetailDisclosureTarget(anchorId)).toEqual({
      anchorId,
      group: expectedGroup,
    });
    expect(resolvePlantDetailDisclosureGroup(anchorId)).toBe(expectedGroup);
    expect(resolvePlantDetailDisclosureTarget(`#${anchorId}`)).toEqual({
      anchorId,
      group: expectedGroup,
    });
  });

  it.each([
    null,
    undefined,
    "",
    "#",
    "unknown",
    "#unknown",
    " plant-overview",
    "plant-overview ",
    "plant%2Doverview",
    "#plant%2Doverview",
    "plant/overview",
    "##plant-overview",
    "#plant-overview#extra",
    "plant-overview\n",
    "plant-overview\u0000",
    42,
    {},
  ])("fails closed for malformed target %j", (target) => {
    expect(resolvePlantDetailDisclosureTarget(target)).toBeNull();
    expect(resolvePlantDetailDisclosureGroup(target)).toBeNull();
  });

  it("is deterministic and null-safe", () => {
    const input = "#plant-ai-doctor-review";
    expect(resolvePlantDetailDisclosureTarget(input)).toEqual(
      resolvePlantDetailDisclosureTarget(input),
    );
    expect(() => resolvePlantDetailDisclosureTarget(null)).not.toThrow();
  });
});
