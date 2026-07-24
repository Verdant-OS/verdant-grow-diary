import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUICK_LOG_SUCCESS_EVENT_TYPES,
  QUICK_LOG_SUCCESS_INPUTS,
  isQuickLogSuccessInput,
  resolveQuickLogSuccessEventType,
  trackQuickLogSuccess,
} from "@/lib/quickLogSuccessTelemetry";

const win = window as unknown as { gtag?: (...args: unknown[]) => void };

afterEach(() => {
  delete win.gtag;
});

describe("Quick Log success event type — closed mapping", () => {
  it("pins the complete non-content input and output enums", () => {
    expect([...QUICK_LOG_SUCCESS_INPUTS]).toEqual([
      "note",
      "observation",
      "water",
      "watering",
      "feed",
      "feeding",
      "photo",
      "environment",
      "environment_check",
      "training",
      "defoliation",
      "issue_observation",
      "harvest",
      "plant_quick_log",
    ]);
    expect([...QUICK_LOG_SUCCESS_EVENT_TYPES]).toEqual([
      "note",
      "water",
      "feed",
      "photo",
      "environment",
      "training",
      "defoliation",
      "observation",
      "harvest",
      "plant_check",
    ]);
  });

  it.each([
    ["note", "note"],
    ["observation", "observation"],
    ["water", "water"],
    ["watering", "water"],
    ["feed", "feed"],
    ["feeding", "feed"],
    ["photo", "photo"],
    ["environment", "environment"],
    ["environment_check", "environment"],
    ["training", "training"],
    ["defoliation", "defoliation"],
    ["issue_observation", "observation"],
    ["harvest", "harvest"],
    ["plant_quick_log", "plant_check"],
  ])("maps %s to %s", (input, expected) => {
    expect(isQuickLogSuccessInput(input)).toBe(true);
    expect(resolveQuickLogSuccessEventType(input)).toBe(expected);
  });

  it.each([
    "manual_sensor_snapshot",
    "video",
    "Watered 500 ml",
    "Bruce Banner #4",
    "plant-123",
    "",
    null,
    undefined,
    42,
    { event_type: "water", note: "private" },
  ])("fails closed for %j", (input) => {
    expect(isQuickLogSuccessInput(input)).toBe(false);
    expect(resolveQuickLogSuccessEventType(input)).toBeNull();
  });
});

describe("trackQuickLogSuccess", () => {
  it("emits exactly one sanitized funnel call for a confirmed success", () => {
    const gtag = vi.fn();
    win.gtag = gtag;

    expect(trackQuickLogSuccess("feeding")).toBe(true);

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "quick_log_saved", {
      event_type: "feed",
    });
  });

  it("emits zero calls for a replay or an input outside the closed map", () => {
    const gtag = vi.fn();
    win.gtag = gtag;

    expect(trackQuickLogSuccess("training", { reused: true })).toBe(false);
    expect(trackQuickLogSuccess("grower private note" as unknown)).toBe(false);

    expect(gtag).not.toHaveBeenCalled();
  });
});
