import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ECOWITT_SOIL_CHANNEL_MAP_SCHEMA_ID,
  validateEcowittSoilChannelMapJsonEnv,
  assertEcowittSoilChannelMapJsonEnv,
  EcowittBridgeConfigError,
} from "@/lib/ecowittLiveSoilIngestRules";

const SCHEMA_PATH = join(process.cwd(), "docs/schemas/ecowitt-soil-channel-map.schema.json");
const PUBLIC_SCHEMA_PATH = join(
  process.cwd(),
  "public/schemas/ecowitt-soil-channel-map.schema.json",
);

const TENT = "11111111-2222-3333-4444-555555555555";
const PLANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("ECOWITT_SOIL_CHANNEL_MAP_JSON schema", () => {
  it("publishes a JSON Schema whose $id matches the exported constant", () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    expect(schema.$id).toBe(ECOWITT_SOIL_CHANNEL_MAP_SCHEMA_ID);
    expect(schema.$schema).toContain("json-schema.org");
    expect(schema.type).toBe("object");
  });

  it("publishes the canonical schema at its advertised same-site URL", () => {
    expect(existsSync(PUBLIC_SCHEMA_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(PUBLIC_SCHEMA_PATH, "utf8"))).toEqual(
      JSON.parse(readFileSync(SCHEMA_PATH, "utf8")),
    );
  });

  it("accepts unset / empty / empty-object payloads", () => {
    expect(validateEcowittSoilChannelMapJsonEnv(undefined).ok).toBe(true);
    expect(validateEcowittSoilChannelMapJsonEnv(null).ok).toBe(true);
    expect(validateEcowittSoilChannelMapJsonEnv("").ok).toBe(true);
    expect(validateEcowittSoilChannelMapJsonEnv("   ").ok).toBe(true);
    expect(validateEcowittSoilChannelMapJsonEnv("{}").ok).toBe(true);
  });

  it("accepts a well-formed single-tent map", () => {
    const raw = JSON.stringify({
      soilmoisture1: { tent_id: TENT, plant_id: PLANT, label: "veg tent" },
      soilmoisture2: { tent_id: TENT },
    });
    const res = validateEcowittSoilChannelMapJsonEnv(raw);
    expect(res).toEqual({ ok: true, errors: [] });
  });

  it("rejects malformed JSON", () => {
    const res = validateEcowittSoilChannelMapJsonEnv("{not json");
    expect(res.ok).toBe(false);
    expect(res.errors[0].message).toMatch(/valid JSON/);
  });

  it("rejects arrays and non-objects at the root", () => {
    expect(validateEcowittSoilChannelMapJsonEnv("[]").ok).toBe(false);
    expect(validateEcowittSoilChannelMapJsonEnv('"x"').ok).toBe(false);
  });

  it("rejects unknown channel keys and unknown target properties", () => {
    const raw = JSON.stringify({
      soilmoisture0: { tent_id: TENT },
      humidity1: { tent_id: TENT },
      soilmoisture3: { tent_id: TENT, nickname: "oops" },
    });
    const res = validateEcowittSoilChannelMapJsonEnv(raw);
    expect(res.ok).toBe(false);
    const paths = res.errors.map((e) => e.path).sort();
    expect(paths).toEqual(
      expect.arrayContaining(["$.soilmoisture0", "$.humidity1", "$.soilmoisture3.nickname"]),
    );
  });

  it("rejects non-UUID tent_id and plant_id", () => {
    const raw = JSON.stringify({
      soilmoisture1: { tent_id: "not-a-uuid" },
      soilmoisture2: { tent_id: TENT, plant_id: "bad" },
    });
    const res = validateEcowittSoilChannelMapJsonEnv(raw);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.path === "$.soilmoisture1.tent_id")).toBe(true);
    expect(res.errors.some((e) => e.path === "$.soilmoisture2.plant_id")).toBe(true);
  });

  it("rejects labels longer than 120 chars", () => {
    const raw = JSON.stringify({
      soilmoisture1: { tent_id: TENT, label: "x".repeat(200) },
    });
    const res = validateEcowittSoilChannelMapJsonEnv(raw);
    expect(res.ok).toBe(false);
    expect(res.errors[0].path).toBe("$.soilmoisture1.label");
  });

  it("assert helper throws EcowittBridgeConfigError with schema code and no raw echo", () => {
    const secretLike = TENT;
    const raw = JSON.stringify({ bogus: { tent_id: secretLike } });
    try {
      assertEcowittSoilChannelMapJsonEnv(raw);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EcowittBridgeConfigError);
      const err = e as EcowittBridgeConfigError;
      expect(err.code).toBe("invalid_channel_map_schema");
      expect(err.message).toContain(ECOWITT_SOIL_CHANNEL_MAP_SCHEMA_ID);
      // Must not echo the raw JSON or tent ID back
      expect(err.message).not.toContain(secretLike);
      expect(err.message).not.toContain('"tent_id"');
    }
  });

  it("assert helper is a no-op for valid payloads", () => {
    expect(() => assertEcowittSoilChannelMapJsonEnv(undefined)).not.toThrow();
    expect(() =>
      assertEcowittSoilChannelMapJsonEnv(JSON.stringify({ soilmoisture1: { tent_id: TENT } })),
    ).not.toThrow();
  });
});
