/**
 * Referral reward cap on real PostgreSQL.
 * Grant-path audit (2026-10-03), FAIL #2: convert_referral must reward a
 * referrer for at most 10 conversions per UTC month per environment, while
 * the referee still receives their 10 credits.
 * Uses a disposable PostgreSQL cluster on a private Unix socket, with TCP
 * disabled and a scrubbed child environment. No hosted DB or credentials.
 * Replays the committed grant-ledger and referral migrations unchanged.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REFERRER = "00000000-0000-4000-8000-0000000c0000";
const OTHER_REFERRER = "00000000-0000-4000-8000-0000000c0001";
const referee = (n: number) => `00000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`;
const childEnv = { PATH: process.env.PATH, LC_ALL: "C" };
const migrations = [
  "20260721103000_ai_credit_grants.sql",
  "20260721105000_ai_credit_grants_non_paddle_grants.sql",
  "20260721106000_referrals_conversion.sql",
  "20261003020000_referral_referrer_monthly_cap.sql",
];
let workdir = "";
let dataDir = "";
let binDir = "";
let started = false;

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function rawSql(query: string) {
  return spawnSync(
    join(binDir, "psql"),
    [
      "-X",
      "--no-password",
      "-qAt",
      "-h",
      workdir,
      "-p",
      "55434",
      "-U",
      "referral_cap_admin",
      "-d",
      "postgres",
      "--set=ON_ERROR_STOP=1",
      "--set=VERBOSITY=verbose",
    ],
    { input: query, encoding: "utf8", env: childEnv, timeout: 15_000 },
  );
}

function sql(query: string): string {
  const result = rawSql(query);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "PostgreSQL command failed");
  }
  return result.stdout.trim();
}

function serviceSql(query: string): string {
  return sql("SET ROLE service_role; " + query);
}

beforeAll(() => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    throw new Error("BLOCKED: run as a non-root Unix user with PostgreSQL server tools.");
  }
  const discovery = spawnSync("pg_config", ["--bindir"], { encoding: "utf8", env: childEnv });
  if (discovery.status !== 0)
    throw new Error("BLOCKED: PostgreSQL tools required; no tests skipped.");
  binDir = discovery.stdout.trim();
  for (const tool of ["initdb", "pg_ctl", "psql"]) {
    if (!existsSync(join(binDir, tool))) throw new Error("BLOCKED: missing PostgreSQL " + tool);
  }
  workdir = mkdtempSync(join(tmpdir(), "referral-cap-"));
  dataDir = join(workdir, "data");
  execFileSync(
    join(binDir, "initdb"),
    [
      "-D",
      dataDir,
      "-U",
      "referral_cap_admin",
      "--auth-local=trust",
      "--auth-host=reject",
      "--no-locale",
      "--encoding=UTF8",
    ],
    { env: childEnv, stdio: "pipe", timeout: 20_000 },
  );
  writeFileSync(
    join(dataDir, "postgresql.auto.conf"),
    "listen_addresses = ''\nunix_socket_directories = " +
      literal(workdir) +
      "\nport = 55434\nfsync = off\n",
  );
  execFileSync(
    join(binDir, "pg_ctl"),
    ["-D", dataDir, "-l", join(workdir, "postgres.log"), "-w", "start"],
    { env: childEnv, stdio: "pipe", timeout: 20_000 },
  );
  started = true;
  const users = [REFERRER, OTHER_REFERRER, ...Array.from({ length: 30 }, (_, i) => referee(i))];
  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ${users.map((id) => "('" + id + "')").join(",")};
  `);
  for (const file of migrations) sql(readFileSync(resolve("supabase/migrations", file), "utf8"));
}, 60_000);

afterAll(() => {
  if (started)
    execFileSync(join(binDir, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      env: childEnv,
      stdio: "pipe",
      timeout: 20_000,
    });
  if (workdir) rmSync(workdir, { recursive: true, force: true });
}, 30_000);

beforeEach(() => sql("TRUNCATE public.referrals, public.ai_credit_grants;"));

function convertCall(
  refereeId: string,
  opts: { referrer?: string; env?: "live" | "sandbox"; verified?: boolean } = {},
) {
  return (
    "SELECT public.convert_referral(" +
    [opts.referrer ?? REFERRER, refereeId, "CODE", opts.env ?? "live"].map(literal).join(",") +
    "," +
    String(opts.verified ?? true) +
    ");"
  );
}

function convert(refereeId: string, opts: Parameters<typeof convertCall>[1] = {}) {
  return JSON.parse(serviceSql(convertCall(refereeId, opts)));
}

function credits(userId: string, env = "live") {
  return Number(
    sql(
      "SELECT coalesce(sum(credits), 0) FROM public.ai_credit_grants WHERE user_id = " +
        literal(userId) +
        " AND environment = " +
        literal(env) +
        ";",
    ),
  );
}

function rewarded(referrer = REFERRER, env = "live") {
  return Number(
    sql(
      "SELECT count(*) FROM public.referrals WHERE referrer_user_id = " +
        literal(referrer) +
        " AND environment = " +
        literal(env) +
        " AND referrer_credits > 0;",
    ),
  );
}

function convertConcurrently(refereeId: string): Promise<number> {
  return new Promise((resolveExit) => {
    const child = spawn(
      join(binDir, "psql"),
      ["-X", "-qAt", "-h", workdir, "-p", "55434", "-U", "referral_cap_admin", "-d", "postgres"],
      { env: childEnv },
    );
    // Hold each transaction open after converting, so an uncommitted
    // conversion is invisible to the others. Only the per-referrer lock
    // (held to commit) stops all three from reading 9 rewarded conversions.
    child.stdin.end(
      "BEGIN; SET LOCAL ROLE service_role; " +
        convertCall(refereeId) +
        " SELECT pg_sleep(0.3); COMMIT;\n",
    );
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
}

describe("referral referrer reward cap — real PostgreSQL", () => {
  it("rewards the first 10 conversions, then rewards only the referee", () => {
    for (let i = 0; i < 10; i++) {
      expect(convert(referee(i))).toMatchObject({
        ok: true,
        reason: "converted",
        referrer_credits: 10,
        referee_credits: 10,
        referrer_capped: false,
      });
    }
    expect(credits(REFERRER)).toBe(100);

    expect(convert(referee(10))).toMatchObject({
      ok: true,
      reason: "converted",
      status: "converted",
      referrer_credits: 0,
      referee_credits: 10,
      referrer_capped: true,
    });
    expect(credits(REFERRER)).toBe(100);
    expect(credits(referee(10))).toBe(10);
    expect(
      sql(
        "SELECT status || '|' || referrer_credits || '|' || (meta->>'referrer_reward') " +
          "FROM public.referrals WHERE referee_user_id = " +
          literal(referee(10)) +
          ";",
      ),
    ).toBe("converted|0|capped");
  });

  it("replaying a capped conversion grants nothing more", () => {
    for (let i = 0; i < 11; i++) convert(referee(i));
    expect(convert(referee(10))).toMatchObject({ ok: true, reason: "idempotent" });
    expect(credits(REFERRER)).toBe(100);
    expect(credits(referee(10))).toBe(10);
    expect(sql("SELECT count(*) FROM public.ai_credit_grants;")).toBe("21");
  });

  it("rewards the referrer again in a new UTC month", () => {
    for (let i = 0; i < 10; i++) convert(referee(i));
    sql(
      "UPDATE public.referrals SET converted_at = " +
        "(date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 second';",
    );
    expect(convert(referee(10))).toMatchObject({ referrer_credits: 10, referrer_capped: false });
    expect(credits(REFERRER)).toBe(110);
  });

  it("counts the cap per environment and per referrer", () => {
    for (let i = 0; i < 10; i++) convert(referee(i), { env: "sandbox" });
    expect(convert(referee(10))).toMatchObject({ referrer_credits: 10, referrer_capped: false });
    expect(convert(referee(11), { referrer: OTHER_REFERRER })).toMatchObject({
      referrer_credits: 10,
    });
    expect(rewarded(REFERRER, "sandbox")).toBe(10);
    expect(rewarded(REFERRER, "live")).toBe(1);
  });

  it("does not count unverified (pending) referrals toward the cap", () => {
    for (let i = 0; i < 15; i++) {
      expect(convert(referee(i), { verified: false })).toMatchObject({ reason: "pending" });
    }
    expect(credits(REFERRER)).toBe(0);
    expect(convert(referee(0))).toMatchObject({ referrer_credits: 10, referrer_capped: false });
  });

  it("keeps the existing refusals", () => {
    expect(convert(REFERRER)).toEqual({ ok: false, reason: "self_referral" });
    convert(referee(0));
    expect(convert(referee(0), { referrer: OTHER_REFERRER })).toEqual({
      ok: false,
      reason: "referee_already_referred",
    });
  });

  it("two referees converting at once cannot push the referrer past the cap", async () => {
    for (let i = 0; i < 9; i++) convert(referee(i));
    const exits = await Promise.all([
      convertConcurrently(referee(20)),
      convertConcurrently(referee(21)),
      convertConcurrently(referee(22)),
    ]);
    expect(exits).toEqual([0, 0, 0]);
    expect(rewarded()).toBe(10);
    expect(credits(REFERRER)).toBe(100);
    expect([20, 21, 22].map((n) => credits(referee(n)))).toEqual([10, 10, 10]);
  });

  it("only service_role can execute the conversion", () => {
    for (const role of ["anon", "authenticated"]) {
      const result = rawSql("SET ROLE " + role + "; " + convertCall(referee(0)));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/42501|permission denied/);
    }
  });
});
