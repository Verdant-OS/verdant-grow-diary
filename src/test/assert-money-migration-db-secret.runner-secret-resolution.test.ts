/**
 * Runner-shaped secret-resolution contract for the money-migration
 * preflight (`scripts/assert-money-migration-db-secret.mjs`), which is
 * the exact CLI the required-money-migrations workflow invokes via the
 * `.github/actions/require-ci-secret` composite.
 *
 * GitHub Actions injects `${{ secrets.SUPABASE_DB_URL_SANDBOX }}` as an
 * env var whose *string* value can arrive in several shapes:
 *   - unset entirely (secret not configured in repo settings)
 *   - empty string ""             (secret defined but blank)
 *   - "   \n\t  "                 (secret is only whitespace)
 *   - "postgres://ok\n"           (trailing newline from paste / CRLF import)
 *   - "postgres://ok\r\n"         (Windows clipboard paste)
 *   - "  postgres://ok  "         (leading/trailing spaces from paste)
 *   - "postgres://ok"             (clean value)
 *
 * These tests pin the preflight's classification of every case so the
 * behavior matches what the GitHub runner actually delivers — and so a
 * future refactor of the shared core cannot silently start accepting a
 * whitespace-only or "\n"-only secret as configured.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

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

describe("SUPABASE_DB_URL_SANDBOX resolution — runner-shaped values", () => {
  describe("counts as MISSING (exit 1)", () => {
    const missingCases: Array<{ label: string; env: Record<string, string | undefined> }> = [
      {
        label: "secret not configured (env var unset)",
        env: { TARGET_ENV: "sandbox" },
      },
      {
        label: "empty string",
        env: { TARGET_ENV: "sandbox", SUPABASE_DB_URL: "" },
      },
      {
        label: "single space",
        env: { TARGET_ENV: "sandbox", SUPABASE_DB_URL: " " },
      },
      {
        label: "trailing newline only",
        env: { TARGET_ENV: "sandbox", SUPABASE_DB_URL: "\n" },
      },
      {
        label: "CRLF only",
        env: { TARGET_ENV: "sandbox", SUPABASE_DB_URL: "\r\n" },
      },
      {
        label: "tab + newlines only",
        env: { TARGET_ENV: "sandbox", SUPABASE_DB_URL: "   \n\t  " },
      },
    ];

    for (const { label, env } of missingCases) {
      it(`${label} → exits 1 and names SUPABASE_DB_URL_SANDBOX`, () => {
        const result = run(env);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/::error title=SUPABASE_DB_URL_SANDBOX missing::/);
        expect(result.stderr).toContain("SUPABASE_DB_URL_SANDBOX");
        expect(result.stderr).toContain("Do NOT deploy");
      });
    }
  });

  describe("counts as CONFIGURED (exit 0)", () => {
    const okCases: Array<{ label: string; value: string }> = [
      {
        label: "clean postgres URL",
        value: "postgres://user:pw@host:5432/db",
      },
      {
        label: "trailing newline (typical paste from CLI)",
        value: "postgres://user:pw@host:5432/db\n",
      },
      {
        label: "trailing CRLF (Windows clipboard)",
        value: "postgres://user:pw@host:5432/db\r\n",
      },
      {
        label: "leading + trailing whitespace",
        value: "  postgres://user:pw@host:5432/db  ",
      },
      {
        label: "surrounded by tab + newline",
        value: "\tpostgres://user:pw@host:5432/db\n",
      },
    ];

    for (const { label, value } of okCases) {
      it(`${label} → exits 0`, () => {
        const result = run({ TARGET_ENV: "sandbox", SUPABASE_DB_URL: value });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("SUPABASE_DB_URL_SANDBOX is configured");
      });
    }
  });

  it("LIVE follows the same whitespace/trim rules", () => {
    const missing = run({ TARGET_ENV: "live", SUPABASE_DB_URL: "  \n  " });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/::error title=SUPABASE_DB_URL missing::/);

    const configured = run({
      TARGET_ENV: "live",
      SUPABASE_DB_URL: "postgres://ok\n",
    });
    expect(configured.status).toBe(0);
    expect(configured.stdout).toContain("SUPABASE_DB_URL is configured");
  });
});
