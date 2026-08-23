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
