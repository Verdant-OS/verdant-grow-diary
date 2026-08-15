import { describe, it, expect } from "vitest";
import {
  pickAiDoctorSessionLoopHandoffIds,
  pickFirstLoadedId,
  pickSoleLoadedId,
} from "@/lib/oneTentLoopHandoffIds";

describe("pickSoleLoadedId", () => {
  it("returns the sole non-empty id", () => {
    expect(pickSoleLoadedId(["t1"])).toBe("t1");
    expect(pickSoleLoadedId(["  t1  ", "t1", null, ""])).toBe("t1");
  });

  it("returns null when zero or many unique ids are present", () => {
    expect(pickSoleLoadedId([])).toBeNull();
    expect(pickSoleLoadedId([null, "  ", undefined])).toBeNull();
    expect(pickSoleLoadedId(["t1", "t2"])).toBeNull();
  });

  it("does not invent a default among many tents", () => {
    expect(pickSoleLoadedId(["tent-a", "tent-b", "tent-a"])).toBeNull();
  });
});

describe("pickFirstLoadedId", () => {
  it("returns the first non-empty id in priority order", () => {
    expect(pickFirstLoadedId([null, "  ", "focus-1", "highlight-2"])).toBe("focus-1");
  });

  it("returns null when nothing is selected", () => {
    expect(pickFirstLoadedId([null, "", undefined])).toBeNull();
  });
});

describe("pickAiDoctorSessionLoopHandoffIds", () => {
  it("passes plant/grow/tent only when every visible row agrees", () => {
    expect(
      pickAiDoctorSessionLoopHandoffIds([
        { plant_id: "p1", tent_id: "t1", grow_id: "g1" },
        { plant_id: "p1", tent_id: "t1", grow_id: "g1" },
      ]),
    ).toEqual({
      plantId: "p1",
      tentId: "t1",
      growId: "g1",
      alertId: null,
    });
  });

  it("keeps Review-alerts fallback when plants disagree or alert_id is absent", () => {
    expect(
      pickAiDoctorSessionLoopHandoffIds([
        { plant_id: "p1", grow_id: "g1" },
        { plant_id: "p2", grow_id: "g1" },
      ]),
    ).toEqual({
      plantId: null,
      tentId: null,
      growId: "g1",
      alertId: null,
    });
  });

  it("passes alertId only when a visible row actually carries one", () => {
    expect(
      pickAiDoctorSessionLoopHandoffIds([{ plant_id: "p1", alert_id: "a1" }]),
    ).toEqual({
      plantId: "p1",
      tentId: null,
      growId: null,
      alertId: "a1",
    });
  });
});
