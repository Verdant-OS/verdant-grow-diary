// Tranche B+ slice D5 — the remembered-target suggestion contract (D-B9).
//
// The stored recent target may only ever return as a VISIBLE, explicitly
// chosen suggestion. It is never a silent default, never a fallback when
// resolution fails, and never survives past its validity window or across
// accounts. Every rule below is a boundary the design ratified.
import { describe, expect, it } from "vitest";

import {
  RECENT_TARGET_SUGGESTION_MAX_AGE_MS,
  buildRecentTargetStorageKey,
  parseRecentTargetRecord,
  resolveRecentTargetSuggestion,
} from "@/lib/quickLogRecentTargetSuggestion";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const PLANTS = [
  { id: "plant-1", name: "Blue Dream #1", grow_id: "grow-1", tent_id: "tent-1" },
  { id: "plant-2", name: "Gelato #2", grow_id: "grow-1", tent_id: "tent-1" },
];

function record(overrides: Record<string, unknown> = {}) {
  return {
    plantId: "plant-1",
    growId: "grow-1",
    tentId: "tent-1",
    savedAt: new Date(NOW - DAY).toISOString(),
    ...overrides,
  };
}

describe("storage key is namespaced per account", () => {
  it("includes the user id so one browser never leaks another account's target", () => {
    expect(buildRecentTargetStorageKey("user-abc")).toBe("verdant.quickLog.lastTarget.v2.user-abc");
  });

  it("refuses to build a key without a user — anonymous state is never stored", () => {
    expect(buildRecentTargetStorageKey(null)).toBeNull();
    expect(buildRecentTargetStorageKey("")).toBeNull();
    expect(buildRecentTargetStorageKey("   ")).toBeNull();
  });
});

describe("parseRecentTargetRecord", () => {
  it("accepts a well-formed record", () => {
    expect(parseRecentTargetRecord(JSON.stringify(record()))).toEqual(record());
  });

  it("rejects malformed, empty, and non-object payloads without throwing", () => {
    for (const raw of [null, undefined, "", "not json", "[]", '"str"', "42", "{}"]) {
      expect(parseRecentTargetRecord(raw as string)).toBeNull();
    }
  });

  it("rejects a record missing its plant id", () => {
    expect(parseRecentTargetRecord(JSON.stringify(record({ plantId: "" })))).toBeNull();
  });
});

describe("resolveRecentTargetSuggestion — D-B9 validity window", () => {
  it("suggests a recent target that still belongs to the grower", () => {
    const suggestion = resolveRecentTargetSuggestion({
      record: record(),
      now: NOW,
      visiblePlants: PLANTS,
    });
    expect(suggestion).toEqual({
      plantId: "plant-1",
      plantName: "Blue Dream #1",
      growId: "grow-1",
      tentId: "tent-1",
    });
  });

  it("expires strictly past the 14-day window, and not before", () => {
    const atBoundary = resolveRecentTargetSuggestion({
      record: record({
        savedAt: new Date(NOW - RECENT_TARGET_SUGGESTION_MAX_AGE_MS).toISOString(),
      }),
      now: NOW,
      visiblePlants: PLANTS,
    });
    expect(atBoundary).not.toBeNull();

    const pastBoundary = resolveRecentTargetSuggestion({
      record: record({
        savedAt: new Date(NOW - RECENT_TARGET_SUGGESTION_MAX_AGE_MS - 1).toISOString(),
      }),
      now: NOW,
      visiblePlants: PLANTS,
    });
    expect(pastBoundary).toBeNull();
  });

  it("rejects a future timestamp — a skewed clock is not evidence", () => {
    expect(
      resolveRecentTargetSuggestion({
        record: record({ savedAt: new Date(NOW + 1000).toISOString() }),
        now: NOW,
        visiblePlants: PLANTS,
      }),
    ).toBeNull();
  });

  it("rejects an unparseable timestamp", () => {
    expect(
      resolveRecentTargetSuggestion({
        record: record({ savedAt: "whenever" }),
        now: NOW,
        visiblePlants: PLANTS,
      }),
    ).toBeNull();
  });

  it("never surfaces a plant the grower cannot currently see", () => {
    // Archived, merged, deleted, or another account's plant: all absent from
    // the visible rows, so all fail closed to no suggestion.
    expect(
      resolveRecentTargetSuggestion({
        record: record({ plantId: "plant-gone" }),
        now: NOW,
        visiblePlants: PLANTS,
      }),
    ).toBeNull();
    expect(
      resolveRecentTargetSuggestion({ record: record(), now: NOW, visiblePlants: [] }),
    ).toBeNull();
  });

  it("re-derives grow and tent from the live row, never trusting stored scope", () => {
    const suggestion = resolveRecentTargetSuggestion({
      record: record({ growId: "stale-grow", tentId: "stale-tent" }),
      now: NOW,
      visiblePlants: PLANTS,
    });
    expect(suggestion?.growId).toBe("grow-1");
    expect(suggestion?.tentId).toBe("tent-1");
  });

  it("returns null (never throws, never falls back) for a null record or bad clock", () => {
    expect(
      resolveRecentTargetSuggestion({ record: null, now: NOW, visiblePlants: PLANTS }),
    ).toBeNull();
    expect(
      resolveRecentTargetSuggestion({ record: record(), now: Number.NaN, visiblePlants: PLANTS }),
    ).toBeNull();
  });

  it("is deterministic", () => {
    const input = { record: record(), now: NOW, visiblePlants: PLANTS };
    expect(resolveRecentTargetSuggestion(input)).toEqual(resolveRecentTargetSuggestion(input));
  });
});
