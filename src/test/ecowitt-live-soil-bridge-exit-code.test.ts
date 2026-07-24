/**
 * Subprocess exit-code contract for scripts/ecowitt-live-soil-bridge.ts.
 *
 * Confirms the CLI exits with code 2 when the startup single-tent guard
 * rejects the configuration, and that rejection happens before any MQTT
 * import / broker connect / HTTP forwarding. These tests spawn the
 * script with `bun run` in dry-run mode so no network is touched.
 *
 * If bun is not available on the runner (unexpected in this repo), the
 * tests skip rather than false-fail. Sandbox capacity is not a product
 * failure.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const SCRIPT = "scripts/ecowitt-live-soil-bridge.ts";

function bunAvailable(): boolean {
  try {
    const r = spawnSync("bun", ["--version"], { encoding: "utf8" });
    return r.status === 0;
  } catch {
    return false;
  }
}

const BUN_OK = bunAvailable();
const d = BUN_OK ? describe : describe.skip;

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runBridge(env: Record<string, string>): RunResult {
  const r = spawnSync("bun", ["run", SCRIPT], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      // Isolate — never inherit developer live creds. Dry-run is enforced
      // by ECOWITT_BRIDGE_DRY_RUN and --dry-run so URL/token aren't needed.
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      ECOWITT_BRIDGE_DRY_RUN: "1",
      ...env,
    },
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

d("ecowitt-live-soil-bridge CLI — exit code contract", () => {
  it("exits 2 when the channel map spans multiple tent_ids", () => {
    const r = runBridge({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
        soilmoisture1: { tent_id: TENT_A },
        soilmoisture2: { tent_id: TENT_B },
      }),
    });
    expect(r.status).toBe(2);
    // Deterministic config-error signal, not a downstream MQTT/network failure.
    const combined = `${r.stdout}\n${r.stderr}`;
    expect(combined).toMatch(/ecowitt-bridge/);
    expect(combined.toLowerCase()).toMatch(/single-tent|one tent|tent/);
    // Never leaks tent UUIDs or channel identifiers in the error message.
    expect(combined).not.toContain(TENT_A);
    expect(combined).not.toContain(TENT_B);
    expect(combined).not.toContain("soilmoisture1");
    expect(combined).not.toContain("soilmoisture2");
  });

  it("exits 2 when a channel tent_id disagrees with VERDANT_TENT_ID", () => {
    const r = runBridge({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
        soilmoisture1: { tent_id: TENT_B },
      }),
    });
    expect(r.status).toBe(2);
    const combined = `${r.stdout}\n${r.stderr}`;
    expect(combined).toMatch(/ecowitt-bridge/);
    expect(combined).not.toContain(TENT_A);
    expect(combined).not.toContain(TENT_B);
  });

  it("exits 2 with a config error, not a network/mqtt error, before broker connect", () => {
    const r = runBridge({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
        soilmoisture1: { tent_id: TENT_A },
        soilmoisture2: { tent_id: TENT_B },
      }),
      // If the guard failed to run first, the CLI would try to import
      // mqtt / connect to this bogus broker and surface a different
      // error. Presence of these vars in a successful test proves the
      // guard short-circuits before any network setup.
      ECOWITT_MQTT_URL: "mqtt://127.0.0.1:1",
      ECOWITT_MQTT_TOPIC: "ecowitt/grow",
    });
    expect(r.status).toBe(2);
    const combined = `${r.stdout}\n${r.stderr}`.toLowerCase();
    expect(combined).not.toContain("econnrefused");
    expect(combined).not.toContain("mqtt package not installed");
    expect(combined).not.toContain("subscribe");
  });
});
