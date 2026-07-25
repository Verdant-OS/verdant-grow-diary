import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSupabaseDatabaseTargetIdentity,
  databaseTargetForEnvironment,
  parseSupabaseDatabaseUrl,
  SUPABASE_DATABASE_TARGETS,
} from "../../scripts/lib/supabaseDatabaseTargetIdentity.mjs";
import {
  EXIT,
  runRequiredCoreMigrationsApplied,
} from "../../scripts/assert-required-core-migrations-applied.mjs";
import {
  ADVISORY_SCHEMA,
  REQUIRED_CORE_MIGRATIONS,
  REQUIRED_CORE_SCHEMA,
  manifestForScope,
  schemaKey,
} from "../../scripts/required-core-migrations.mjs";

const SANDBOX_REF = "bzatgtgjvuojpoxcknaa";
const PRODUCTION_REF = "knkwiiywfkbqznbxwqfh";
const PASSWORD = "gate-test-password";
const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");
const WORKFLOW_PATH = resolve(__dirname, "../../.github/workflows/required-core-migrations.yml");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function directUrl(ref: string, port = 5432, password = PASSWORD) {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:${port}/postgres?sslmode=require`;
}

function sharedUrl(ref: string, port = 5432, password = PASSWORD) {
  return `postgres://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:${port}/postgres?sslmode=require`;
}

function captureLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
    },
  };
}

describe("Supabase database target identity", () => {
  it("pins the only two remote targets and their protected environments", () => {
    expect(SUPABASE_DATABASE_TARGETS).toEqual({
      sandbox: {
        projectRef: SANDBOX_REF,
        githubEnvironment: "verdant-sandbox",
      },
      production: {
        projectRef: PRODUCTION_REF,
        githubEnvironment: "verdant-production",
      },
    });
  });

  it.each([
    [directUrl(SANDBOX_REF), "direct"],
    [directUrl(SANDBOX_REF, 6543), "dedicated-pooler"],
    [sharedUrl(SANDBOX_REF), "shared-supavisor-session"],
    [sharedUrl(SANDBOX_REF, 6543), "shared-supavisor-transaction"],
    [directUrl(SANDBOX_REF).replace("sslmode=require", "sslmode=verify-ca"), "direct"],
    [directUrl(SANDBOX_REF).replace("sslmode=require", "sslmode=verify-full"), "direct"],
  ])("accepts documented sandbox URL form %#", (url, expectedMode) => {
    expect(
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "sandbox",
        databaseUrl: url,
      }),
    ).toMatchObject({
      targetEnv: "sandbox",
      projectRef: SANDBOX_REF,
      connectionMode: expectedMode,
    });
  });

  it("accepts the pinned production project and never aliases it to sandbox", () => {
    expect(
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "production",
        databaseUrl: sharedUrl(PRODUCTION_REF, 6543),
      }).projectRef,
    ).toBe(PRODUCTION_REF);
    expect(() =>
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "sandbox",
        databaseUrl: sharedUrl(PRODUCTION_REF, 6543),
      }),
    ).toThrow(/pinned sandbox project/i);
  });

  it.each(["", "live", "prod", "Production", "sandbox ", "SANDBOX"])(
    "rejects unknown target environment %j",
    (targetEnv) => {
      expect(() => databaseTargetForEnvironment(targetEnv)).toThrow(
        /exactly sandbox or production/i,
      );
    },
  );

  it.each([
    ["wrong direct project", directUrl(PRODUCTION_REF)],
    ["wrong shared project", sharedUrl(PRODUCTION_REF)],
    [
      "conflicting direct username ref",
      `postgres://postgres.${PRODUCTION_REF}:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
    ["routing query override", `${directUrl(SANDBOX_REF)}&host=db.${PRODUCTION_REF}.supabase.co`],
    ["duplicate sslmode", `${directUrl(SANDBOX_REF)}&sslmode=disable`],
    [
      "lookalike direct host",
      `postgres://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co.attacker.invalid:5432/postgres?sslmode=require`,
    ],
    [
      "lookalike pooler host",
      `postgres://postgres.${SANDBOX_REF}:${PASSWORD}@aws-0-us-east-1.pooler.supabase.com.attacker.invalid:5432/postgres?sslmode=require`,
    ],
    [
      "unsupported pooler host",
      `postgres://postgres.${SANDBOX_REF}:${PASSWORD}@attacker.pooler.supabase.com:5432/postgres?sslmode=require`,
    ],
    [
      "missing shared project ref",
      `postgres://postgres:${PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    ],
    [
      "wrong direct user",
      `postgres://readonly:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
    [
      "missing password",
      `postgres://postgres@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
    [
      "wrong database",
      `postgres://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/app?sslmode=require`,
    ],
    [
      "unsupported port",
      `postgres://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:6432/postgres?sslmode=require`,
    ],
    [
      "unsupported protocol",
      `https://postgres:${PASSWORD}@db.${SANDBOX_REF}.supabase.co:5432/postgres?sslmode=require`,
    ],
  ])("rejects %s before a database client can run", (_label, url) => {
    expect(() =>
      assertSupabaseDatabaseTargetIdentity({
        targetEnv: "sandbox",
        databaseUrl: url,
      }),
    ).toThrow();
  });

  it.each(["disable", "allow", "prefer"])("rejects downgrade-capable sslmode=%s", (sslmode) => {
    expect(() =>
      parseSupabaseDatabaseUrl(
        directUrl(SANDBOX_REF).replace("sslmode=require", `sslmode=${sslmode}`),
      ),
    ).toThrow(/sslmode=require, verify-ca, or verify-full/i);
  });

  it("rejects a connection URL that does not explicitly require TLS", () => {
    expect(() =>
      parseSupabaseDatabaseUrl(directUrl(SANDBOX_REF).replace("?sslmode=require", "")),
    ).toThrow(/non-downgradable TLS/i);
  });

  it("returns only non-secret identity metadata", () => {
    const parsed = parseSupabaseDatabaseUrl(directUrl(SANDBOX_REF, 5432, "do-not-return-this"));
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("do-not-return-this");
    expect(serialized).not.toContain("postgres://");
    expect(parsed).toEqual({
      projectRef: SANDBOX_REF,
      connectionMode: "direct",
      hostname: `db.${SANDBOX_REF}.supabase.co`,
      port: 5432,
    });
  });
});

