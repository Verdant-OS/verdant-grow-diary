import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installPsqlSpawnStub,
  type InstalledPsqlSpawnStub,
  type PsqlSpawnStubResult,
} from "./helpers/psqlSpawnStub";
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "../../scripts/required-money-migrations.mjs";

const SCRIPT = resolve(
  __dirname,
  "..",
  "..",
  "scripts",
  "assert-required-money-migrations-applied.mjs",
);
const SANDBOX_REF = "bzatgtgjvuojpoxcknaa";
const PRODUCTION_REF = "knkwiiywfkbqznbxwqfh";

function sharedUrl(username: string, password: string, port = 5432): string {
  return `postgresql://${username}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:${port}/postgres?sslmode=require`;
}

function directUrl(ref: string, password: string): string {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
}

let tempDir: string;
let psqlStub: InstalledPsqlSpawnStub | undefined;

function installPsql(stub: PsqlSpawnStubResult): void {
  psqlStub = installPsqlSpawnStub(tempDir, stub);
}

function runScript(envOverrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string> = {
    HOME: process.env.HOME ?? "/root",
    PATH: process.env.PATH ?? "",
  };
  for (const key of ["COMSPEC", "PATHEXT", "SystemRoot", "WINDIR"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  if (psqlStub) {
    env.NODE_OPTIONS = psqlStub.nodeOptions;
  }
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env,
  });
}

function artifactPath(name: string): string {
  return join(tempDir, name);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "money-applied-security-"));
  psqlStub = undefined;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("assert-required-money-migrations-applied process boundary", () => {
  it("preserves the successful migration verdict while keeping the DB URL off argv", () => {
    const allApplied = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    const dbUrl = sharedUrl("readonly", "argv-canary-secret");
    installPsql({ stdout: `${allApplied}\n` });

    const result = runScript({
      DATABASE_URL: "postgresql://ambient-database-url.invalid/decoy",
      PGHOST: "ambient-host.invalid",
      PGHOSTADDR: "203.0.113.10",
      PGPASSFILE: "C:/ambient/pgpass",
      PGPASSWORD: "ambient-password-canary",
      PGSERVICE: "ambient-service",
      SUPABASE_ACCESS_TOKEN: "ambient-supabase-token-canary",
      SUPABASE_DB_URL: dbUrl,
      SUPABASE_DB_URL_LIVE: "postgresql://ambient-live.invalid/decoy",
      TARGET_ENV: "sandbox",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `All ${REQUIRED_MONEY_MIGRATIONS.length} money-critical migrations applied`,
    );
    const invocation = psqlStub?.readInvocation();
    expect(invocation).toBeDefined();
    expect(invocation?.args.join(" ")).not.toContain(dbUrl);
    expect(invocation?.args.join(" ")).not.toContain("argv-canary-secret");
    const canonical = new URL(dbUrl);
    canonical.username = `postgres.${SANDBOX_REF}`;
    canonical.search = "";
    expect(invocation?.env).toEqual({
      PGDATABASE: canonical.toString(),
      PGSSLMODE: "require",
    });
  });

  it("withholds raw psql stderr from logs and every persisted audit artifact", () => {
    const rawDiagnostic =
      "psql: connection failed for postgresql://money_user:raw-stderr-secret@db.example/verdant\n";
    const reportPath = artifactPath("report.md");
    const auditPath = artifactPath("audit.json");
    const diffPath = artifactPath("diff.txt");
    installPsql({ stderr: rawDiagnostic, exit: 1 });

    const result = runScript({
      AUDIT_PATH: auditPath,
      DIFF_PATH: diffPath,
      REPORT_PATH: reportPath,
      SUPABASE_DB_URL: directUrl(PRODUCTION_REF, "raw-stderr-secret"),
      TARGET_ENV: "live",
    });

    expect(result.status).toBe(5);
    expect(result.stderr).toContain("Raw psql diagnostics were withheld");
    const persisted = [reportPath, auditPath, diffPath]
      .filter(existsSync)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const observableOutput = `${result.stdout}\n${result.stderr}\n${persisted}`;
    expect(observableOutput).not.toContain(rawDiagnostic.trim());
    expect(observableOutput).not.toContain("raw-stderr-secret");
    expect(observableOutput).not.toContain("postgresql://");
  });

  it("rejects a protected target mismatch before psql and emits only a sanitized reason", () => {
    const secret = "wrong-target-secret";
    const dbUrl = directUrl(PRODUCTION_REF, secret);

    const result = runScript({
      SUPABASE_DB_URL: dbUrl,
      TARGET_ENV: "sandbox",
    });

    expect(result.status).toBe(6);
    expect(result.stderr).toContain("Database target identity rejected (project_ref_mismatch)");
    expect(result.stderr).toContain("psql was not invoked");
    expect(result.stderr).not.toContain(secret);
    expect(result.stderr).not.toContain(dbUrl);
    expect(psqlStub).toBeUndefined();
  });

  it("fails closed before spawning psql when no connection is configured", () => {
    const result = runScript({
      SUPABASE_DB_URL: "",
      TARGET_ENV: "unspecified",
    });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain("No database connection configured");
    expect(psqlStub).toBeUndefined();
  });

  it("preserves the documented PGHOST connection mode for unspecified local checks", () => {
    const allApplied = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    installPsql({ stdout: `${allApplied}\n` });

    const result = runScript({
      PGHOST: "stub-host",
      PGPASSFILE: "C:/intentional/pgpass",
      TARGET_ENV: "unspecified",
    });

    expect(result.status).toBe(0);
    const invocation = psqlStub?.readInvocation();
    expect(invocation?.env.PGHOST).toBe("stub-host");
    expect(invocation?.env.PGPASSFILE).toBe("C:/intentional/pgpass");
    expect(invocation?.env.PGDATABASE).toBeUndefined();
  });

  it("does not allow PGHOST to bypass a protected target binding", () => {
    const result = runScript({
      PGHOST: "attacker.invalid",
      PGPASSWORD: "ambient-secret",
      TARGET_ENV: "sandbox",
    });

    expect(result.status).toBe(6);
    expect(result.stderr).toContain("missing_protected_database_url");
    expect(result.stderr).toContain("psql was not invoked");
    expect(result.stderr).not.toContain("ambient-secret");
    expect(result.stderr).not.toContain("attacker.invalid");
  });
});
