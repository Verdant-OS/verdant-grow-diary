import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGACY_ACTIVE_GROW_STORAGE_KEY,
  activeGrowStorageKey,
  readScopedActiveGrowId,
  writeActiveGrowId,
  migrateLegacyActiveGrowIfOwned,
  resolveActiveGrowAfterLoad,
} from "@/lib/activeGrowStorageRules";

const ROOT = resolve(__dirname, "../..");

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    snapshot: () => Object.fromEntries(map.entries()),
  };
}

describe("activeGrowStorageRules", () => {
  it("builds per-user keys", () => {
    expect(activeGrowStorageKey("user-a")).toBe("verdant.activeGrow.user-a");
    expect(activeGrowStorageKey(null)).toBeNull();
    expect(activeGrowStorageKey("  ")).toBeNull();
  });

  it("reads only the scoped key", () => {
    const s = memoryStorage({
      [LEGACY_ACTIVE_GROW_STORAGE_KEY]: "legacy-grow",
      "verdant.activeGrow.user-a": "scoped-grow",
    });
    expect(readScopedActiveGrowId("user-a", s)).toBe("scoped-grow");
    expect(readScopedActiveGrowId("user-b", s)).toBeNull();
  });

  it("write persists scoped key and clears bare legacy key", () => {
    const s = memoryStorage({ [LEGACY_ACTIVE_GROW_STORAGE_KEY]: "old" });
    writeActiveGrowId({ userId: "user-a", growId: "g1", storage: s });
    expect(s.snapshot()).toEqual({ "verdant.activeGrow.user-a": "g1" });
    writeActiveGrowId({ userId: "user-a", growId: null, storage: s });
    expect(s.snapshot()).toEqual({});
  });

  it("migrates bare key only when grow is owned", () => {
    const s = memoryStorage({ [LEGACY_ACTIVE_GROW_STORAGE_KEY]: "g-owned" });
    const migrated = migrateLegacyActiveGrowIfOwned({
      userId: "user-a",
      ownedGrowIds: ["g-owned", "g2"],
      storage: s,
      currentActiveGrowId: null,
    });
    expect(migrated).toBe("g-owned");
    expect(s.snapshot()).toEqual({ "verdant.activeGrow.user-a": "g-owned" });
  });

  it("drops bare key when grow is not owned", () => {
    const s = memoryStorage({ [LEGACY_ACTIVE_GROW_STORAGE_KEY]: "g-other" });
    const migrated = migrateLegacyActiveGrowIfOwned({
      userId: "user-a",
      ownedGrowIds: ["g1"],
      storage: s,
      currentActiveGrowId: null,
    });
    expect(migrated).toBeNull();
    expect(s.snapshot()).toEqual({});
  });

  it("resolve after load falls back to first owned grow", () => {
    const s = memoryStorage();
    expect(
      resolveActiveGrowAfterLoad({
        userId: "u",
        ownedGrowIds: ["a", "b"],
        currentActiveGrowId: "missing",
        storage: s,
      }),
    ).toBe("a");
  });

  it("resolve keeps current when still owned", () => {
    const s = memoryStorage({ "verdant.activeGrow.u": "b" });
    expect(
      resolveActiveGrowAfterLoad({
        userId: "u",
        ownedGrowIds: ["a", "b"],
        currentActiveGrowId: "b",
        storage: s,
      }),
    ).toBe("b");
  });
});

describe("GrowsProvider wiring", () => {
  const SRC = readFileSync(resolve(ROOT, "src/store/grows.tsx"), "utf8");

  it("uses pure storage rules (scoped key + migration)", () => {
    expect(SRC).toMatch(/readScopedActiveGrowId/);
    expect(SRC).toMatch(/writeActiveGrowId/);
    expect(SRC).toMatch(/resolveActiveGrowAfterLoad/);
    expect(SRC).toMatch(/key=\{user\?\.id/);
  });

  it("does not read the bare key directly", () => {
    expect(SRC).not.toMatch(/getItem\(["']verdant\.activeGrow["']\)/);
  });
});
