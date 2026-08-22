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
  const entries = [
    { plant_id: OTHER_PLANT, tent_id: "99999999-8888-4777-8666-555555555555" },
    { plant_id: PLANT, tent_id: TENT },
  ];

  it("keeps an explicitly selected tent and does not derive over it", () => {
    const explicit = "22222222-3333-4444-8555-666666666666";
    expect(resolveCarriedPlantScope({ plantId: PLANT, tentId: explicit, entries })).toEqual({
      plantId: PLANT,
      tentId: explicit,
    });
  });

  it("derives the plant's own tent when the tent filter is All tents", () => {
    // The P2 case: independent filters. Carrying the plant WITHOUT its tent
    // would let Sensors fall back to another tent and the Doctor discard the
    // plant — the grower's selection would vanish silently.
    expect(resolveCarriedPlantScope({ plantId: PLANT, tentId: "", entries })).toEqual({
      plantId: PLANT,
      tentId: TENT,
    });
  });

  it("drops the plant when no tent can be established — fail closed", () => {
    for (const noTent of [
      [],
      null,
      undefined,
      [{ plant_id: PLANT, tent_id: null }],
      [{ plant_id: PLANT, tent_id: "not-a-uuid" }],
      [{ plant_id: OTHER_PLANT, tent_id: TENT }],
    ]) {
      expect(
        resolveCarriedPlantScope({ plantId: PLANT, tentId: "", entries: noTent as never }),
      ).toEqual({ plantId: null, tentId: null });
    }
  });

  it("passes a tent through untouched when no plant is selected", () => {
    expect(resolveCarriedPlantScope({ plantId: "", tentId: TENT, entries })).toEqual({
      plantId: null,
      tentId: TENT,
    });
    expect(resolveCarriedPlantScope({ plantId: "p1", tentId: TENT, entries })).toEqual({
      plantId: null,
      tentId: TENT,
    });
  });

  it("ignores malformed rows rather than throwing on them", () => {
    const messy = [null, undefined, {}, { plant_id: PLANT }, { plant_id: PLANT, tent_id: TENT }];
    expect(
      resolveCarriedPlantScope({ plantId: PLANT, tentId: "", entries: messy as never }),
    ).toEqual({ plantId: PLANT, tentId: TENT });
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
    expect(src).toMatch(/entries\s*\}\)/);
    // And the result must actually reach the card.
    expect(src).toMatch(/current="timeline"[\s\S]{0,200}\.\.\.carriedPlantScope/);
    // The pre-fix shape must not come back.
    expect(src).not.toMatch(/current="timeline"[\s\S]{0,200}tentId:\s*tentFilter\s*\|\|\s*null/);
  });
});
