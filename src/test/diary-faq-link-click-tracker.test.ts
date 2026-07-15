/**
 * diaryFaqLinkClickTracker tests — pure storage helpers.
 * Verifies non-identifying payload shape, sanitization of tampered
 * values, deterministic ranking, and safe no-op behavior when storage
 * is unavailable.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDiaryFaqLinkClickCounts,
  DIARY_FAQ_LINK_CLICKS_STORAGE_KEY,
  DIARY_FAQ_TOPIC_LABELS,
  rankDiaryFaqLinkClicks,
  readDiaryFaqLinkClickCounts,
  recordDiaryFaqLinkClick,
  type DiaryFaqLinkClickStorage,
} from "@/lib/diaryFaqLinkClickTracker";

function makeMemoryStorage(): DiaryFaqLinkClickStorage & {
  readonly data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

describe("diaryFaqLinkClickTracker", () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  beforeEach(() => {
    storage = makeMemoryStorage();
  });

  it("returns {} when storage is empty", () => {
    expect(readDiaryFaqLinkClickCounts(storage)).toEqual({});
  });

  it("increments and persists a topic count", () => {
    recordDiaryFaqLinkClick("yellowing", storage);
    recordDiaryFaqLinkClick("yellowing", storage);
    recordDiaryFaqLinkClick("environment", storage);
    const counts = readDiaryFaqLinkClickCounts(storage);
    expect(counts).toEqual({ yellowing: 2, environment: 1 });
  });

  it("stores only { topic -> integer } — no identifying fields", () => {
    recordDiaryFaqLinkClick("watering", storage);
    const raw = storage.data.get(DIARY_FAQ_LINK_CLICKS_STORAGE_KEY);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw as string);
    // Only known topic keys, only numeric values.
    for (const [k, v] of Object.entries(parsed)) {
      expect(k in DIARY_FAQ_TOPIC_LABELS).toBe(true);
      expect(typeof v).toBe("number");
    }
    // Explicitly assert no identifier-shaped keys.
    for (const forbidden of [
      "userId",
      "user_id",
      "plantId",
      "entryId",
      "tentId",
      "note",
      "timestamp",
      "sessionId",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(parsed, forbidden)).toBe(
        false,
      );
    }
  });

  it("sanitizes tampered payloads (unknown keys, negatives, non-numbers)", () => {
    storage.setItem(
      DIARY_FAQ_LINK_CLICKS_STORAGE_KEY,
      JSON.stringify({
        yellowing: 5,
        watering: -3,
        nutrients: "42",
        harvest: 2.9,
        __proto__: { admin: true },
        userId: "abc",
      }),
    );
    const counts = readDiaryFaqLinkClickCounts(storage);
    expect(counts).toEqual({ yellowing: 5, harvest: 2 });
  });

  it("returns {} for corrupted JSON", () => {
    storage.setItem(DIARY_FAQ_LINK_CLICKS_STORAGE_KEY, "{not json");
    expect(readDiaryFaqLinkClickCounts(storage)).toEqual({});
  });

  it("clears counts", () => {
    recordDiaryFaqLinkClick("harvest", storage);
    clearDiaryFaqLinkClickCounts(storage);
    expect(readDiaryFaqLinkClickCounts(storage)).toEqual({});
  });

  it("is a safe no-op when storage is null", () => {
    expect(readDiaryFaqLinkClickCounts(null)).toEqual({});
    expect(recordDiaryFaqLinkClick("yellowing", null)).toEqual({});
    expect(() => clearDiaryFaqLinkClickCounts(null)).not.toThrow();
  });

  it("ranks by count desc, breaks ties by fixed topic order", () => {
    const ranked = rankDiaryFaqLinkClicks({
      yellowing: 3,
      environment: 3,
      watering: 5,
      nutrients: 0,
    });
    expect(ranked.map((r) => r.topic)).toEqual([
      "watering",
      "yellowing",
      "environment",
    ]);
    expect(ranked.every((r) => r.count > 0)).toBe(true);
  });
});
