import { describe, expect, it } from "vitest";
import {
  bindHarvestCheckHandoffPlant,
  HARVEST_HANDOFF_BIND_RESERVE_BYTES,
  HARVEST_HANDOFF_MAX_BYTES,
  HARVEST_HANDOFF_STORAGE_KEY,
  harvestHandoffByteLength,
  readHarvestCheckHandoff,
  saveHarvestCheckHandoff,
  type HarvestHandoffStorage,
} from "@/lib/harvestCheckHandoffStore";
import { createDefaultHarvestRanges, type HarvestCheck } from "@/lib/harvestWindowRules";

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

function check(photoNote: string): HarvestCheck {
  return {
    id: 1,
    date: "2026-10-20",
    plant: "Plant A",
    clear: 10,
    cloudy: 70,
    amber: 20,
    pistils: "",
    photoNote,
  };
}

const input = (photoNote: string) => ({
  target: "peak" as const,
  ranges: createDefaultHarvestRanges(),
  checks: [check(photoNote)],
});

describe("harvest handoff size cap is measured in UTF-8 bytes", () => {
  it("counts multibyte characters as bytes, not UTF-16 code units", () => {
    expect(harvestHandoffByteLength("abc")).toBe(3);
    expect(harvestHandoffByteLength("é")).toBe(2);
    expect(harvestHandoffByteLength("🌿")).toBe(4);
    expect("🌿".length).toBe(2);
  });

  it("refuses to save a log over the cap in bytes even when it is under in code units", () => {
    const storage = memoryStorage();
    // 20,000 emoji: 40,000 UTF-16 code units, 80,000 UTF-8 bytes.
    const note = "🌿".repeat(20_000);
    expect(note.length).toBeLessThan(
      HARVEST_HANDOFF_MAX_BYTES - HARVEST_HANDOFF_BIND_RESERVE_BYTES,
    );
    expect(saveHarvestCheckHandoff(input(note), NOW, storage)).toBe(false);
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false);
  });

  it("saves a multibyte log just under the byte cap, and binding still fits", () => {
    const storage = memoryStorage();
    const overhead = harvestHandoffByteLength(
      JSON.stringify({
        version: 1,
        createdAt: NOW.toISOString(),
        target: "peak",
        ranges: createDefaultHarvestRanges(),
        checks: [{ ...check(""), id: undefined }],
      }),
    );
    const room = HARVEST_HANDOFF_MAX_BYTES - HARVEST_HANDOFF_BIND_RESERVE_BYTES - overhead;
    const note = "é".repeat(Math.floor(room / 2) - 8);
    expect(saveHarvestCheckHandoff(input(note), NOW, storage)).toBe(true);
    const raw = storage.map.get(HARVEST_HANDOFF_STORAGE_KEY)!;
    expect(harvestHandoffByteLength(raw)).toBeLessThanOrEqual(
      HARVEST_HANDOFF_MAX_BYTES - HARVEST_HANDOFF_BIND_RESERVE_BYTES,
    );
    const handoff = readHarvestCheckHandoff(NOW, storage)!;
    expect(bindHarvestCheckHandoffPlant(handoff, "p".repeat(200), storage)).toBe(true);
  });

  it("drops a stored value over the byte cap on read even when under it in code units", () => {
    const storage = memoryStorage();
    // A well-formed handoff, so only the size check can reject it.
    const raw = JSON.stringify({
      version: 1,
      createdAt: NOW.toISOString(),
      target: "peak",
      ranges: createDefaultHarvestRanges(),
      checks: [{ ...check("🌿".repeat(20_000)), id: undefined }],
    });
    expect(raw.length).toBeLessThanOrEqual(HARVEST_HANDOFF_MAX_BYTES);
    expect(harvestHandoffByteLength(raw)).toBeGreaterThan(HARVEST_HANDOFF_MAX_BYTES);
    storage.map.set(HARVEST_HANDOFF_STORAGE_KEY, raw);
    expect(readHarvestCheckHandoff(NOW, storage)).toBeNull();
    expect(storage.map.has(HARVEST_HANDOFF_STORAGE_KEY)).toBe(false);
  });

  it("refuses to bind an older handoff over a newer one", () => {
    const storage = memoryStorage();
    expect(saveHarvestCheckHandoff(input("old"), NOW, storage)).toBe(true);
    const old = readHarvestCheckHandoff(NOW, storage)!;
    const later = new Date(NOW.getTime() + 60_000);
    expect(saveHarvestCheckHandoff(input("newer"), later, storage)).toBe(true);
    expect(bindHarvestCheckHandoffPlant(old, "plant-1", storage)).toBe(false);
    expect(readHarvestCheckHandoff(later, storage)?.checks[0].photoNote).toBe("newer");
  });
});
