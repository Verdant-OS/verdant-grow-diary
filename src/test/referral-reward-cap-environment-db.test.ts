/**
 * Codex P1 4237026439: a pending referral stored as live and later verified
 * as sandbox must consume the sandbox cap, not the live cap.
 * Disposable PostgreSQL on a private socket. No hosted database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REFERRER = "00000000-0000-4000-8000-0000000e0000";
const referee = (n: number) => `00000000-0000-4000-8000-${String(300 + n).padStart(12, "0")}`;
const childEnv = { PATH: process.env.PATH, LC_ALL: "C" };
const migrations = [
  "20260721103000_ai_credit_grants.sql",
  "20260721105000_ai_credit_grants_non_paddle_grants.sql",
  "20260721106000_referrals_conversion.sql",
  "20261003020000_referral_referrer_monthly_cap.sql",
  "20261014010000_referral_cap_counts_deleted_referees.sql",
];
let workdir = "";
let dataDir = "";
let binDir = "";
let started = false;

function literal(value: string): string {
  return "'" + value.replaceAll("'", "''") + "'";
}

function sql(query: string): string {
  const result = spawnSync(
    join(binDir, "psql"),
    [
      "-X",
      "--no-password",
      "-qAt",
      "-h",
      workdir,
      "-p",
      "55436",
      "-U",
      "referral_cap_admin",
      "-d",
      "postgres",
      "--set=ON_ERROR_STOP=1",
    ],
    { input: query, encoding: "utf8", env: childEnv, timeout: 15_000 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "PostgreSQL command failed");
  }
  return result.stdout.trim();
}

beforeAll(() => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    throw new Error("BLOCKED: run as a non-root Unix user with PostgreSQL server tools.");
  }
  const discovery = spawnSync("pg_config", ["--bindir"], { encoding: "utf8", env: childEnv });
  if (discovery.status !== 0) throw new Error("BLOCKED: PostgreSQL tools required.");
  binDir = discovery.stdout.trim();
  workdir = mkdtempSync(join(tmpdir(), "referral-cap-env-"));
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
    ],
    { env: childEnv, stdio: "pipe", timeout: 20_000 },
  );
  writeFileSync(
    join(dataDir, "postgresql.auto.conf"),
    "listen_addresses = ''\nunix_socket_directories = " +
      literal(workdir) +
      "\nport = 55436\nfsync = off\n",
  );
  execFileSync(
    join(binDir, "pg_ctl"),
    ["-D", dataDir, "-l", join(workdir, "postgres.log"), "-w", "start"],
    {
      env: childEnv,
      stdio: "pipe",
      timeout: 20_000,
    },
  );
  started = true;
  const users = [REFERRER, ...Array.from({ length: 12 }, (_, i) => referee(i))];
  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    INSERT INTO auth.users VALUES ${users.map((id) => "(" + literal(id) + ")").join(",")};
  `);
  for (const file of migrations) {
    if (!existsSync(resolve("supabase/migrations", file))) throw new Error("missing " + file);
    sql(readFileSync(resolve("supabase/migrations", file), "utf8"));
  }
}, 60_000);

afterAll(() => {
  if (started) {
    execFileSync(join(binDir, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      env: childEnv,
      stdio: "pipe",
      timeout: 20_000,
    });
  }
  if (workdir) rmSync(workdir, { recursive: true, force: true });
}, 30_000);

function convert(refereeId: string, env: "live" | "sandbox", verified: boolean) {
  return JSON.parse(
    sql(
      "SET ROLE service_role; SELECT public.convert_referral(" +
        [REFERRER, refereeId, "CODE", env].map(literal).join(",") +
        ", " +
        String(verified) +
        ");",
    ),
  );
}

describe("referral cap uses the conversion environment", () => {
  it("counts a live-captured sandbox verification against sandbox, not live", () => {
    for (let i = 0; i < 10; i++) {
      expect(convert(referee(i), "live", false)).toMatchObject({ reason: "pending" });
      expect(convert(referee(i), "sandbox", true)).toMatchObject({
        referrer_credits: 10,
        referrer_capped: false,
      });
    }
    expect(convert(referee(10), "live", false)).toMatchObject({ reason: "pending" });
    expect(convert(referee(10), "sandbox", true)).toMatchObject({
      referrer_credits: 0,
      referee_credits: 10,
      referrer_capped: true,
    });
    expect(
      sql(
        "SELECT environment FROM public.referrals WHERE referee_user_id = " +
          literal(referee(0)) +
          ";",
      ),
    ).toBe("sandbox");
    expect(convert(referee(11), "live", true)).toMatchObject({
      referrer_credits: 10,
      referrer_capped: false,
    });
    expect(
      sql(
        "SELECT environment || ':' || coalesce(sum(credits),0) FROM public.ai_credit_grants WHERE user_id = " +
          literal(REFERRER) +
          " GROUP BY environment ORDER BY environment;",
      ),
    ).toBe("live:10\nsandbox:100");
  });
});
