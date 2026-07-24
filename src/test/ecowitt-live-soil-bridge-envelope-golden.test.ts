import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  CONFIG_ERROR_FIX_HINTS,
  runConfigValidate,
} from "../../scripts/ecowitt-live-soil-bridge";

/**
 * Golden snapshots for the `config validate` failure envelope.
 *
 * These lock the exact JSON shape emitted on stderr — both the pure
 * `runConfigValidate` return value and the CLI's second stderr line —
 * so any silent rename, key removal, or ordering drift breaks CI.
 * Downstream automation (log parsers, dashboards) depends on this shape.
 */

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const PLANT_A = "33333333-3333-4333-8333-333333333333";

function bunAvailable(): boolean {
  return spawnSync("bun", ["--version"], { encoding: "utf8" }).status === 0;
}

/** Extract the JSON envelope line (last stderr line beginning with `{`). */
function lastJsonLine(text: string): unknown {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
}

describe("config validate — failure envelope golden shape (pure)", () => {
  it("without --fix-hints: exact shape { ok, code, message }", () => {
    const r = runConfigValidate({});
    expect(r).toEqual({
      ok: false,
      code: "missing_tent_id",
      message: "missing VERDANT_TENT_ID",
    });
    expect(Object.keys(r).sort()).toEqual(["code", "message", "ok"]);
    expect((r as { fix?: unknown }).fix).toBeUndefined();
  });

  it("with --fix-hints: exact shape { ok, code, message, fix }", () => {
    const r = runConfigValidate({}, { includeFixHints: true });
    expect(r).toEqual({
      ok: false,
      code: "missing_tent_id",
      message: "missing VERDANT_TENT_ID",
      fix: CONFIG_ERROR_FIX_HINTS.missing_tent_id,
    });
    expect(Object.keys(r).sort()).toEqual(["code", "fix", "message", "ok"]);
  });

  it("mixed_tent_channel_map: exact shape without --fix-hints", () => {
    const map = {
      soilmoisture1: { tent_id: TENT_A, plant_id: PLANT_A },
      soilmoisture2: { tent_id: TENT_B, plant_id: PLANT_A },
    };
    const r = runConfigValidate({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("mixed_tent_channel_map");
    expect(typeof r.message).toBe("string");
    expect(Object.keys(r).sort()).toEqual(["code", "fields", "message", "ok"]);
    expect(r.fields).toEqual([
      {
        path: "$.soilmoisture2.tent_id",
        message: "tent_id differs from tent_id used by other channels in the map",
      },
    ]);
    // Message + fields must never contain raw tent UUIDs (fail-closed redaction).
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(TENT_A);
    expect(serialized).not.toContain(TENT_B);
  });
});

describe("`config validate` CLI — stderr JSON envelope golden shape", () => {
  if (!bunAvailable()) {
    it.skip("skipped — bun runtime not available", () => {});
    return;
  }

  function runCli(env: NodeJS.ProcessEnv, extra: string[] = []) {
    const clean = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env };
    return spawnSync(
      "bun",
      ["run", "scripts/ecowitt-live-soil-bridge.ts", "config", "validate", ...extra],
      { encoding: "utf8", env: clean, timeout: 15_000 },
    );
  }

  it("without --fix-hints: envelope is exactly { event, code, message }", () => {
    const r = runCli({});
    expect(r.status).toBe(2);
    const env = lastJsonLine(r.stderr) as Record<string, unknown>;
    expect(env).toEqual({
      event: "config_error",
      code: "missing_tent_id",
      message: "missing VERDANT_TENT_ID",
    });
    expect(Object.keys(env).sort()).toEqual(["code", "event", "message"]);
    // `fix` must NOT appear unless --fix-hints was passed.
    expect(env).not.toHaveProperty("fix");
  });

  it("with --fix-hints: envelope is exactly { event, code, message, fix }", () => {
    const r = runCli({}, ["--fix-hints"]);
    expect(r.status).toBe(2);
    const env = lastJsonLine(r.stderr) as Record<string, unknown>;
    expect(env).toEqual({
      event: "config_error",
      code: "missing_tent_id",
      message: "missing VERDANT_TENT_ID",
      fix: CONFIG_ERROR_FIX_HINTS.missing_tent_id,
    });
    expect(Object.keys(env).sort()).toEqual(["code", "event", "fix", "message"]);
  });

  it("--fix-hints: mixed_tent_channel_map envelope preserves exact key set", () => {
    const map = {
      soilmoisture1: { tent_id: TENT_A },
      soilmoisture2: { tent_id: TENT_B },
    };
    const r = runCli(
      {
        VERDANT_TENT_ID: TENT_A,
        ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
      },
      ["--fix-hints"],
    );
    expect(r.status).toBe(2);
    const env = lastJsonLine(r.stderr) as Record<string, unknown>;
    expect(Object.keys(env).sort()).toEqual(["code", "event", "fix", "message"]);
    expect(env.event).toBe("config_error");
    expect(env.code).toBe("mixed_tent_channel_map");
    expect(env.fix).toBe(CONFIG_ERROR_FIX_HINTS.mixed_tent_channel_map);
    expect(typeof env.message).toBe("string");
    // Redaction: never leak raw UUIDs through the envelope.
    const serialized = JSON.stringify(env);
    expect(serialized).not.toContain(TENT_A);
    expect(serialized).not.toContain(TENT_B);
  });
});
