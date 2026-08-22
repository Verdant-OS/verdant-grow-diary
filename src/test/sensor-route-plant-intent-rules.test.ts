/**
 * sensorRoutePlantIntentRules — the D-B6 plant handoff into /sensors.
 *
 * Asserted against resolved values from the imported module, never against
 * source text, per the AGENTS.md contract-test rule.
 *
 * The properties that matter are the negative ones: a non-UUID must never
 * become an intent, and an absent plant must leave the href byte-identical.
 * A carried plant that nobody validated is only safe because it cannot be
 * fabricated here and is re-checked against authenticated rows downstream.
 */
import { describe, expect, it } from "vitest";

import {
  SENSORS_PLANT_INTENT_QUERY_PARAM,
  normalizePersistedPlantId,
  readSensorsPlantRouteIntent,
  buildCarriablePlantTentLookup,
  resolveCarriedPlantScope,
  shouldHoldCarryForPendingLookup,
  withSensorsPlantIntent,
} from "@/lib/sensorRoutePlantIntentRules";

const PLANT = "3f7a1e2c-9b04-4d51-8a6e-2c5f70b81d93";
const OTHER_PLANT = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const TENT = "11111111-2222-4333-8444-555555555555";

function search(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

describe("normalizePersistedPlantId", () => {
  it("accepts a UUID and lowercases it", () => {
    expect(normalizePersistedPlantId(PLANT.toUpperCase())).toBe(PLANT);
    expect(normalizePersistedPlantId(`  ${PLANT}  `)).toBe(PLANT);
  });

  it("refuses everything that is not a UUID", () => {
    // The demo/mock ids this repo's fixtures actually use, plus the shapes a
    // hand-edited URL produces. None may become a carried intent.
    for (const bad of [
      "p1",
      "plant-1",
      "demo-plant",
      "",
      "   ",
      "not-a-uuid",
      `${PLANT}extra`,
      `${PLANT} ${OTHER_PLANT}`,
      null,
      undefined,
      42,
      {},
      [],
      [PLANT],
      true,
    ]) {
      expect(normalizePersistedPlantId(bad)).toBeNull();
    }
  });
});

describe("readSensorsPlantRouteIntent", () => {
  it("reads a valid plant intent", () => {
    expect(readSensorsPlantRouteIntent(search({ plantId: PLANT }))).toBe(PLANT);
  });

  it("returns null for a malformed, absent, or empty plant param", () => {
    expect(readSensorsPlantRouteIntent(search({ plantId: "p1" }))).toBeNull();
    expect(readSensorsPlantRouteIntent(search({ plantId: "" }))).toBeNull();
    expect(readSensorsPlantRouteIntent(search({ tentId: TENT }))).toBeNull();
    expect(readSensorsPlantRouteIntent(null)).toBeNull();
    expect(readSensorsPlantRouteIntent(undefined)).toBeNull();
  });

  it("reads through any object exposing get(), not just URLSearchParams", () => {
    // The router's search params are not a URLSearchParams instance; the
    // typed boundary exists so both fit without an adapter at the call site.
    expect(readSensorsPlantRouteIntent({ get: () => PLANT })).toBe(PLANT);
    expect(readSensorsPlantRouteIntent({ get: () => null })).toBeNull();
  });
});

describe("withSensorsPlantIntent", () => {
  it("appends the plant to a href that already carries a tent", () => {
    const href = withSensorsPlantIntent(`/sensors?tentId=${TENT}`, PLANT);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(href.startsWith("/sensors?")).toBe(true);
    expect(params.get("tentId")).toBe(TENT);
    expect(params.get(SENSORS_PLANT_INTENT_QUERY_PARAM)).toBe(PLANT);
  });

  it("appends the plant to a bare path with no existing query", () => {
    expect(withSensorsPlantIntent("/sensors", PLANT)).toBe(`/sensors?plantId=${PLANT}`);
  });

  it("leaves the href BYTE-IDENTICAL when no valid plant is carried", () => {
    // This is the fence that matters: a caller that always pipes through this
    // helper must not start emitting an empty `?plantId=` when the plant is
    // absent or malformed.
    for (const bad of [null, undefined, "", "   ", "p1", "demo-plant", 42]) {
      expect(withSensorsPlantIntent(`/sensors?tentId=${TENT}`, bad)).toBe(
        `/sensors?tentId=${TENT}`,
      );
      expect(withSensorsPlantIntent("/sensors", bad)).toBe("/sensors");
    }
  });

  it("is idempotent and replaces rather than accumulates", () => {
    const once = withSensorsPlantIntent(`/sensors?tentId=${TENT}`, PLANT);
    const twice = withSensorsPlantIntent(once, PLANT);
    expect(twice).toBe(once);
    expect(twice.match(/plantId=/g)).toHaveLength(1);

    const replaced = withSensorsPlantIntent(once, OTHER_PLANT);
    expect(replaced.match(/plantId=/g)).toHaveLength(1);
    expect(new URLSearchParams(replaced.slice(replaced.indexOf("?") + 1)).get("plantId")).toBe(
      OTHER_PLANT,
    );
  });

  it("preserves every other query parameter", () => {
    const href = withSensorsPlantIntent(
      `/sensors?tentId=${TENT}&tentIntent=required&sources=live%2Cmanual`,
      PLANT,
    );
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("tentId")).toBe(TENT);
    expect(params.get("tentIntent")).toBe("required");
    expect(params.get("sources")).toBe("live,manual");
    expect(params.get("plantId")).toBe(PLANT);
  });

  it("keeps a hash fragment at the end", () => {
    const href = withSensorsPlantIntent(`/sensors?tentId=${TENT}#manual`, PLANT);
    expect(href.endsWith("#manual")).toBe(true);
    expect(href.indexOf("#")).toBeGreaterThan(href.indexOf("plantId="));
  });

  it("returns an empty or non-string href untouched", () => {
    expect(withSensorsPlantIntent("", PLANT)).toBe("");
  });

  it("normalizes an uppercase carried plant so the emitted link is canonical", () => {
    const href = withSensorsPlantIntent("/sensors", PLANT.toUpperCase());
    expect(href).toBe(`/sensors?plantId=${PLANT}`);
  });
});

