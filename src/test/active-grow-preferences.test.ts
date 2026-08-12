import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTIVE_GROW_LEGACY_KEY,
  ACTIVE_GROW_KEY_PREFIX,
  activeGrowStorageKey,
  getStoredActiveGrowId,
  setStoredActiveGrowId,
  clearStoredActiveGrowId,
  isValidActiveGrowId,
} from "@/lib/activeGrowPreferences";

const ROOT = resolve(__dirname, "../..");

describe("activeGrowPreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("builds user-scoped keys", () => {
    expect(activeGrowStorageKey("user-1")).toBe(`${ACTIVE_GROW_KEY_PREFIX}user-1`);
    expect(activeGrowStorageKey("")).toBeNull();
    expect(activeGrowStorageKey(null)).toBeNull();
  });

  it("validates grow ids", () => {
    expect(isValidActiveGrowId("75539230-faa0-4e3e-9eac-4947026f2a1e")).toBe(true);
    expect(isValidActiveGrowId("")).toBe(false);
    expect(isValidActiveGrowId("x")).toBe(false);
  });

  it("reads and writes scoped storage", () => {
    setStoredActiveGrowId("u1", "grow-aaaa-bbbb-cccc-dddddddddddd");
    expect(getStoredActiveGrowId("u1")).toBe("grow-aaaa-bbbb-cccc-dddddddddddd");
    expect(localStorage.getItem(ACTIVE_GROW_LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(activeGrowStorageKey("u1")!)).toBe(
      "grow-aaaa-bbbb-cccc-dddddddddddd",
    );
  });

  it("isolates two users on the same browser", () => {
    setStoredActiveGrowId("alice", "grow-alice-1111-2222-333333333333");
    setStoredActiveGrowId("bob", "grow-bobbb-1111-2222-333333333333");
    expect(getStoredActiveGrowId("alice")).toBe("grow-alice-1111-2222-333333333333");
    expect(getStoredActiveGrowId("bob")).toBe("grow-bobbb-1111-2222-333333333333");
  });

  it("migrates bare legacy key into the user key on read", () => {
    localStorage.setItem(ACTIVE_GROW_LEGACY_KEY, "grow-legacy-1111-2222-333333333333");
    expect(getStoredActiveGrowId("u-mig")).toBe("grow-legacy-1111-2222-333333333333");
    expect(localStorage.getItem(activeGrowStorageKey("u-mig")!)).toBe(
      "grow-legacy-1111-2222-333333333333",
    );
  });

  it("write clears legacy bare key to stop cross-account bleed", () => {
    localStorage.setItem(ACTIVE_GROW_LEGACY_KEY, "grow-olddd-1111-2222-333333333333");
    setStoredActiveGrowId("u2", "grow-newww-1111-2222-333333333333");
    expect(localStorage.getItem(ACTIVE_GROW_LEGACY_KEY)).toBeNull();
    expect(getStoredActiveGrowId("u2")).toBe("grow-newww-1111-2222-333333333333");
  });

  it("clear removes scoped key", () => {
    setStoredActiveGrowId("u3", "grow-clear-1111-2222-333333333333");
    clearStoredActiveGrowId("u3");
    expect(getStoredActiveGrowId("u3")).toBeNull();
  });
});

describe("GrowsProvider wiring", () => {
  const SRC = readFileSync(resolve(ROOT, "src/store/grows.tsx"), "utf8");

  it("uses activeGrowPreferences helpers (no bare-only localStorage)", () => {
    expect(SRC).toMatch(/getStoredActiveGrowId/);
    expect(SRC).toMatch(/setStoredActiveGrowId/);
    expect(SRC).not.toMatch(/localStorage\.getItem\("verdant\.activeGrow"\)/);
    expect(SRC).not.toMatch(/localStorage\.setItem\("verdant\.activeGrow"/);
  });
});
