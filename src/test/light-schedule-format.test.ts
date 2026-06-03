import { describe, it, expect } from "vitest";
import {
  formatLightSchedule,
  formatTentLightStatus,
  parseLightSchedule,
} from "@/lib/lightScheduleFormat";

describe("lightScheduleFormat", () => {
  it.each([
    ["12/12", { onHours: 12, offHours: 12 }],
    ["18/6", { onHours: 18, offHours: 6 }],
    ["20/4", { onHours: 20, offHours: 4 }],
    ["24/0", { onHours: 24, offHours: 0 }],
  ])("parses %s", (input, parts) => {
    expect(parseLightSchedule(input)).toEqual(parts);
  });

  it("rejects malformed or impossible schedules", () => {
    expect(parseLightSchedule(null)).toBeNull();
    expect(parseLightSchedule("")).toBeNull();
    expect(parseLightSchedule("12-12")).toBeNull();
    expect(parseLightSchedule("13/12")).toBeNull(); // doesn't sum to 24
    expect(parseLightSchedule("foo")).toBeNull();
  });

  it("formats schedules with explicit light/dark label", () => {
    expect(formatLightSchedule("12/12")).toBe("12/12 (light/dark)");
    expect(formatLightSchedule("18/6")).toBe("18/6 (light/dark)");
    expect(formatLightSchedule("20/4")).toBe("20/4 (light/dark)");
    expect(formatLightSchedule("24/0")).toBe("24/0 (light/dark)");
    expect(formatLightSchedule(null)).toBe("Schedule unknown");
  });

  it("formats the tent card status line", () => {
    expect(formatTentLightStatus({ on: false, schedule: "12/12" })).toBe("Off");
    expect(formatTentLightStatus({ on: true, schedule: "12/12" })).toBe(
      "On · 12/12 (light/dark)",
    );
    expect(formatTentLightStatus({ on: true, schedule: null })).toBe("On");
  });
});