describe("resolveCarriedPlantScope", () => {
  const OTHER_TENT = "99999999-8888-4777-8666-555555555555";
  // Current assignment, sourced from plants.tent_id — never from diary rows.
  const carriablePlantTentById = new Map<string, string | null>([
    [PLANT, TENT],
    [OTHER_PLANT, OTHER_TENT],
  ]);

  it("carries both when the explicit tent matches the plant's current tent", () => {
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: TENT, carriablePlantTentById }),
    ).toEqual({
      plantId: PLANT,
      tentId: TENT,
    });
  });

  it("uses the plant's CURRENT tent when the filter reads All tents", () => {
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: "", carriablePlantTentById }),
    ).toEqual({
      plantId: PLANT,
      tentId: TENT,
    });
  });

  it("drops the plant when the explicit tent CONTRADICTS its current tent", () => {
    // Independent filters can disagree — a URL plant from one tent while the
    // grower has filtered to another. The Doctor only honours a plant inside
    // the carried tent, so emitting this pair would lose the selection
    // silently. Keep the tent the grower is actually looking at.
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: OTHER_TENT, carriablePlantTentById }),
    ).toEqual({ plantId: null, tentId: OTHER_TENT });
  });

  it("drops the plant when its current tent is unknown — fail closed", () => {
    // Directory still loading, read failed, plant not the grower's, or the
    // plant has no tent. None of these may become a guess.
    for (const lookup of [
      null,
      undefined,
      new Map<string, string | null>(),
      new Map<string, string | null>([[PLANT, null]]),
      new Map<string, string | null>([[OTHER_PLANT, OTHER_TENT]]),
    ]) {
      expect(
        resolveCarriedPlantScope({ plantId: PLANT, tentId: "", carriablePlantTentById: lookup }),
      ).toEqual({ plantId: null, tentId: null });
      // An explicit tent still survives — only the plant is dropped.
      expect(
        resolveCarriedPlantScope({ plantId: PLANT, tentId: TENT, carriablePlantTentById: lookup }),
      ).toEqual({ plantId: null, tentId: TENT });
    }
  });

  it("passes a tent through untouched when no valid plant is selected", () => {
    for (const bad of ["", "   ", "p1", null, undefined]) {
      expect(
        resolveCarriedPlantScope({ plantId: bad, tentId: TENT, carriablePlantTentById }),
      ).toEqual({
        plantId: null,
        tentId: TENT,
      });
    }
  });

  it("never sources the tent from historical diary attribution", () => {
    // Regression for the review finding: a plant MOVED tents keeps its old
    // tent on old diary entries. Only plants.tent_id is authoritative, so a
    // lookup reflecting the move must win outright — there is no entries
    // input left for stale history to enter through.
    const afterMove = new Map<string, string | null>([[PLANT, OTHER_TENT]]);
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: "", carriablePlantTentById: afterMove }),
    ).toEqual({ plantId: PLANT, tentId: OTHER_TENT });
    // And the pre-move tent is now the contradicting one, so it drops.
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: TENT, carriablePlantTentById: afterMove }),
    ).toEqual({ plantId: null, tentId: TENT });
  });
});