describe("required core schema manifest", () => {
  it("maps request_hash and plant_type to the additive forward repair", () => {
    const repair = "20260725023000_core_schema_forward_repair.sql";
    const migrationFor = (key: string) =>
      REQUIRED_CORE_SCHEMA.find((entry) => schemaKey(entry) === key)?.migration;
    expect(migrationFor("quicklog_idempotency.request_hash")).toBe(repair);
    expect(migrationFor("plants.plant_type")).toBe(repair);
  });

  it("guards the complete Quick Log audit INSERT contract", () => {
    const auditEntries = REQUIRED_CORE_SCHEMA.filter(
      (candidate) => candidate.table === "quicklog_audit_events",
    );
    expect(auditEntries.map((entry) => entry.column).sort()).toEqual(
      ["user_id", "idempotency_key", "grow_event_id", "status", "reason"].sort(),
    );
    expect(new Set(auditEntries.map((entry) => entry.migration))).toEqual(
      new Set(["20260610230856_e8544509-5a66-41bc-8beb-39c95d96dde5.sql"]),
    );
  });

  it("guards the full feeding INSERT contract, not only ALTER-added columns", () => {
    const feedingColumns = REQUIRED_CORE_SCHEMA.filter((entry) => entry.table === "feeding_events")
      .map((entry) => entry.column)
      .sort();
    expect(feedingColumns).toEqual(
      [
        "event_id",
        "user_id",
        "line_id",
        "products",
        "volume_ml",
        "ph",
        "ec_in",
        "ec_out",
        "runoff_ml",
        "runoff_ph",
        "runoff_ec",
        "water_temp_c",
      ].sort(),
    );
  });

  it("keeps candidate_number advisory and out of the blocking manifest", () => {
    expect(REQUIRED_CORE_SCHEMA.map(schemaKey)).not.toContain("plants.candidate_number");
    expect(ADVISORY_SCHEMA.map(schemaKey)).toEqual(["plants.candidate_number"]);
    expect(manifestForScope("advisory")).toBe(ADVISORY_SCHEMA);
  });

  it("rejects unknown manifest scopes and hostile identifiers", () => {
    expect(() => manifestForScope("pro")).toThrow();
    expect(() => schemaKey({ table: "plants; drop table plants", column: "id" })).toThrow();
    expect(() => schemaKey({ table: "plants", column: "x' OR true--" })).toThrow();
  });

  it("contains no duplicate requirements and names only present migration files", () => {
    const allEntries = [...REQUIRED_CORE_SCHEMA, ...ADVISORY_SCHEMA];
    const keys = allEntries.map(schemaKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of allEntries) {
      expect(entry.reason.trim().length).toBeGreaterThan(0);
      expect(
        readdirSync(MIGRATIONS_DIR).includes(entry.migration),
        `${schemaKey(entry)} -> ${entry.migration}`,
      ).toBe(true);
    }
    expect(new Set(REQUIRED_CORE_MIGRATIONS).size).toBe(REQUIRED_CORE_MIGRATIONS.length);
  });
});

