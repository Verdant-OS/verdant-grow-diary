/**
 * Contract tests for scripts/assert-money-migration-db-secret.mjs.
 *
 * These prove the CI preflight fails FAST with a clear, actionable message
 * when the environment's configured DB secret is missing — the whole point of the
 * script is to replace the opaque "money-critical gate failed" red with a
 * green/red signal named after the actual missing secret.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = "scripts/assert-money-migration-db-secret.mjs";

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(env: Record<string, string | undefined>): RunResult {
  try {
    const stdout = execFileSync("node", [SCRIPT], {
      env: { PATH: process.env.PATH, ...env } as NodeJS.ProcessEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ? String(e.stdout) : "",
      stderr: e.stderr ? String(e.stderr) : "",
    };
  }
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "money-preflight-"));
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("assert-money-migration-db-secret preflight", () => {
  it("exits 0 when SUPABASE_DB_URL is set (sandbox)", () => {
    const result = run({
      TARGET_ENV: "sandbox",
      SUPABASE_DB_URL: "postgres://ok",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SUPABASE_DB_URL_SANDBOX is configured");
  });

  it("exits 0 when SUPABASE_DB_URL is set (live)", () => {
    const result = run({
      TARGET_ENV: "live",
      SUPABASE_DB_URL: "postgres://ok",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SUPABASE_DB_URL is configured");
  });

  it("fails with clear ::error:: annotation naming SUPABASE_DB_URL_SANDBOX when unset (sandbox)", () => {
    const result = run({ TARGET_ENV: "sandbox", SUPABASE_DB_URL: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/::error title=SUPABASE_DB_URL_SANDBOX missing::/);
    expect(result.stderr).toContain("Settings → Environments → verdant-sandbox");
    expect(result.stderr).toContain("SUPABASE_DB_URL_SANDBOX");
    expect(result.stderr).toContain("Do NOT deploy");
  });

  it("fails with clear ::error:: annotation naming SUPABASE_DB_URL when unset (live)", () => {
    const result = run({ TARGET_ENV: "live", SUPABASE_DB_URL: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/::error title=SUPABASE_DB_URL missing::/);
    expect(result.stderr).toContain("SUPABASE_DB_URL");
    expect(result.stderr).toContain("Settings → Environments → verdant-production");
  });

  it("treats a whitespace-only secret value as missing", () => {
    const result = run({ TARGET_ENV: "sandbox", SUPABASE_DB_URL: "   \n\t  " });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SUPABASE_DB_URL_SANDBOX");
  });

  it("writes an actionable markdown report to REPORT_PATH on failure", () => {
    const reportPath = join(tmpDir, "nested", "report.md");
    const result = run({
      TARGET_ENV: "sandbox",
      SUPABASE_DB_URL: "",
      REPORT_PATH: reportPath,
    });
    expect(result.status).toBe(1);
    const body = readFileSync(reportPath, "utf8");
    expect(body).toContain("Money-critical migration deploy guard — SANDBOX");
    expect(body).toContain("SUPABASE_DB_URL_SANDBOX secret is not configured");
    expect(body).toContain("Settings → Environments → verdant-sandbox");
    expect(body).toContain("Do NOT deploy");
  });

  it("exits 2 (misuse) when TARGET_ENV is missing or unknown", () => {
    const missing = run({ SUPABASE_DB_URL: "postgres://ok" });
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("TARGET_ENV must be");

    const bogus = run({ TARGET_ENV: "prod", SUPABASE_DB_URL: "postgres://ok" });
    expect(bogus.status).toBe(2);
  });
});