describe("shouldHoldCarryForPendingLookup", () => {
  it("holds only while a real plant candidate is genuinely still resolving", () => {
    expect(shouldHoldCarryForPendingLookup({ plantId: PLANT, lookupStatus: "pending" })).toBe(true);
  });

  it("never holds once the lookup has settled either way", () => {
    for (const lookupStatus of ["ready", "unavailable"] as const) {
      expect(shouldHoldCarryForPendingLookup({ plantId: PLANT, lookupStatus })).toBe(false);
    }
    // A FAILED read is terminal. Holding on it would wait forever for an
    // answer that never arrives, which is worse than carrying tent-only.
    expect(shouldHoldCarryForPendingLookup({ plantId: PLANT, lookupStatus: "unavailable" })).toBe(
      false,
    );
  });

  it("never holds when nothing would be carried anyway", () => {
    // Costing the grower a click to wait for a lookup whose answer changes
    // nothing is a regression, not caution.
    for (const plantId of ["", "   ", "not-a-uuid", "p1", null, undefined, 42, {}, [PLANT]]) {
      expect(shouldHoldCarryForPendingLookup({ plantId, lookupStatus: "pending" })).toBe(false);
    }
  });

  it("treats an absent or unknown status as settled rather than blocking", () => {
    expect(shouldHoldCarryForPendingLookup({ plantId: PLANT })).toBe(false);
    expect(shouldHoldCarryForPendingLookup({ plantId: PLANT, lookupStatus: null })).toBe(false);
    expect(shouldHoldCarryForPendingLookup({})).toBe(false);
  });
});

describe("resolveCarriedPlantScope · archived and merged plants", () => {
  it("drops an archived plant end-to-end, and takes its derived tent with it", () => {
    const ARCHIVED = "aaaaaaaa-1111-4111-8111-111111111111";
    const lookup = buildCarriablePlantTentLookup([
      { id: PLANT, tent_id: TENT },
      { id: ARCHIVED, tent_id: TENT, is_archived: true },
    ]);

    // No explicit tent: the tent was only ever derived to make the plant
    // valid, so with the plant gone there is no scope left to carry. A tent
    // the grower never chose would be scope Verdant invented.
    expect(
      resolveCarriedPlantScope({ plantId: ARCHIVED, tentId: "", carriablePlantTentById: lookup }),
    ).toEqual({ plantId: null, tentId: null });

    // An EXPLICIT tent is the grower's own live filter and survives.
    expect(
      resolveCarriedPlantScope({ plantId: ARCHIVED, tentId: TENT, carriablePlantTentById: lookup }),
    ).toEqual({ plantId: null, tentId: TENT });

    // Control: the active sibling in the same tent still carries, so the
    // exclusion is the archive flag and not the fixture.
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: "", carriablePlantTentById: lookup }),
    ).toEqual({ plantId: PLANT, tentId: TENT });
  });
});