describe("remote applied-schema runner safety", () => {
  it("does not invoke psql when target identity validation fails", () => {
    let psqlCalls = 0;
    const { logger } = captureLogger();
    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: directUrl(PRODUCTION_REF),
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return { status: 0, stdout: "" };
      },
      logger,
    });
    expect(status).toBe(EXIT.TARGET_IDENTITY_INVALID);
    expect(psqlCalls).toBe(0);
  });

  it("does not accept PGHOST or DATABASE_URL as a connection fallback", () => {
    let psqlCalls = 0;
    const { logger } = captureLogger();
    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        PGHOST: `db.${SANDBOX_REF}.supabase.co`,
        PGUSER: "postgres",
        DATABASE_URL: directUrl(SANDBOX_REF),
      },
      spawnImpl: () => {
        psqlCalls += 1;
        return { status: 0, stdout: "" };
      },
      logger,
    });
    expect(status).toBe(EXIT.NO_DB_CONNECTION);
    expect(psqlCalls).toBe(0);
  });

  it("passes the URL through child env, strips ambient routing env, and queries only tables", () => {
    const url = directUrl(SANDBOX_REF, 5432, "argv-secret-sentinel");
    const calls: Array<{
      command: string;
      args: string[];
      env: Record<string, string | undefined>;
    }> = [];
    const stdout = REQUIRED_CORE_SCHEMA.map(schemaKey).join("\n");
    const { logger } = captureLogger();

    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: url,
        DATABASE_URL: "postgres://must-not-survive",
        PGHOST: "attacker.invalid",
        PGPASSWORD: "ambient-secret",
        OTHER_PROTECTED_SECRET: "must-not-reach-psql",
        PATH: process.env.PATH,
      },
      spawnImpl: (command, args, options) => {
        calls.push({
          command,
          args: [...args],
          env: { ...options.env },
        });
        return { status: 0, stdout, stderr: "" };
      },
      logger,
    });

    expect(status).toBe(EXIT.OK);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("psql");
    expect(calls[0].args.join(" ")).not.toContain(url);
    expect(calls[0].args.join(" ")).not.toContain("argv-secret-sentinel");
    expect(calls[0].env.PGDATABASE).toBe(url);
    expect(calls[0].env.PGHOST).toBeUndefined();
    expect(calls[0].env.PGPASSWORD).toBeUndefined();
    expect(calls[0].env.DATABASE_URL).toBeUndefined();
    expect(calls[0].env.OTHER_PROTECTED_SECRET).toBeUndefined();
    const sql = calls[0].args.at(-1) ?? "";
    expect(sql).toContain("c.relkind IN ('r','p')");
    expect(sql).not.toMatch(/c\.relkind IN \([^)]*['"]v['"]/);
    expect(sql).not.toMatch(/c\.relkind IN \([^)]*['"]m['"]/);
    expect(sql).not.toMatch(/c\.relkind IN \([^)]*['"]f['"]/);
  });

  it("suppresses raw psql stderr and secret sentinels from logs and artifacts", () => {
    const sentinel = "RAW-PSQL-SECRET-SENTINEL";
    const url = directUrl(SANDBOX_REF, 5432, sentinel);
    const dir = mkdtempSync(join(tmpdir(), "core-schema-gate-"));
    tempDirs.push(dir);
    const reportPath = join(dir, "report.md");
    const auditPath = join(dir, "audit.json");
    const { logger, lines } = captureLogger();

    const status = runRequiredCoreMigrationsApplied({
      env: {
        TARGET_ENV: "sandbox",
        SUPABASE_DB_URL: url,
        REPORT_PATH: reportPath,
        AUDIT_PATH: auditPath,
      },
      spawnImpl: () => ({
        status: 1,
        stdout: "",
        stderr: `psql: could not connect using ${url}`,
      }),
      logger,
    });

    expect(status).toBe(EXIT.SCHEMA_QUERY_FAILED);
    const observable = [
      ...lines,
      readFileSync(reportPath, "utf8"),
      readFileSync(auditPath, "utf8"),
    ].join("\n");
    expect(observable).not.toContain(sentinel);
    expect(observable).not.toContain(url);
    expect(observable).not.toContain("could not connect using");
    expect(observable).toContain("stderr was suppressed");
  });
});

describe("required-core-migrations workflow trust boundary", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const manifestStart = workflow.indexOf("  manifest-and-files:");
  const sandboxStart = workflow.indexOf("  verify-sandbox:");
  const productionStart = workflow.indexOf("  verify-production:");
  const manifestBlock = workflow.slice(manifestStart, sandboxStart);
  const sandboxBlock = workflow.slice(sandboxStart, productionStart);
  const productionBlock = workflow.slice(productionStart);

  it("gives pull requests one offline job with no remote secret or environment", () => {
    expect(workflow).toMatch(/\n {2}pull_request:\s*\n/);
    expect(manifestStart).toBeGreaterThan(0);
    expect(sandboxStart).toBeGreaterThan(manifestStart);
    expect(manifestBlock).not.toContain("secrets.");
    expect(manifestBlock).not.toMatch(/\n {4}environment:/);
    expect(manifestBlock).toContain("src/test/required-core-migrations-gate.test.ts");
  });

  it("allows sandbox remote access only on the deploy branch or manual dispatch", () => {
    expect(sandboxBlock).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/verdant-grow-diary'",
    );
    expect(sandboxBlock).toContain(
      "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'sandbox'",
    );
    expect(sandboxBlock).not.toContain("pull_request");
    expect(sandboxBlock).toContain("environment: verdant-sandbox");
    expect(sandboxBlock.match(/secrets\.SUPABASE_DB_URL_SANDBOX/g)).toHaveLength(2);
    expect(sandboxBlock).not.toMatch(/SUPABASE_DB_URL:\s*\$\{\{\s*secrets\.SUPABASE_DB_URL\s*\}\}/);
  });

  it("allows production remote access only by manual dispatch from the deploy branch", () => {
    expect(productionBlock).toContain("github.ref == 'refs/heads/verdant-grow-diary'");
    expect(productionBlock).toContain(
      "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/verdant-grow-diary' && inputs.target_env == 'production'",
    );
    expect(productionBlock).not.toContain("github.event_name == 'push'");
    expect(productionBlock).not.toContain("pull_request");
    expect(productionBlock).toContain("environment: verdant-production");
    expect(productionBlock).toContain("secrets.SUPABASE_DB_URL");
  });

  it("never references the retired live repository secret", () => {
    expect(workflow).not.toContain("SUPABASE_DB_URL_LIVE");
  });
});
