import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalStorageForTest,
  ensureLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";
import {
  DEFAULT_START_SCREEN,
  START_SCREEN_OPTIONS,
  clearStartScreenChoice,
  consumeQuickLogStartIntent,
  getStartScreenChoice,
  routeForStartScreen,
  setStartScreenChoice,
} from "@/lib/startScreenPreferences";

beforeEach(() => {
  try {
    clearLocalStorageForTest();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(setStartScreenChoice("user-1", "timeline")).toBe(true);
    expect(setStartScreenChoice("user-2", "dashboard")).toBe(true);
    expect(getStartScreenChoice("user-1")).toBe("timeline");
    expect(getStartScreenChoice("user-2")).toBe("dashboard");
    expect(getStartScreenChoice("user-3")).toBeNull();
  });

  it("clears safely", () => {
    setStartScreenChoice("user-1", "timeline");
    expect(clearStartScreenChoice("user-1")).toBe(true);
    expect(getStartScreenChoice("user-1")).toBeNull();
  });

  it("rejects unsafe userId characters", () => {
    expect(setStartScreenChoice("../evil", "timeline")).toBe(false);
    expect(getStartScreenChoice("../evil")).toBeNull();
  });

  it("reports a failed write instead of claiming the preference persisted", () => {
    const storage = ensureLocalStorageForTest();
    const storagePrototype = Object.getPrototypeOf(storage) as Storage;
    vi.spyOn(storagePrototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(setStartScreenChoice("user-1", "timeline")).toBe(false);
    expect(getStartScreenChoice("user-1")).toBeNull();
  });

  it("reports a failed reset and preserves the stored preference", () => {
    expect(setStartScreenChoice("user-1", "timeline")).toBe(true);
    const storage = ensureLocalStorageForTest();
    const storagePrototype = Object.getPrototypeOf(storage) as Storage;
    vi.spyOn(storagePrototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(clearStartScreenChoice("user-1")).toBe(false);
    expect(getStartScreenChoice("user-1")).toBe("timeline");
  });

  it("ignores tampered stored values", () => {
    setLocalStorageItemForTest(
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
    expect(routeForStartScreen("quickLog")).toBe("/dashboard?open=quick-log");
    expect(routeForStartScreen("timeline")).toBe("/timeline");
    expect(routeForStartScreen("dashboard")).toBe("/");
    expect(routeForStartScreen("onboarding")).toBe("/onboarding");
    expect(routeForStartScreen("welcome")).toBe("/welcome");
  });

  it("consumes the one-shot Quick Log intent and preserves unrelated query params", () => {
    expect(consumeQuickLogStartIntent("?open=quick-log")).toBe("");
    expect(consumeQuickLogStartIntent("?grow=recent&open=quick-log&utm=owned")).toBe(
      "?grow=recent&utm=owned",
    );
    expect(consumeQuickLogStartIntent("?open=dashboard")).toBeNull();
    expect(consumeQuickLogStartIntent("")).toBeNull();
  });
});
