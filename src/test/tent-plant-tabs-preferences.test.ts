import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readTentPlantTabsSelectedPlantId,
  writeTentPlantTabsSelectedPlantId,
  tentPlantTabsSelectedKey,
} from "@/lib/tentPlantTabsPreferences";

describe("tentPlantTabsPreferences", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* no-op */
    }
  });

  it("defaults to null (All plants) when nothing is stored", () => {
    expect(readTentPlantTabsSelectedPlantId("tent-a")).toBeNull();
  });

  it("persists selected plant id per tent", () => {
    writeTentPlantTabsSelectedPlantId("tent-a", "plant-1");
    expect(readTentPlantTabsSelectedPlantId("tent-a")).toBe("plant-1");
  });

  it("does not leak between tents", () => {
    writeTentPlantTabsSelectedPlantId("tent-a", "plant-1");
    expect(readTentPlantTabsSelectedPlantId("tent-b")).toBeNull();
  });

  it("clearing selection removes the entry", () => {
    writeTentPlantTabsSelectedPlantId("tent-a", "plant-1");
    writeTentPlantTabsSelectedPlantId("tent-a", null);
    expect(readTentPlantTabsSelectedPlantId("tent-a")).toBeNull();
  });

  it("rejects corrupt/empty values and falls back to null", () => {
    const key = tentPlantTabsSelectedKey("tent-a")!;
    window.localStorage.setItem(key, "");
    expect(readTentPlantTabsSelectedPlantId("tent-a")).toBeNull();
    window.localStorage.setItem(key, "   ");
    expect(readTentPlantTabsSelectedPlantId("tent-a")).toBeNull();
    window.localStorage.setItem(key, "x".repeat(500));
    expect(readTentPlantTabsSelectedPlantId("tent-a")).toBeNull();
  });

  it("does not write when tentId is missing or invalid", () => {
    writeTentPlantTabsSelectedPlantId(null, "plant-1");
    writeTentPlantTabsSelectedPlantId(undefined, "plant-1");
    writeTentPlantTabsSelectedPlantId("   ", "plant-1");
    expect(tentPlantTabsSelectedKey(null)).toBeNull();
    expect(tentPlantTabsSelectedKey("   ")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("does not read when tentId is missing", () => {
    expect(readTentPlantTabsSelectedPlantId(null)).toBeNull();
    expect(readTentPlantTabsSelectedPlantId("   ")).toBeNull();
  });

  it("swallows storage errors on read and write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() =>
      writeTentPlantTabsSelectedPlantId("tent-a", "plant-1"),
    ).not.toThrow();
    expect(() =>
      writeTentPlantTabsSelectedPlantId("tent-a", null),
    ).not.toThrow();
    expect(readTentPlantTabsSelectedPlantId("tent-a")).toBeNull();
    vi.restoreAllMocks();
  });

  it("uses the documented per-tent key shape", () => {
    expect(tentPlantTabsSelectedKey("tent-a")).toBe(
      "verdant.tentPlantTabs.selected.v1.tent-a",
    );
  });
});

describe("tentPlantTabsPreferences static safety", () => {
  const content = readFileSync(
    resolve(__dirname, "../lib/tentPlantTabsPreferences.ts"),
    "utf8",
  );

  it("does not import Supabase clients", () => {
    expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(content).not.toMatch(/supabase\.from\(/);
  });

  it("does not import AI/model/alerts/action-queue/device-control surfaces", () => {
    expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
    expect(content).not.toMatch(/actionQueue|action_queue/);
    expect(content).not.toMatch(/deviceControl|device_control/);
  });
});
