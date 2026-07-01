/**
 * Verdant Quick Log Activity Types v1a — saved-items extension.
 *
 * Ensures buildDailyCheckSavedItems accepts the full v1a activity source
 * set (still gated on a confirmed submittedAt), and never returns a
 * Harvest item.
 */
import { describe, it, expect } from "vitest";
import {
  buildDailyCheckSavedItems,
  DAILY_CHECK_SAVED_ITEM_MANUAL_SNAPSHOT_LABEL,
  type DailyCheckSavedSource,
} from "@/lib/dailyCheckPostSubmitRules";

const TS = 1_700_000_000_000;

describe("buildDailyCheckSavedItems (v1a activity source extension)", () => {
  it.each([
    ["photo", "photo", "Photo"],
    ["watering", "watering", "Watering"],
    ["feeding", "feeding", "Feeding"],
    ["environment_check", "environment_check", "Environment check"],
    ["training", "training", "Training"],
    ["defoliation", "defoliation", "Defoliation"],
    ["issue_observation", "issue_observation", "Issue / observation"],
  ] as const)(
    "returns [%s] item on confirmed save",
    (_name, source, label) => {
      const items = buildDailyCheckSavedItems({
        source: source as DailyCheckSavedSource,
        submittedAt: TS,
      });
      expect(items).toHaveLength(1);
      expect(items[0].key).toBe(source);
      expect(items[0].label).toBe(label);
    },
  );

  it("manual sensor keeps manual/not-live wording", () => {
    const [item] = buildDailyCheckSavedItems({
      source: "sensor",
      submittedAt: TS,
    });
    expect(item.label).toBe(DAILY_CHECK_SAVED_ITEM_MANUAL_SNAPSHOT_LABEL);
  });

  it("recognizes harvest (v1b) and returns 'Harvest' saved-item label", () => {
    const items = buildDailyCheckSavedItems({
      source: "harvest",
      submittedAt: TS,
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("harvest");
    expect(items[0].label).toBe("Harvest");
  });

  it("returns [] for empty/unknown sources", () => {
    expect(
      buildDailyCheckSavedItems({
        source: "" as unknown as DailyCheckSavedSource,
        submittedAt: TS,
      }),
    ).toEqual([]);
    expect(
      buildDailyCheckSavedItems({
        source: "totally_bogus" as unknown as DailyCheckSavedSource,
        submittedAt: TS,
      }),
    ).toEqual([]);
  });

  it("still gates on a finite submittedAt", () => {
    expect(
      buildDailyCheckSavedItems({ source: "feeding", submittedAt: null }),
    ).toEqual([]);
    expect(
      buildDailyCheckSavedItems({ source: "training", submittedAt: NaN }),
    ).toEqual([]);
  });

  it("no returned label contains recommendation/diagnosis/readiness language", () => {
    const sources: DailyCheckSavedSource[] = [
      "note",
      "sensor",
      "photo",
      "watering",
      "feeding",
      "environment_check",
      "training",
      "defoliation",
      "issue_observation",
    ];
    for (const s of sources) {
      const [item] = buildDailyCheckSavedItems({
        source: s,
        submittedAt: TS,
      });
      const label = item.label.toLowerCase();
      expect(label).not.toMatch(/\brecommend/);
      expect(label).not.toMatch(/\bdiagnos/);
      expect(label).not.toMatch(/\bhealthy\b/);
      expect(label).not.toMatch(/\bready to harvest\b/);
    }
  });
});
