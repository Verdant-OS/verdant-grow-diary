import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { runConfigValidate } from "../../scripts/ecowitt-live-soil-bridge";
import {
  assertEcowittSoilChannelMapJsonEnv,
  assertSingleTentSoilChannelMap,
  EcowittBridgeConfigError,
  parseEcowittSoilChannelMap,
} from "../lib/ecowittLiveSoilIngestRules";

/**
 * Precise field-path diagnostics for `ECOWITT_SOIL_CHANNEL_MAP_JSON`.
 *
 * Every channel-map failure must include a `fields[]` array of stable
 * structural paths (e.g. `$.soilmoisture2.tent_id`) so operators can
 * jump straight to the offending entry. Paths and reason strings must
 * NEVER contain raw UUIDs, tokens, or the raw JSON.
 */

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const TENT_C = "33333333-3333-4333-8333-333333333333";

function catchConfigError(fn: () => void): EcowittBridgeConfigError | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof EcowittBridgeConfigError) return e;
    throw e;
  }
  return null;
}

describe("assertSingleTentSoilChannelMap — mixed_tent_channel_map field paths", () => {
  it("reports every off-reference channel in natural (numeric) order", () => {
    const map = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT_A },
        soilmoisture2: { tent_id: TENT_B },
        soilmoisture10: { tent_id: TENT_C },
      }),
    );
    const err = catchConfigError(() => assertSingleTentSoilChannelMap(map));
    expect(err).not.toBeNull();
    expect(err!.code).toBe("mixed_tent_channel_map");
    expect(err!.fields).toEqual([
      {
        path: "$.soilmoisture2.tent_id",
        message: "tent_id differs from tent_id used by other channels in the map",
      },
      {
        path: "$.soilmoisture10.tent_id",
        message: "tent_id differs from tent_id used by other channels in the map",
      },
    ]);
    // Redaction: no raw UUIDs anywhere in the thrown envelope.
    const wire = JSON.stringify({
      code: err!.code,
      message: err!.message,
      fields: err!.fields,
    });
    expect(wire).not.toContain(TENT_A);
    expect(wire).not.toContain(TENT_B);
    expect(wire).not.toContain(TENT_C);
  });
});

describe("assertSingleTentSoilChannelMap — channel_map_tent_mismatch field paths", () => {
  it("reports only the channels whose tent_id != VERDANT_TENT_ID", () => {
    const map = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT_A },
        soilmoisture2: { tent_id: TENT_A },
      }),
    );
    const err = catchConfigError(() => assertSingleTentSoilChannelMap(map, TENT_B));
    expect(err).not.toBeNull();
    expect(err!.code).toBe("channel_map_tent_mismatch");
    expect(err!.fields).toEqual([
      { path: "$.soilmoisture1.tent_id", message: "tent_id does not match VERDANT_TENT_ID" },
      { path: "$.soilmoisture2.tent_id", message: "tent_id does not match VERDANT_TENT_ID" },
    ]);
  });
});

describe("assertEcowittSoilChannelMapJsonEnv — invalid_channel_map_schema field paths", () => {
  it("threads per-field schema errors into EcowittBridgeConfigError.fields", () => {
    const raw = JSON.stringify({
      soilmoisture1: { tent_id: "not-a-uuid", label: 5 },
      not_a_channel_key: { tent_id: TENT_A },
    });
    const err = catchConfigError(() => assertEcowittSoilChannelMapJsonEnv(raw));
    expect(err).not.toBeNull();
    expect(err!.code).toBe("invalid_channel_map_schema");
    const paths = (err!.fields ?? []).map((f) => f.path).sort();
    expect(paths).toEqual(
      ["$.not_a_channel_key", "$.soilmoisture1.label", "$.soilmoisture1.tent_id"].sort(),
    );
  });
});

describe("runConfigValidate — passes fields through result and CLI envelope", () => {
  it("returns fields[] on mixed_tent_channel_map without --fix-hints", () => {
    const map = {
      soilmoisture1: { tent_id: TENT_A },
      soilmoisture3: { tent_id: TENT_B },
    };
    const r = runConfigValidate({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("mixed_tent_channel_map");
    expect(r.fields).toEqual([
      {
        path: "$.soilmoisture3.tent_id",
        message: "tent_id differs from tent_id used by other channels in the map",
      },
    ]);
    expect(r.fix).toBeUndefined();
  });

  it("returns fields[] AND fix on channel_map_tent_mismatch with --fix-hints", () => {
    const map = { soilmoisture1: { tent_id: TENT_A } };
    const r = runConfigValidate(
      {
        VERDANT_TENT_ID: TENT_B,
        ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
      },
      { includeFixHints: true },
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("channel_map_tent_mismatch");
    expect(r.fields).toEqual([
      { path: "$.soilmoisture1.tent_id", message: "tent_id does not match VERDANT_TENT_ID" },
    ]);
    expect(typeof r.fix).toBe("string");
  });

  it("does NOT include fields on non-channel errors (missing_tent_id)", () => {
    const r = runConfigValidate({});
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tent_id");
    expect(r.fields).toBeUndefined();
  });
});

describe("`config validate` CLI — fields[] appears in stderr envelope", () => {
  const bunOk = spawnSync("bun", ["--version"], { encoding: "utf8" }).status === 0;
  if (!bunOk) {
    it.skip("skipped — bun runtime not available", () => {});
    return;
  }

  it("mixed_tent_channel_map envelope contains fields[] with structural paths", () => {
    const map = {
      soilmoisture1: { tent_id: TENT_A },
      soilmoisture4: { tent_id: TENT_B },
    };
    const clean = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
    const r = spawnSync(
      "bun",
      ["run", "scripts/ecowitt-live-soil-bridge.ts", "config", "validate"],
      {
        encoding: "utf8",
        timeout: 15_000,
        env: {
          ...clean,
          VERDANT_TENT_ID: TENT_A,
          ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
        },
      },
    );
    expect(r.status).toBe(2);
    const line = r.stderr
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith("{"))
      .pop()!;
    const env = JSON.parse(line) as Record<string, unknown>;
    expect(env.event).toBe("config_error");
    expect(env.code).toBe("mixed_tent_channel_map");
    expect(env.fields).toEqual([
      {
        path: "$.soilmoisture4.tent_id",
        message: "tent_id differs from tent_id used by other channels in the map",
      },
    ]);
    // Human-readable stderr line also mentions fields=… for grep-friendliness.
    expect(r.stderr).toMatch(/fields=/);
  });
});