describe("buildCarriablePlantTentLookup", () => {
  it("maps plant rows to their current tent and skips unusable rows", () => {
    const lookup = buildCarriablePlantTentLookup([
      { id: PLANT, tent_id: TENT },
      { id: OTHER_PLANT, tent_id: null },
      { id: "p1", tent_id: TENT },
      { id: null, tent_id: TENT },
      null,
      undefined,
      {},
    ]);
    expect(lookup.get(PLANT)).toBe(TENT);
    expect(lookup.get(OTHER_PLANT)).toBeNull();
    expect(lookup.has("p1")).toBe(false);
    expect(lookup.size).toBe(2);
  });

  it("excludes archived and merged plants — they are not carriable", () => {
    // Not a style preference: `buildAiDoctorEntryOptions` skips
    // `!isActivePlant`, so a carried archived plant matches no option at
    // `/doctor` and disappears with no message. Both field conventions are
    // covered because the plant rows in this repo carry either.
    const ARCHIVED_SNAKE = "aaaaaaaa-1111-4111-8111-111111111111";
    const ARCHIVED_CAMEL = "bbbbbbbb-2222-4222-8222-222222222222";
    const MERGED_SNAKE = "cccccccc-3333-4333-8333-333333333333";
    const MERGED_CAMEL = "dddddddd-4444-4444-8444-444444444444";

    const lookup = buildCarriablePlantTentLookup([
      { id: PLANT, tent_id: TENT },
      { id: ARCHIVED_SNAKE, tent_id: TENT, is_archived: true },
      { id: ARCHIVED_CAMEL, tent_id: TENT, isArchived: true },
      // Merged without being archived: legacy rows exist in that shape, and
      // `isMergedPlant` deliberately checks the marker independently.
      { id: MERGED_SNAKE, tent_id: TENT, last_note: `Merged into ${OTHER_PLANT}` },
      { id: MERGED_CAMEL, tent_id: TENT, lastNote: `Merged into ${OTHER_PLANT}` },
    ]);

    expect(lookup.get(PLANT)).toBe(TENT);
    for (const excluded of [ARCHIVED_SNAKE, ARCHIVED_CAMEL, MERGED_SNAKE, MERGED_CAMEL]) {
      expect(lookup.has(excluded)).toBe(false);
    }
    expect(lookup.size).toBe(1);
  });

  it("keeps a plant whose note merely mentions a merge without the marker", () => {
    // The exclusion is the RPC-emitted `Merged into <uuid>` marker, not the
    // word "merge". A grower's own note must not archive their plant.
    const lookup = buildCarriablePlantTentLookup([
      { id: PLANT, tent_id: TENT, last_note: "thinking about a merge later" },
      { id: OTHER_PLANT, tent_id: TENT, last_note: "Merged into not-a-uuid" },
    ]);
    expect(lookup.get(PLANT)).toBe(TENT);
    expect(lookup.get(OTHER_PLANT)).toBe(TENT);
  });

  it("returns an empty map for absent input rather than throwing", () => {
    expect(buildCarriablePlantTentLookup(null).size).toBe(0);
    expect(buildCarriablePlantTentLookup(undefined).size).toBe(0);
  });
});

/**
 * Page-wiring pin.
 *
 * @source-scan-justified Timeline.tsx is a ~2,700-line authenticated page
 * whose render needs Supabase, auth, grows and router context; standing up
 * an RTL harness for it is a separate slice, and the alternative to this
 * scan is no coverage of the wiring at all.
 *
 * This exists because of a real defect, not as belt-and-braces. The first
 * version of B6 shipped the whole carry — pure rules, href builder, Doctor
 * ordering, 13 green tests — while `Timeline.tsx` still passed only
 * `{ growId, tentId }` to the loop card. Every test invoked the resolver
 * DIRECTLY with a plantId, so nothing noticed that the production caller
 * never supplied one and the feature was inert. Codex caught it.
 *
 * The behavioural contract is covered by resolveCarriedPlantScope above;
 * this only pins that the page actually calls it and feeds the result to
 * the card. It proves the wiring is present, not that it is correct.
 */
describe("Timeline page wiring", () => {
  it("derives the carried scope and spreads it into the loop card", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Timeline.tsx", "utf8");

    expect(src).toContain("resolveCarriedPlantScope");

    // ONE assertion over the COMPLETE call shape, not three loose regexes.
    // The looser version was itself defective, and Copilot caught it:
    // `tentId: tentFilter` also appears at Timeline.tsx:1039 and :1061 in
    // unrelated objects, so dropping that argument from the resolver call
    // would have left the separate `/tentId:\s*tentFilter/` probe GREEN —
    // the same "assertion agrees with something adjacent" defect this pin
    // exists to catch.
    expect(src).toMatch(
      /resolveCarriedPlantScope\(\{\s*plantId:\s*plantFilter,\s*tentId:\s*tentFilter,\s*carriablePlantTentById,?\s*\}\)/,
    );
    // The page must consume the ELIGIBILITY-FILTERED map. Reading the raw
    // `plantTentById` name back would silently re-admit archived and merged
    // plants, which is the defect this rename encodes.
    expect(src).not.toMatch(/\bplantTentById\b/);
    // The pending hold must reach the card. Computing it and not passing it
    // would leave the CTA live through the exact window it exists to close.
    expect(src).toMatch(
      /shouldHoldCarryForPendingLookup\(\{\s*plantId:\s*plantFilter,\s*lookupStatus:\s*carriablePlantTentStatus,?\s*\}\)/,
    );
    expect(src).toMatch(/pending=\{carryHold\}/);
    // Historical diary attribution must not creep back in as the tent source.
    expect(src).not.toMatch(/resolveCarriedPlantScope\([^)]*entries/);
    // And the result must actually reach the card.
    expect(src).toMatch(/current="timeline"[\s\S]{0,200}\.\.\.carriedPlantScope/);
    // The pre-fix shape must not come back.
    expect(src).not.toMatch(/current="timeline"[\s\S]{0,200}tentId:\s*tentFilter\s*\|\|\s*null/);
  });
});
