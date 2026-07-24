/**
 * Pure single-tent guard for HA / ecowitt2mqtt bridge mappings.
 *
 * The pure homeAssistantEcowittMqttAdapter is intentionally multi-tent
 * capable. This guard restricts only what a single bridge *process*
 * may be configured to forward.
 */
import { describe, it, expect } from "vitest";
import {
  assertSingleTentHaMappingEntities,
  EcowittBridgeConfigError,
} from "@/lib/ecowittLiveSoilIngestRules";

const TENT_A = "00000000-0000-0000-0000-0000000000aa";
const TENT_B = "00000000-0000-0000-0000-0000000000bb";

function ent(tent_id: string, entity_id = `sensor.x_${tent_id.slice(-2)}`) {
  return { entity_id, tent_id };
}

describe("assertSingleTentHaMappingEntities", () => {
  it("accepts an empty / missing entity list", () => {
    expect(() => assertSingleTentHaMappingEntities([])).not.toThrow();
    expect(() => assertSingleTentHaMappingEntities(null)).not.toThrow();
    expect(() => assertSingleTentHaMappingEntities(undefined)).not.toThrow();
  });

  it("accepts a uniform single-tent mapping", () => {
    expect(() =>
      assertSingleTentHaMappingEntities([ent(TENT_A), ent(TENT_A)]),
    ).not.toThrow();
  });

  it("accepts a uniform mapping that also matches VERDANT_TENT_ID", () => {
    expect(() =>
      assertSingleTentHaMappingEntities([ent(TENT_A), ent(TENT_A)], TENT_A),
    ).not.toThrow();
  });

  it("rejects a mixed-tent mapping with mixed_tent_ha_mapping", () => {
    try {
      assertSingleTentHaMappingEntities([ent(TENT_A), ent(TENT_B)]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EcowittBridgeConfigError);
      const err = e as EcowittBridgeConfigError;
      expect(err.code).toBe("mixed_tent_ha_mapping");
      // id / entity / path safe
      expect(err.message).not.toContain(TENT_A);
      expect(err.message).not.toContain(TENT_B);
      expect(err.message).not.toContain("sensor.");
    }
  });

  it("rejects a mapping whose tent disagrees with VERDANT_TENT_ID", () => {
    try {
      assertSingleTentHaMappingEntities([ent(TENT_B)], TENT_A);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EcowittBridgeConfigError);
      const err = e as EcowittBridgeConfigError;
      expect(err.code).toBe("ha_mapping_tent_mismatch");
      expect(err.message).not.toContain(TENT_A);
      expect(err.message).not.toContain(TENT_B);
    }
  });

  it("does not mutate the entity list", () => {
    const entities = Object.freeze([ent(TENT_A), ent(TENT_A)]);
    expect(() => assertSingleTentHaMappingEntities(entities, TENT_A)).not.toThrow();
    expect(entities.length).toBe(2);
  });

  it("ignores non-string / empty tent_id fields but still rejects real mixes", () => {
    // Missing/blank tent_ids don't count as their own tent; a single real
    // tent still passes.
    expect(() =>
      assertSingleTentHaMappingEntities([
        { entity_id: "sensor.a", tent_id: "" },
        ent(TENT_A),
      ]),
    ).not.toThrow();
    // Real mix still rejected.
    expect(() =>
      assertSingleTentHaMappingEntities([
        { entity_id: "sensor.a", tent_id: "" },
        ent(TENT_A),
        ent(TENT_B),
      ]),
    ).toThrow(EcowittBridgeConfigError);
  });
});
