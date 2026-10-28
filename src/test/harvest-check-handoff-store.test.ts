import { describe, expect, it } from "vitest";
import {
  buildHarvestHandoffNote,
  clearHarvestCheckHandoff,
  HARVEST_HANDOFF_MAX_BYTES,
  HARVEST_HANDOFF_RETURN_PATH,
  HARVEST_HANDOFF_STORAGE_KEY,
  HARVEST_HANDOFF_TTL_MS,
  harvestHandoffCountBucket,
  harvestHandoffIdempotencyKey,
  harvestHandoffOccurredAt,
  harvestHandoffSignupHref,
  readHarvestCheckHandoff,
  saveHarvestCheckHandoff,
  type HarvestHandoffStorage,
} from "@/lib/harvestCheckHandoffStore";
import { sanitizeHarvestTrackerAnalyticsParams } from "@/lib/harvestWindowAnalytics";
import {
  createDefaultHarvestRanges,
  HARVEST_WINDOW_CTA_HREF,
  type HarvestCheck,
} from "@/lib/harvestWindowRules";

function memoryStorage(): HarvestHandoffStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const NOW = new Date("2026-10-28T09:00:00.000Z");

function check(id: number, date: string, overrides: Partial<HarvestCheck> = {}): HarvestCheck {
  return {
    id,
    date,
    plant: "Plant A",
    clear: 10,
    cloudy: 70,
    amber: 20,
    pistils: "mostly orange",
    photoNote: "top cola",
    ...overrides,
  };
}

function saveThree(storage: HarvestHandoffStorage) {
  return saveHarvestCheckHandoff(
    {
      target: "peak",
      ranges: createDefaultHarvestRanges(),
      checks: [check(1, "2026-10-20"), check(2, "2026-10-24"), check(3, "2026-10-27")],
    },
    NOW,
    storage,
  );
}

