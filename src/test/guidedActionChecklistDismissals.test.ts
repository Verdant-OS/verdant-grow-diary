import { beforeEach, describe, expect, it } from "vitest";
import {
  DISMISS_TTL_MS,
  clearAllDismissals,
  dismissItem,
  readActiveDismissals,
} from "@/lib/guidedActionChecklistDismissals";

describe("guidedActionChecklistDismissals", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty when nothing is stored", () => {
    expect(readActiveDismissals()).toEqual([]);
  });

  it("stores and returns dismissed ids", () => {
    dismissItem("sensor:t1", 1_000);
    dismissItem("cadence:water:p1", 2_000);
    expect(readActiveDismissals(3_000).sort()).toEqual(
      ["cadence:water:p1", "sensor:t1"],
    );
  });

  it("prunes entries beyond the TTL", () => {
    dismissItem("sensor:t1", 0);
    const later = DISMISS_TTL_MS + 1_000;
    expect(readActiveDismissals(later)).toEqual([]);
  });

  it("deduplicates when the same id is dismissed twice", () => {
    dismissItem("sensor:t1", 1_000);
    dismissItem("sensor:t1", 2_000);
    expect(readActiveDismissals(3_000)).toEqual(["sensor:t1"]);
  });

  it("clearAllDismissals wipes storage", () => {
    dismissItem("sensor:t1", 1_000);
    clearAllDismissals();
    expect(readActiveDismissals(2_000)).toEqual([]);
  });

  it("ignores malformed stored payload", () => {
    window.localStorage.setItem(
      "verdant.guidedActionChecklist.dismissedV1",
      "not json",
    );
    expect(readActiveDismissals()).toEqual([]);
  });
});
