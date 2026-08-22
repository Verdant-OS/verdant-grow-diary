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
  buildTimelinePlantTentLookup,
  resolveCarriedPlantScope,
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
  const plantTentById = new Map<string, string | null>([
    [PLANT, TENT],
    [OTHER_PLANT, OTHER_TENT],
  ]);

  it("carries both when the explicit tent matches the plant's current tent", () => {
    expect(resolveCarriedPlantScope({ plantId: PLANT, tentId: TENT, plantTentById })).toEqual({
      plantId: PLANT,
      tentId: TENT,
    });
  });

  it("uses the plant's CURRENT tent when the filter reads All tents", () => {
    expect(resolveCarriedPlantScope({ plantId: PLANT, tentId: "", plantTentById })).toEqual({
      plantId: PLANT,
      tentId: TENT,
    });
  });

  it("drops the plant when the explicit tent CONTRADICTS its current tent", () => {
    // Independent filters can disagree — a URL plant from one tent while the
    // grower has filtered to another. The Doctor only honours a plant inside
    // the carried tent, so emitting this pair would lose the selection
    // silently. Keep the tent the grower is actually looking at.
    expect(resolveCarriedPlantScope({ plantId: PLANT, tentId: OTHER_TENT, plantTentById })).toEqual(
      { plantId: null, tentId: OTHER_TENT },
    );
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
        resolveCarriedPlantScope({ plantId: PLANT, tentId: "", plantTentById: lookup }),
      ).toEqual({ plantId: null, tentId: null });
      // An explicit tent still survives — only the plant is dropped.
      expect(
        resolveCarriedPlantScope({ plantId: PLANT, tentId: TENT, plantTentById: lookup }),
      ).toEqual({ plantId: null, tentId: TENT });
    }
  });

  it("passes a tent through untouched when no valid plant is selected", () => {
    for (const bad of ["", "   ", "p1", null, undefined]) {
      expect(resolveCarriedPlantScope({ plantId: bad, tentId: TENT, plantTentById })).toEqual({
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
      resolveCarriedPlantScope({ plantId: PLANT, tentId: "", plantTentById: afterMove }),
    ).toEqual({ plantId: PLANT, tentId: OTHER_TENT });
    // And the pre-move tent is now the contradicting one, so it drops.
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: TENT, plantTentById: afterMove }),
    ).toEqual({ plantId: null, tentId: TENT });
  });
});

describe("buildTimelinePlantTentLookup", () => {
  it("maps plant rows to their current tent and skips unusable rows", () => {
    const lookup = buildTimelinePlantTentLookup([
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

  it("returns an empty map for absent input rather than throwing", () => {
    expect(buildTimelinePlantTentLookup(null).size).toBe(0);
    expect(buildTimelinePlantTentLookup(undefined).size).toBe(0);
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
    // The derivation must be fed the plant filter, the tent filter, and the
    // rows the tent is derived from — dropping any one silently degrades it.
    expect(src).toMatch(/resolveCarriedPlantScope\(\{\s*plantId:\s*plantFilter/);
    expect(src).toMatch(/tentId:\s*tentFilter/);
    expect(src).toMatch(/plantTentById\s*\}\)/);
    // Historical diary attribution must not creep back in as the tent source.
    expect(src).not.toMatch(/resolveCarriedPlantScope\([^)]*entries/);
    // And the result must actually reach the card.
    expect(src).toMatch(/current="timeline"[\s\S]{0,200}\.\.\.carriedPlantScope/);
    // The pre-fix shape must not come back.
    expect(src).not.toMatch(/current="timeline"[\s\S]{0,200}tentId:\s*tentFilter\s*\|\|\s*null/);
  });
});
