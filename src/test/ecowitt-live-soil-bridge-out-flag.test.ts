/**
 * `config validate --dry-run --out=<path>` contract.
 *
 * Locks in that:
 *   - `parseOutFlag` (pure) accepts `--out=<path>` and `--out <path>`,
 *     and returns stable error codes for empty/missing values.
 *   - The CLI refuses `--out` without `--dry-run` (exit 2 /
 *     `out_flag_requires_dry_run`).
 *   - On the happy path the file on disk contains exactly the same
 *     redacted `config_effective` envelope that is emitted on stdout,
 *     plus a trailing newline, and stdout gains a `config_effective_written`
 *     receipt.
 *   - A missing directory surfaces as `out_write_failed`, not an
 *     uncaught throw.
 *   - No raw UUID / bridge token from the process env ever ends up in
 *     the written file (redaction invariant).
 *   - No mqtt import or network activity is triggered.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseOutFlag } from "../../scripts/ecowitt-live-soil-bridge";

const BRIDGE = resolve(__dirname, "..", "..", "scripts/ecowitt-live-soil-bridge.ts");
const TENT_A = "11111111-1111-4111-8111-111111111111";
const PLANT_A = "33333333-3333-4333-8333-333333333333";
const BRIDGE_TOKEN = "vbt_super_secret_never_leak_1234";

function bunAvailable(): boolean {
  const r = spawnSync("bun", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

function runCli(args: string[], env: Record<string, string> = {}) {
  const cleanEnv = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...env,
  };
  const r = spawnSync("bun", ["run", BRIDGE, "config", "validate", ...args], {
    encoding: "utf8",
    env: cleanEnv,
    timeout: 20_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function lastJson(text: string): Record<string, unknown> | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe("parseOutFlag (pure)", () => {
  it("returns null path when --out is absent", () => {
    expect(parseOutFlag(["--dry-run"])).toEqual({ path: null });
  });

  it("accepts --out=<path>", () => {
    expect(parseOutFlag(["--dry-run", "--out=./effective.json"])).toEqual({
      path: "./effective.json",
    });
  });

  it("accepts --out <path> (space form)", () => {
    expect(parseOutFlag(["--dry-run", "--out", "./effective.json"])).toEqual({
      path: "./effective.json",
    });
  });

  it("rejects --out= (empty value) with out_flag_missing_value", () => {
    const r = parseOutFlag(["--dry-run", "--out="]);
    expect(r.path).toBe(null);
    expect(r.error?.code).toBe("out_flag_missing_value");
  });

  it("rejects trailing --out with no following argument", () => {
    const r = parseOutFlag(["--dry-run", "--out"]);
    expect(r.path).toBe(null);
    expect(r.error?.code).toBe("out_flag_missing_value");
  });

  it("rejects --out followed by another flag", () => {
    const r = parseOutFlag(["--out", "--dry-run"]);
    expect(r.path).toBe(null);
    expect(r.error?.code).toBe("out_flag_missing_value");
  });
});

describe("config validate --out (CLI, subprocess)", () => {
  if (!bunAvailable()) {
    it.skip("bun not available in this environment", () => {});
    return;
  }

  it("exits 2 with out_flag_requires_dry_run when --out is passed without --dry-run", () => {
    const r = runCli(["--out=/tmp/should-not-be-written.json"], {
      VERDANT_TENT_ID: TENT_A,
    });
    expect(r.status).toBe(2);
    const env = lastJson(r.stderr);
    expect(env?.event).toBe("config_error");
    expect(env?.code).toBe("out_flag_requires_dry_run");
    expect(existsSync("/tmp/should-not-be-written.json")).toBe(false);
  });

  it("writes the same redacted config_effective envelope that stdout emits", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecowitt-out-happy-"));
    try {
      const outPath = join(dir, "effective.json");
      const r = runCli(["--dry-run", `--out=${outPath}`], {
        VERDANT_TENT_ID: TENT_A,
        VERDANT_PLANT_ID: PLANT_A,
        VERDANT_BRIDGE_TOKEN: BRIDGE_TOKEN,
      });
      expect(r.status).toBe(0);

      // stdout: config_ok, config_effective, config_effective_written
      const stdoutJson = r.stdout
        .split(/\r?\n/)
        .filter((l) => l.trim().startsWith("{"))
        .map((l) => JSON.parse(l) as Record<string, unknown>);
      const effective = stdoutJson.find((e) => e.event === "config_effective");
      const written = stdoutJson.find((e) => e.event === "config_effective_written");
      expect(effective).toBeTruthy();
      expect(written).toBeTruthy();
      expect(written?.path).toBe(resolve(outPath));

      // File contents = same effective envelope + trailing newline.
      const fileText = readFileSync(outPath, "utf8");
      expect(fileText.endsWith("\n")).toBe(true);
      expect(JSON.parse(fileText.trim())).toEqual(effective);

      // Redaction invariant: no raw secret in the file.
      expect(fileText).not.toContain(TENT_A);
      expect(fileText).not.toContain(PLANT_A);
      expect(fileText).not.toContain(BRIDGE_TOKEN);

      // No mqtt / network activity.
      expect(r.stdout + r.stderr).not.toMatch(
        /ECONNREFUSED|mqtt_connected|Cannot find module 'mqtt'/i,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts the --out <path> space form and writes the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecowitt-out-space-"));
    try {
      const outPath = join(dir, "effective.json");
      const r = runCli(["--dry-run", "--out", outPath], {
        VERDANT_TENT_ID: TENT_A,
      });
      expect(r.status).toBe(0);
      expect(existsSync(outPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outPath, "utf8").trim());
      expect(parsed.event).toBe("config_effective");
      expect(parsed.dry_run).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces write failures as out_write_failed (exit 2)", () => {
    const bogus = "/nonexistent-directory-for-ecowitt-tests-xyz/effective.json";
    const r = runCli(["--dry-run", `--out=${bogus}`], {
      VERDANT_TENT_ID: TENT_A,
    });
    expect(r.status).toBe(2);
    const env = lastJson(r.stderr);
    expect(env?.event).toBe("config_error");
    expect(env?.code).toBe("out_write_failed");
  });

  it("out_flag_requires_dry_run and out_write_failed are documented in CONFIG_ERROR_FIX_HINTS", async () => {
    const mod = await import("../../scripts/ecowitt-live-soil-bridge");
    expect(mod.CONFIG_ERROR_FIX_HINTS.out_flag_requires_dry_run).toBeTruthy();
    expect(mod.CONFIG_ERROR_FIX_HINTS.out_flag_missing_value).toBeTruthy();
    expect(mod.CONFIG_ERROR_FIX_HINTS.out_write_failed).toBeTruthy();
  });
});
