/**
 * Machine-readable error-code contract for scripts/ecowitt-live-soil-bridge.ts.
 *
 * Automation (CI runners, supervisors, log scrapers) MUST be able to
 * detect specific single-tent / startup failure classes without parsing
 * prose. The CLI therefore emits, on stderr, both:
 *   1. `[ecowitt-bridge] config_error code=<code> message="..."`
 *   2. `{"event":"config_error","code":"<code>","message":"..."}`
 *
 * These tests lock the code strings in place. Changing a code is a
 * breaking contract change and requires a coordinated update.
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

function runBridge(env: Record<string, string>, dryRun = true): RunResult {
  const baseEnv: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...env,
  };
  if (dryRun) baseEnv.ECOWITT_BRIDGE_DRY_RUN = "1";
  const r = spawnSync("bun", ["run", SCRIPT], {
    encoding: "utf8",
    timeout: 30_000,
    env: baseEnv,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

interface ParsedEnvelope {
  event: string;
  code: string;
  message: string;
}

function findConfigErrorEnvelope(stderr: string): ParsedEnvelope | null {
  for (const line of stderr.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<ParsedEnvelope>;
      if (parsed.event === "config_error" && typeof parsed.code === "string") {
        return parsed as ParsedEnvelope;
      }
    } catch {
      // ignore non-JSON stderr lines
    }
  }
  return null;
}

function expectPrefixedCode(stderr: string, code: string): void {
  const combined = stderr.split(/\r?\n/);
  const hit = combined.some((l) =>
    l.includes(`[ecowitt-bridge] config_error code=${code} message=`),
  );
  expect(hit).toBe(true);
}

d("ecowitt-live-soil-bridge CLI — machine-readable error codes", () => {
  it("emits code=mixed_tent_channel_map when channels span multiple tents", () => {
    const r = runBridge({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
        soilmoisture1: { tent_id: TENT_A },
        soilmoisture2: { tent_id: TENT_B },
      }),
    });
    expect(r.status).toBe(2);
    expectPrefixedCode(r.stderr, "mixed_tent_channel_map");
    const env = findConfigErrorEnvelope(r.stderr);
    expect(env).not.toBeNull();
    expect(env?.code).toBe("mixed_tent_channel_map");
    // Never leak tent UUIDs or channel identifiers.
    expect(r.stderr).not.toContain(TENT_A);
    expect(r.stderr).not.toContain(TENT_B);
    expect(r.stderr).not.toContain("soilmoisture1");
    expect(r.stderr).not.toContain("soilmoisture2");
  });

  it("emits code=channel_map_tent_mismatch when a channel disagrees with VERDANT_TENT_ID", () => {
    const r = runBridge({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
        soilmoisture1: { tent_id: TENT_B },
      }),
    });
    expect(r.status).toBe(2);
    expectPrefixedCode(r.stderr, "channel_map_tent_mismatch");
    const env = findConfigErrorEnvelope(r.stderr);
    expect(env?.code).toBe("channel_map_tent_mismatch");
    expect(r.stderr).not.toContain(TENT_A);
    expect(r.stderr).not.toContain(TENT_B);
  });

  it("emits code=missing_ingest_url in send mode without VERDANT_INGEST_URL", () => {
    const r = runBridge(
      {
        VERDANT_TENT_ID: TENT_A,
        VERDANT_BRIDGE_TOKEN: "unused-not-a-real-token",
      },
      false,
    );
    expect(r.status).toBe(2);
    expectPrefixedCode(r.stderr, "missing_ingest_url");
    const env = findConfigErrorEnvelope(r.stderr);
    expect(env?.code).toBe("missing_ingest_url");
    // Never echo the token value.
    expect(r.stderr).not.toContain("unused-not-a-real-token");
  });

  it("emits code=missing_bridge_token in send mode without VERDANT_BRIDGE_TOKEN", () => {
    const r = runBridge(
      {
        VERDANT_TENT_ID: TENT_A,
        VERDANT_INGEST_URL: "https://example.invalid/ingest",
      },
      false,
    );
    expect(r.status).toBe(2);
    expectPrefixedCode(r.stderr, "missing_bridge_token");
    const env = findConfigErrorEnvelope(r.stderr);
    expect(env?.code).toBe("missing_bridge_token");
  });
});
