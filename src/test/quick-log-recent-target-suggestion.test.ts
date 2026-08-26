// Tranche B+ slice D5 — the remembered-target suggestion contract (D-B9).
//
// The stored recent target may only ever return as a VISIBLE, explicitly
// chosen suggestion. It is never a silent default, never a fallback when
// resolution fails, and never survives past its validity window or across
// accounts. Every rule below is a boundary the design ratified.
import { describe, expect, it } from "vitest";

import {
  RECENT_TARGET_SUGGESTION_MAX_AGE_MS,
  RECENT_TARGET_SUGGESTION_MAX_WAKE_DELAY_MS,
  buildRecentTargetStorageKey,
  getRecentTargetSuggestionWakeDelayMs,
  parseRecentTargetRecord,
  resolveRecentTargetSuggestion,
} from "@/lib/quickLogRecentTargetSuggestion";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const MAX_SAFE_TIMER_DELAY_MS = 2_147_483_647;

const PLANTS = [
  { id: "plant-1", name: "Blue Dream #1", grow_id: "grow-1", tent_id: "tent-1" },
  { id: "plant-2", name: "Gelato #2", grow_id: "grow-1", tent_id: "tent-1" },
];

// The grower's ACTIVE grows — the archived-filtered list `useGrows()` returns.
const GROWS = [{ id: "grow-1" }];

// The grower's live tents — the archived-filtered list `useTents()` returns.
const TENTS = [{ id: "tent-1", grow_id: "grow-1", is_archived: false, archived_at: null }];

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
      visibleGrows: GROWS,
      visibleTents: TENTS,
    });
    expect(suggestion).toEqual({
      plantId: "plant-1",
      plantName: "Blue Dream #1",
      growId: "grow-1",
      tentId: "tent-1",
    });
  });

  it("offers only a live target inside an explicitly required grow or tent scope", () => {
    const input = {
      record: record(),
      now: NOW,
      visiblePlants: PLANTS,
      visibleGrows: GROWS,
      visibleTents: TENTS,
    };

    expect(resolveRecentTargetSuggestion({ ...input, requiredGrowId: "grow-1" })).not.toBeNull();
    expect(resolveRecentTargetSuggestion({ ...input, requiredTentId: "tent-1" })).not.toBeNull();
    expect(
      resolveRecentTargetSuggestion({
        ...input,
        requiredGrowId: "grow-1",
        requiredTentId: "tent-1",
      }),
    ).not.toBeNull();

    expect(resolveRecentTargetSuggestion({ ...input, requiredGrowId: "grow-2" })).toBeNull();
    expect(resolveRecentTargetSuggestion({ ...input, requiredTentId: "tent-2" })).toBeNull();
  });

  it("expires strictly past the 14-day window, and not before", () => {
    const atBoundary = resolveRecentTargetSuggestion({
      record: record({
        savedAt: new Date(NOW - RECENT_TARGET_SUGGESTION_MAX_AGE_MS).toISOString(),
      }),
      now: NOW,
      visiblePlants: PLANTS,
      visibleGrows: GROWS,
      visibleTents: TENTS,
    });
    expect(atBoundary).not.toBeNull();

    const pastBoundary = resolveRecentTargetSuggestion({
      record: record({
        savedAt: new Date(NOW - RECENT_TARGET_SUGGESTION_MAX_AGE_MS - 1).toISOString(),
      }),
      now: NOW,
      visiblePlants: PLANTS,
      visibleGrows: GROWS,
      visibleTents: TENTS,
    });
    expect(pastBoundary).toBeNull();
  });

  it("rejects a future timestamp — a skewed clock is not evidence", () => {
    expect(
      resolveRecentTargetSuggestion({
        record: record({ savedAt: new Date(NOW + 1000).toISOString() }),
        now: NOW,
        visiblePlants: PLANTS,
        visibleGrows: GROWS,
        visibleTents: TENTS,
      }),
    ).toBeNull();
  });

  it("rejects an unparseable timestamp", () => {
    expect(
      resolveRecentTargetSuggestion({
        record: record({ savedAt: "whenever" }),
        now: NOW,
        visiblePlants: PLANTS,
        visibleGrows: GROWS,
        visibleTents: TENTS,
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
        visibleGrows: GROWS,
        visibleTents: TENTS,
      }),
    ).toBeNull();
    expect(
      resolveRecentTargetSuggestion({
        record: record(),
        now: NOW,
        visiblePlants: [],
        visibleGrows: GROWS,
        visibleTents: TENTS,
      }),
    ).toBeNull();
  });

  it("re-derives grow and tent from the live row, never trusting stored scope", () => {
    const suggestion = resolveRecentTargetSuggestion({
      record: record({ growId: "stale-grow", tentId: "stale-tent" }),
      now: NOW,
      visiblePlants: PLANTS,
      visibleGrows: GROWS,
      visibleTents: TENTS,
    });
    expect(suggestion?.growId).toBe("grow-1");
    expect(suggestion?.tentId).toBe("tent-1");
  });

  it("rejects a visible plant without live grow and tent scope", () => {
    for (const plant of [
      { id: "plant-1", name: "Blue Dream #1", grow_id: null, tent_id: "tent-1" },
      { id: "plant-1", name: "Blue Dream #1", grow_id: "grow-1", tent_id: null },
    ]) {
      expect(
        resolveRecentTargetSuggestion({
          record: record(),
          now: NOW,
          visiblePlants: [plant],
          visibleGrows: GROWS,
          visibleTents: TENTS,
        }),
      ).toBeNull();
    }
  });

  it("returns null (never throws, never falls back) for a null record or bad clock", () => {
    expect(
      resolveRecentTargetSuggestion({
        record: null,
        now: NOW,
        visiblePlants: PLANTS,
        visibleGrows: GROWS,
        visibleTents: TENTS,
      }),
    ).toBeNull();
    expect(
      resolveRecentTargetSuggestion({
        record: record(),
        now: Number.NaN,
        visiblePlants: PLANTS,
        visibleGrows: GROWS,
        visibleTents: TENTS,
      }),
    ).toBeNull();
  });

  it("is deterministic", () => {
    const input = {
      record: record(),
      now: NOW,
      visiblePlants: PLANTS,
      visibleGrows: GROWS,
      visibleTents: TENTS,
    };
    expect(resolveRecentTargetSuggestion(input)).toEqual(resolveRecentTargetSuggestion(input));
  });
});

