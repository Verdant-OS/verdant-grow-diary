import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_START_SCREEN,
  START_SCREEN_OPTIONS,
  clearStartScreenChoice,
  getStartScreenChoice,
  routeForStartScreen,
  setStartScreenChoice,
} from "@/lib/startScreenPreferences";

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("startScreenPreferences", () => {
  it("defaults to quickLog (diary-first)", () => {
    expect(DEFAULT_START_SCREEN).toBe("quickLog");
    expect(START_SCREEN_OPTIONS[0].key).toBe("quickLog");
    expect(START_SCREEN_OPTIONS[0].recommended).toBe(true);
  });

  it("returns null when no preference is saved", () => {
    expect(getStartScreenChoice("user-1")).toBeNull();
  });

  it("persists and reads back a valid choice per-user", () => {
    setStartScreenChoice("user-1", "timeline");
    setStartScreenChoice("user-2", "dashboard");
    expect(getStartScreenChoice("user-1")).toBe("timeline");
    expect(getStartScreenChoice("user-2")).toBe("dashboard");
    expect(getStartScreenChoice("user-3")).toBeNull();
  });

  it("clears safely", () => {
    setStartScreenChoice("user-1", "timeline");
    clearStartScreenChoice("user-1");
    expect(getStartScreenChoice("user-1")).toBeNull();
  });

  it("rejects unsafe userId characters", () => {
    setStartScreenChoice("../evil", "timeline");
    expect(getStartScreenChoice("../evil")).toBeNull();
  });

  it("ignores tampered stored values", () => {
    window.localStorage.setItem(
      "verdant:startScreen:user-1",
      JSON.stringify({ access_token: "leak" }),
    );
    expect(getStartScreenChoice("user-1")).toBeNull();
  });

  it("routes only to internal sanitized paths", () => {
    for (const opt of START_SCREEN_OPTIONS) {
      const r = routeForStartScreen(opt.key);
      expect(r.startsWith("/")).toBe(true);
      expect(r.startsWith("//")).toBe(false);
      expect(r).not.toMatch(/^https?:/);
    }
    expect(routeForStartScreen("quickLog")).toBe("/");
    expect(routeForStartScreen("timeline")).toBe("/timeline");
    expect(routeForStartScreen("dashboard")).toBe("/");
    expect(routeForStartScreen("onboarding")).toBe("/onboarding");
    expect(routeForStartScreen("welcome")).toBe("/welcome");
  });
});
