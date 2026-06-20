import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readTentPlantRosterIncludeArchived,
  writeTentPlantRosterIncludeArchived,
  tentPlantRosterIncludeArchivedKey,
} from "@/lib/tentPlantRosterPreferences";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("tentPlantRosterPreferences", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* no-op */
    }
  });

  it("defaults to false when nothing is stored", () => {
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(false);
  });

  it("stores true for one tent", () => {
    writeTentPlantRosterIncludeArchived("tent-a", true);
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(true);
  });

  it("restores true for same tent on subsequent reads", () => {
    writeTentPlantRosterIncludeArchived("tent-a", true);
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(true);
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(true);
  });

  it("does not leak between tents", () => {
    writeTentPlantRosterIncludeArchived("tent-a", true);
    expect(readTentPlantRosterIncludeArchived("tent-b")).toBe(false);
  });

  it("rejects corrupt/invalid values and falls back to false", () => {
    const key = tentPlantRosterIncludeArchivedKey("tent-a")!;
    window.localStorage.setItem(key, "yes");
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(false);
    window.localStorage.setItem(key, "{}");
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(false);
    window.localStorage.setItem(key, "1");
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(false);
  });

  it("does not write when tentId is missing or invalid", () => {
    writeTentPlantRosterIncludeArchived(null, true);
    writeTentPlantRosterIncludeArchived(undefined, true);
    writeTentPlantRosterIncludeArchived("   ", true);
    expect(tentPlantRosterIncludeArchivedKey(null)).toBeNull();
    expect(tentPlantRosterIncludeArchivedKey("   ")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("swallows storage errors on read and write", () => {
    const original = window.localStorage.getItem;
    const setOriginal = window.localStorage.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() =>
      writeTentPlantRosterIncludeArchived("tent-a", true),
    ).not.toThrow();
    expect(readTentPlantRosterIncludeArchived("tent-a")).toBe(false);
    vi.restoreAllMocks();
    void original;
    void setOriginal;
  });

  it("uses the documented per-tent key shape", () => {
    expect(tentPlantRosterIncludeArchivedKey("tent-a")).toBe(
      "verdant.tentPlantRoster.includeArchived.v1.tent-a",
    );
  });
});

describe("tentPlantRosterPreferences static safety", () => {
  const content = readFileSync(
    resolve(__dirname, "../lib/tentPlantRosterPreferences.ts"),
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
