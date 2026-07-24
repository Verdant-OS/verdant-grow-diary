/**
 * Subprocess exit-code contract for scripts/dev/ecowitt-mqtt-runner.ts.
 *
 * Proves that the fail-closed single-tent startup guard runs BEFORE
 * the runner imports the `mqtt` module, connects to a broker, or does
 * any HTTP forwarding. The guard is a pure config check — no network,
 * no dynamic imports, no forwarder invocation.
 *
 * We prove this by spawning the runner with a real HA mapping file
 * that intentionally spans two tents, plus deliberately-broken MQTT /
 * forwarder env vars. If the guard failed to short-circuit, the CLI
 * would surface an ECONNREFUSED / "mqtt package not installed" /
 * fetch failure instead of our config error. Presence of ONLY the
 * config error — with exit code 2 — proves nothing downstream ran.
 *
 * If bun is not available on the runner host, the tests skip rather
 * than false-fail.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

const TENT_A = "00000000-0000-0000-0000-0000000000aa";
const TENT_B = "00000000-0000-0000-0000-0000000000bb";
const SCRIPT = "scripts/dev/ecowitt-mqtt-runner.ts";
const MIXED_MAPPING = "fixtures/home-assistant-ecowitt-mqtt/mixed-tent-mapping.json";
const CLEAN_MAPPING = "fixtures/home-assistant-ecowitt-mqtt/example-mapping.json";

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

function runRunner(env: Record<string, string>): RunResult {
  const r = spawnSync("bun", ["run", SCRIPT], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      // Isolate — never inherit developer live creds.
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      ...env,
    },
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

/**
 * Deliberately-broken MQTT + forwarder env. If any of these were
 * reached during validation, the process would surface an
 * ECONNREFUSED, DNS failure, "mqtt package not installed", or fetch
 * error instead of our deterministic config error.
 */
const HOSTILE_DOWNSTREAM_ENV = {
  ECOWITT_MQTT_URL: "mqtt://127.0.0.1:1",
  ECOWITT_MQTT_TOPIC: "ecowitt/grow",
  VERDANT_INGEST_URL: "http://127.0.0.1:1/ingest",
  VERDANT_BRIDGE_TOKEN: "unused-during-validation",
} as const;

function assertNoDownstreamActivity(combined: string): void {
  const lower = combined.toLowerCase();
  // MQTT dynamic import / broker connect signals
  expect(lower).not.toContain("econnrefused");
  expect(lower).not.toContain("mqtt package not installed");
  expect(lower).not.toContain("subscribe");
  expect(lower).not.toContain("mqtt.connect");
  expect(lower).not.toContain("connected to broker");
  // HTTP forwarding signals
  expect(lower).not.toContain("fetch failed");
  expect(lower).not.toContain("ingest post");
  expect(lower).not.toMatch(/\bpost \/ingest\b/);
}

d("ecowitt-mqtt-runner CLI — validation runs before mqtt import / connect / HTTP", () => {
  it("rejects a mixed-tent HA mapping with exit code 2 and never touches mqtt or the forwarder", () => {
    const r = runRunner({
      UPSTREAM_MODE: "ha_json",
      HA_MQTT_MAPPING_PATH: MIXED_MAPPING,
      VERDANT_TENT_ID: TENT_A,
      ...HOSTILE_DOWNSTREAM_ENV,
    });
    expect(r.status).toBe(2);
    const combined = `${r.stdout}\n${r.stderr}`;
    // Deterministic config-error signal from the runner
    expect(combined).toMatch(/ecowitt-mqtt-runner/);
    expect(combined.toLowerCase()).toMatch(/one tent|single|tent/);
    // No id / entity / path leakage
    expect(combined).not.toContain(TENT_A);
    expect(combined).not.toContain(TENT_B);
    expect(combined).not.toContain("sensor.ecowitt_tent_");
    expect(combined).not.toContain(MIXED_MAPPING);
    // Proof: nothing downstream ran
    assertNoDownstreamActivity(combined);
  });

  it("rejects a clean single-tent HA mapping that disagrees with VERDANT_TENT_ID (exit 2, no downstream I/O)", () => {
    const r = runRunner({
      UPSTREAM_MODE: "ha_json",
      HA_MQTT_MAPPING_PATH: CLEAN_MAPPING,
      // Fixture mapping is entirely on tent ...aa; force a mismatch.
      VERDANT_TENT_ID: TENT_B,
      ...HOSTILE_DOWNSTREAM_ENV,
    });
    expect(r.status).toBe(2);
    const combined = `${r.stdout}\n${r.stderr}`;
    expect(combined).toMatch(/ecowitt-mqtt-runner/);
    expect(combined).not.toContain(TENT_A);
    expect(combined).not.toContain(TENT_B);
    assertNoDownstreamActivity(combined);
  });
});