describe("getRecentTargetSuggestionWakeDelayMs", () => {
  it("wakes exactly when a future record becomes current", () => {
    expect(
      getRecentTargetSuggestionWakeDelayMs(
        record({ savedAt: new Date(NOW + 60_000).toISOString() }),
        NOW,
      ),
    ).toBe(60_000);
  });

  it("caps a distant-future checkpoint at the safe browser timer ceiling", () => {
    expect(RECENT_TARGET_SUGGESTION_MAX_WAKE_DELAY_MS).toBe(MAX_SAFE_TIMER_DELAY_MS);
    expect(
      getRecentTargetSuggestionWakeDelayMs(
        record({
          savedAt: new Date(NOW + MAX_SAFE_TIMER_DELAY_MS + 60_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe(MAX_SAFE_TIMER_DELAY_MS);
  });

  it("wakes one millisecond past strict expiry for a current record", () => {
    const savedAt = NOW - 60_000;
    const current = record({ savedAt: new Date(savedAt).toISOString() });

    expect(getRecentTargetSuggestionWakeDelayMs(current, NOW)).toBe(
      RECENT_TARGET_SUGGESTION_MAX_AGE_MS - 60_000 + 1,
    );
    expect(
      getRecentTargetSuggestionWakeDelayMs(current, savedAt + RECENT_TARGET_SUGGESTION_MAX_AGE_MS),
    ).toBe(1);
    expect(
      getRecentTargetSuggestionWakeDelayMs(
        current,
        savedAt + RECENT_TARGET_SUGGESTION_MAX_AGE_MS + 1,
      ),
    ).toBeNull();
  });

  it("does not schedule malformed, absent, or invalid-clock records", () => {
    expect(getRecentTargetSuggestionWakeDelayMs(null, NOW)).toBeNull();
    expect(getRecentTargetSuggestionWakeDelayMs(record({ savedAt: "whenever" }), NOW)).toBeNull();
    expect(getRecentTargetSuggestionWakeDelayMs(record(), Number.NaN)).toBeNull();
  });
});

describe("parseRecentTargetRecord — savedAt must be a readable timestamp", () => {
  const base = { plantId: "p1", growId: "g1", tentId: "t1" };

  it("rejects a nonempty but unparseable savedAt", () => {
    // The resolver already rejects this. Accepting it here made the parser and
    // the resolver disagree about what a valid record is, and the diagnostics
    // panel — which reasons from the parser alone — called it healthy while
    // Quick Log silently offered nothing.
    expect(parseRecentTargetRecord(JSON.stringify({ ...base, savedAt: "whenever" }))).toBeNull();
    expect(parseRecentTargetRecord(JSON.stringify({ ...base, savedAt: "   " }))).toBeNull();
    expect(parseRecentTargetRecord(JSON.stringify({ ...base, savedAt: "2026-13-45" }))).toBeNull();
  });

  it("still accepts a real ISO timestamp", () => {
    const record = parseRecentTargetRecord(
      JSON.stringify({ ...base, savedAt: "2026-08-19T00:00:00.000Z" }),
    );
    expect(record?.savedAt).toBe("2026-08-19T00:00:00.000Z");
    expect(record?.plantId).toBe("p1");
  });

  it("agrees with the resolver on every timestamp it accepts", () => {
    // The property that was broken: anything the parser returns must be a
    // record the resolver can at least reason about, not one it discards.
    for (const savedAt of ["2026-08-19T00:00:00.000Z", "2026-08-19", "August 19, 2026 UTC"]) {
      const record = parseRecentTargetRecord(JSON.stringify({ ...base, savedAt }));
      if (!record) continue;
      expect(Number.isFinite(Date.parse(record.savedAt))).toBe(true);
    }
  });
});

describe("resolveRecentTargetSuggestion — the grow must still be active", () => {
  // Regression for the archived-grow gap. `archiveGrow` (src/lib/db.ts) updates
  // only the `grows` row, so the grow's plants keep `is_archived: false` and
  // stay in `usePlants()`. The plant lookup alone therefore cannot prove the
  // grow is live, and accepting an archived-grow target is worse than useless:
  // `GrowsProvider` (src/store/grows.tsx) replaces an activeGrowId it does not
  // recognise with `grows[0].id`, landing the grower on a DIFFERENT grow with
  // the remembered plant filtered out of the options.
  it("withholds the suggestion when the plant's grow is no longer active", () => {
    expect(
      resolveRecentTargetSuggestion({
        record: record(),
        now: NOW,
        visiblePlants: PLANTS,
        // grow-1 archived; the grower still has another active grow.
        visibleGrows: [{ id: "grow-2" }],
        visibleTents: TENTS,
      }),
    ).toBeNull();
  });

  it("fails closed while the active-grow list is unestablished", () => {
    // Empty, null and undefined are "not established", not "no archived grows".
    for (const visibleGrows of [[], null, undefined]) {
      expect(
        resolveRecentTargetSuggestion({
          record: record(),
          now: NOW,
          visiblePlants: PLANTS,
          visibleGrows,
          visibleTents: TENTS,
        }),
      ).toBeNull();
    }
  });

  it("still offers the target when that grow is among the active grows", () => {
    // Positive control: the negative cases above differ from this one ONLY in
    // the active-grow list, so "nothing returned" can never pass as correct
    // withholding of an otherwise-invalid target.
    const suggestion = resolveRecentTargetSuggestion({
      record: record(),
      now: NOW,
      visiblePlants: PLANTS,
      visibleGrows: [{ id: "grow-2" }, { id: "grow-1" }],
      visibleTents: TENTS,
    });
    expect(suggestion).toEqual({
      plantId: "plant-1",
      plantName: "Blue Dream #1",
      growId: "grow-1",
      tentId: "tent-1",
    });
  });
});

describe("resolveRecentTargetSuggestion — the tent must still be live and in that grow", () => {
  // Same shape as the archived-grow gap, one level down. A nonempty `tent_id`
  // on the plant row is not proof the tent is usable: `useTents()` excludes
  // archived tents, and `resolveQuickLogWriteTarget` blocks the save as
  // tent_not_found / tent_inactive / tent_grow_unassigned / tent_grow_mismatch.
  it("withholds the suggestion when the tent is gone from the live list", () => {
    expect(
      resolveRecentTargetSuggestion({
        record: record(),
        now: NOW,
        visiblePlants: PLANTS,
        visibleGrows: GROWS,
        visibleTents: [{ id: "tent-9", grow_id: "grow-1" }],
      }),
    ).toBeNull();
  });

  it("withholds it for an archived tent, by either archival marker", () => {
    for (const tent of [
      { id: "tent-1", grow_id: "grow-1", is_archived: true },
      { id: "tent-1", grow_id: "grow-1", archived_at: "2026-08-01T00:00:00.000Z" },
    ]) {
      expect(
        resolveRecentTargetSuggestion({
          record: record(),
          now: NOW,
          visiblePlants: PLANTS,
          visibleGrows: GROWS,
          visibleTents: [tent],
        }),
      ).toBeNull();
    }
  });

  it("withholds it when the tent belongs to another grow, or to none", () => {
    for (const grow_id of ["grow-2", null, undefined, "   "]) {
      expect(
        resolveRecentTargetSuggestion({
          record: record(),
          now: NOW,
          visiblePlants: PLANTS,
          visibleGrows: GROWS,
          visibleTents: [{ id: "tent-1", grow_id }],
        }),
      ).toBeNull();
    }
  });

  it("fails closed while the live-tent list is unestablished", () => {
    for (const visibleTents of [[], null, undefined]) {
      expect(
        resolveRecentTargetSuggestion({
          record: record(),
          now: NOW,
          visiblePlants: PLANTS,
          visibleGrows: GROWS,
          visibleTents,
        }),
      ).toBeNull();
    }
  });

  it("still offers the target when the tent is live and in the same grow", () => {
    // Positive control: every negative case above differs from this one ONLY
    // in the tent list.
    expect(
      resolveRecentTargetSuggestion({
        record: record(),
        now: NOW,
        visiblePlants: PLANTS,
        visibleGrows: GROWS,
        visibleTents: TENTS,
      }),
    ).toEqual({
      plantId: "plant-1",
      plantName: "Blue Dream #1",
      growId: "grow-1",
      tentId: "tent-1",
    });
  });
});
