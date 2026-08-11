/**
 * Contract for scripts/probe-migration-drift.mjs.
 *
 * Why it exists: on 2026-08-05 migration 20260805090000 began failing on
 * every apply, the runner stopped, and SEVEN migrations never reached
 * production for six days — including an action_queue_create RPC that
 * shipped client code already calling it. CI was green throughout, because
 * CI checks that migrations are well-formed, not that production ran them.
 * The gap was found only by querying schema_migrations by hand.
 *
 * The load-bearing property is NOT "does it print nicely" — it is that a
 * probe which cannot reach the database exits non-zero. A probe that
 * silently reports success when it checked nothing recreates the exact
 * blind spot it was built to close.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PROBE = "scripts/probe-migration-drift.mjs";
const SRC = readFileSync(resolve(ROOT, PROBE), "utf8");

function runProbe(args: string[], env: Record<string, string | undefined> = {}) {
  const clean = { ...process.env, ...env };
  // Ensure no ambient URL leaks in and accidentally satisfies the probe.
  delete clean.SUPABASE_DB_URL;
  delete clean.SUPABASE_DB_URL_LIVE;
  delete clean.DATABASE_URL;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
  try {
    const stdout = execFileSync("node", [PROBE, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: clean,
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("migration drift probe — cannot silently pass", () => {
  it("exits 2 (not 0) when no database URL is available", () => {
    const { code, stderr } = runProbe([]);
    expect(code).toBe(2);
    expect(stderr).toContain("COULD NOT PROBE");
    // The distinction that matters: unreachable != healthy.
    expect(stderr).toContain("This is NOT a pass");
  });

  it("reports could_not_probe in --json mode rather than a success status", () => {
    const { stdout } = runProbe(["--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("could_not_probe");
    expect(parsed.status).not.toBe("current");
  });

  it("exits 2 when psql is unavailable or the database is unreachable", () => {
    const { code } = runProbe(["--url", "postgresql://nobody@127.0.0.1:1/nope"]);
    expect(code).toBe(2);
  });

  it("never exits 0 on any failure path", () => {
    // Exit 0 must be reachable ONLY by a real, successful comparison.
    expect(runProbe([]).code).not.toBe(0);
    expect(runProbe(["--json"]).code).not.toBe(0);
    expect(runProbe(["--url", "postgresql://nobody@127.0.0.1:1/nope"]).code).not.toBe(0);
  });
});

describe("migration drift probe — detection contract", () => {
  it("diffs the FULL version set, not just the max applied version", () => {
    // A runner that skips a failure and continues leaves a gap in the middle.
    // Comparing only max-applied would miss it entirely.
    expect(SRC).toContain("Full-set diff, not max-version");
    expect(SRC).toMatch(/repo\.keys\(\)\]\.filter\(\(v\)\s*=>\s*!applied\.has\(v\)\)/);
  });

  it("distinguishes a mid-sequence GAP from a stopped tail", () => {
    // A gap means the live schema is in a state nobody authored — strictly
    // worse than a tail, and it needs different remediation.
    expect(SRC).toMatch(/unapplied\.filter\(\(v\)\s*=>\s*v\s*<\s*maxApplied\)/);
    expect(SRC).toContain("GAP");
    expect(SRC).toContain("state nobody authored");
  });

  it("is read-only by construction", () => {
    // The connection must be incapable of writing even if this script is wrong.
    expect(SRC).toContain("default_transaction_read_only=on");
    expect(SRC).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s+(INTO|TABLE|FROM)\b/i);
  });

  it("surfaces the age of the oldest pending migration", () => {
    // Six days of drift went unnoticed; age is what makes it obviously wrong.
    expect(SRC).toContain("function ageInDays(");
    expect(SRC).toContain("Oldest pending is");
  });
});