describe("harvest check handoff store", () => {
  it("saves and reads back a versioned handoff without the in-page ids", () => {
    const storage = memoryStorage();
    expect(saveThree(storage)).toBe(true);
    const handoff = readHarvestCheckHandoff(NOW, storage);
    expect(handoff?.version).toBe(1);
    expect(handoff?.createdAt).toBe(NOW.toISOString());
    expect(handoff?.target).toBe("peak");
    expect(handoff?.checks.map((c) => c.date)).toEqual(["2026-10-20", "2026-10-24", "2026-10-27"]);
    expect(handoff?.checks[0]).not.toHaveProperty("id");
    expect([...storage.map.keys()]).toEqual([HARVEST_HANDOFF_STORAGE_KEY]);
  });

  it("never writes for zero checks", () => {
    const storage = memoryStorage();
    expect(
      saveHarvestCheckHandoff(
        { target: "peak", ranges: createDefaultHarvestRanges(), checks: [] },
        NOW,
        storage,
      ),
    ).toBe(false);
    expect(storage.map.size).toBe(0);
  });

  it("removes an expired handoff and keeps one inside the TTL", () => {
    const storage = memoryStorage();
    saveThree(storage);
    expect(
      readHarvestCheckHandoff(new Date(NOW.getTime() + HARVEST_HANDOFF_TTL_MS), storage),
    ).not.toBeNull();
    expect(
      readHarvestCheckHandoff(new Date(NOW.getTime() + HARVEST_HANDOFF_TTL_MS + 1), storage),
    ).toBeNull();
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false);
  });

  it("removes a handoff dated in the future", () => {
    const storage = memoryStorage();
    saveThree(storage);
    expect(readHarvestCheckHandoff(new Date(NOW.getTime() - 1000), storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("removes an oversized value without parsing it", () => {
    const storage = memoryStorage();
    storage.setItem(HARVEST_HANDOFF_STORAGE_KEY, "x".repeat(HARVEST_HANDOFF_MAX_BYTES + 1));
    expect(readHarvestCheckHandoff(NOW, storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it.each([
    ["not JSON", "{"],
    ["wrong version", (h: Record<string, unknown>) => ({ ...h, version: 2 })],
    ["extra key", (h: Record<string, unknown>) => ({ ...h, userId: "u1" })],
    ["unknown target", (h: Record<string, unknown>) => ({ ...h, target: "max" })],
    ["no checks", (h: Record<string, unknown>) => ({ ...h, checks: [] })],
    [
      "rollover date",
      (h: Record<string, unknown>) => ({
        ...h,
        checks: [{ ...(h.checks as Record<string, unknown>[])[0], date: "2026-02-30" }],
      }),
    ],
    [
      "percent over 100",
      (h: Record<string, unknown>) => ({
        ...h,
        checks: [{ ...(h.checks as Record<string, unknown>[])[0], amber: 101 }],
      }),
    ],
    [
      "extra check key",
      (h: Record<string, unknown>) => ({
        ...h,
        checks: [{ ...(h.checks as Record<string, unknown>[])[0], id: 1 }],
      }),
    ],
  ])("ignores and removes a malformed handoff: %s", (_name, mutate) => {
    const storage = memoryStorage();
    saveThree(storage);
    const stored = JSON.parse(storage.getItem(HARVEST_HANDOFF_STORAGE_KEY) as string);
    storage.setItem(
      HARVEST_HANDOFF_STORAGE_KEY,
      typeof mutate === "string" ? mutate : JSON.stringify(mutate(stored)),
    );
    expect(readHarvestCheckHandoff(NOW, storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("clears the key", () => {
    const storage = memoryStorage();
    saveThree(storage);
    clearHarvestCheckHandoff(storage);
    expect(storage.map.size).toBe(0);
  });

  it("survives unavailable storage", () => {
    const throwing: HarvestHandoffStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(saveThree(throwing)).toBe(false);
    expect(readHarvestCheckHandoff(NOW, throwing)).toBeNull();
    expect(() => clearHarvestCheckHandoff(throwing)).not.toThrow();
  });

  it("adds a known return path to the unchanged signup URL", () => {
    const href = harvestHandoffSignupHref(HARVEST_WINDOW_CTA_HREF);
    expect(href.startsWith(HARVEST_WINDOW_CTA_HREF)).toBe(true);
    expect(new URLSearchParams(href.split("?")[1]).get("redirectTo")).toBe(
      HARVEST_HANDOFF_RETURN_PATH,
    );
  });

  it("buckets counts and keys each check deterministically", () => {
    expect([1, 2, 5, 6, 20, 21].map(harvestHandoffCountBucket)).toEqual([
      "1",
      "2-5",
      "2-5",
      "6-20",
      "6-20",
      "21+",
    ]);
    const key = harvestHandoffIdempotencyKey({ createdAt: NOW.toISOString() }, "plant-1", 2);
    expect(key).toBe(harvestHandoffIdempotencyKey({ createdAt: NOW.toISOString() }, "plant-1", 2));
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(200);
    expect(harvestHandoffOccurredAt("2026-10-20")).toBe("2026-10-20T12:00:00.000Z");
  });

  it("builds the note text from the check, skipping empty fields", () => {
    expect(
      buildHarvestHandoffNote({
        date: "2026-10-20",
        plant: "",
        clear: 10,
        cloudy: 70,
        amber: 20,
        pistils: "",
        photoNote: "",
      }),
    ).toBe("Trichome check (Harvest Window Tracker): clear 10%, cloudy 70%, amber 20%.");
  });

  it("sends only a known count bucket in analytics", () => {
    expect(sanitizeHarvestTrackerAnalyticsParams({ count_bucket: "2-5" })).toEqual({
      count_bucket: "2-5",
    });
    expect(sanitizeHarvestTrackerAnalyticsParams({ count_bucket: "Plant A" as never })).toEqual({});
  });
});
