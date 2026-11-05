/**
 * Friction follow-up 2026-11-04, finding #1 (High), Quick Log half: from a
 * grow-scoped page (for example /timeline?growId=<grow>), global Quick Log
 * listed every tent and plant in the account with no grow ordering. A carried
 * growId now groups that grow's targets first. It never selects a target:
 * remembered and only-plant auto-selection stay banned.
 */
import { describe, expect, it } from "vitest";
import {
  buildQuickLogV2TargetOptions,
  partitionQuickLogV2TargetOptionsForGrow,
} from "@/lib/quickLogV2Rules";
import { readQuickLogRouteGrowContextId } from "@/lib/quickLogRouteTargetRules";

const SKUNK = "6b95939b-08eb-41dd-b2c1-b124d899da49";
const QA = "aaaaaaaa-0000-4000-8000-000000000001";
const tents = [
  { id: "t-qa", name: "UX Audit Test Tent", grow_id: QA },
  { id: "t-flower", name: "Flower", grow_id: SKUNK },
  { id: "t-bravo", name: "Vegetation Bravo", grow_id: SKUNK },
];
const plants = [
  { id: "p-qa", name: "QA plant", tent_id: "t-qa", grow_id: QA },
  { id: "p-dolce", name: "Dolce", tent_id: "t-flower", grow_id: SKUNK },
];
const options = buildQuickLogV2TargetOptions(tents, plants, [SKUNK, QA]);

describe("readQuickLogRouteGrowContextId", () => {
  it("reads a normalized UUID growId from the route search", () => {
    expect(readQuickLogRouteGrowContextId(`?growId=${SKUNK.toUpperCase()}`)).toBe(SKUNK);
    expect(readQuickLogRouteGrowContextId(`?tentId=x&growId=${SKUNK}&entry=y`)).toBe(SKUNK);
  });
  it("fails closed on missing, malformed or non-string input", () => {
    expect(readQuickLogRouteGrowContextId("")).toBeNull();
    expect(readQuickLogRouteGrowContextId("?growId=not-a-grow")).toBeNull();
    expect(readQuickLogRouteGrowContextId(undefined)).toBeNull();
  });
});

describe("partitionQuickLogV2TargetOptionsForGrow", () => {
  it("puts the carried grow's tents and plants first and the rest under other", () => {
    const p = partitionQuickLogV2TargetOptionsForGrow(options, SKUNK);
    expect(p.growId).toBe(SKUNK);
    expect(p.inGrow.map((o) => o.id).sort()).toEqual(["p-dolce", "t-bravo", "t-flower"]);
    expect(p.other.map((o) => o.id).sort()).toEqual(["p-qa", "t-qa"]);
  });
  it("keeps every option exactly once", () => {
    const p = partitionQuickLogV2TargetOptionsForGrow(options, SKUNK);
    expect([...p.inGrow, ...p.other].length).toBe(options.length);
  });
  it("does not group when there is no grow, a malformed grow, or a grow with no targets", () => {
    for (const growId of [null, "", "   ", "bbbbbbbb-0000-4000-8000-000000000009"]) {
      const p = partitionQuickLogV2TargetOptionsForGrow(options, growId);
      expect(p.growId).toBeNull();
      expect(p.inGrow).toEqual([]);
      expect(p.other).toEqual(options);
    }
  });
});
