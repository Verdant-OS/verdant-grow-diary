import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AI_CREDIT_SERVICE_SIGNATURES,
  evaluateAiCreditServiceContractObservation,
  normalizeSqlDefinition,
} from "../../scripts/lib/aiCreditServiceContractEffect.mjs";
import {
  installPsqlSpawnStub,
  type InstalledPsqlSpawnStub,
  type PsqlSpawnStubResult,
} from "./helpers/psqlSpawnStub";

const ROOT = resolve(__dirname, "..", "..");
const SCRIPT = resolve(ROOT, "scripts", "verify-ai-credit-service-contract-effect.mjs");
const FORWARD = readFileSync(
  resolve(
    ROOT,
    "supabase",
    "migrations",
    "20260727050000_ai_credit_service_contract_forward_reassert.sql",
  ),
  "utf8",
);
const PORTABILITY = readFileSync(
  resolve(ROOT, "supabase", "migrations", "20260728090736_ai_credit_pack_portability.sql"),
  "utf8",
);
const STALE_EXPORT = readFileSync(
  resolve(
    ROOT,
    "supabase",
    "migrations",
    "20260721190058_096c74e5-ecf0-47f5-a8d0-2b79f68b0f43.sql",
  ),
  "utf8",
);

function functionDefinition(source: string, name: "ai_credit_spend" | "ai_credit_refund") {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`Function ${name} not found in fixture migration.`);
  const terminator = "$function$;";
  const end = source.indexOf(terminator, start);
  if (end === -1) throw new Error(`Function ${name} terminator not found in fixture migration.`);
  return source.slice(start, end + terminator.length);
}

const FORWARD_SPEND = functionDefinition(FORWARD, "ai_credit_spend");
const FORWARD_REFUND = functionDefinition(FORWARD, "ai_credit_refund");
const PORTABLE_SPEND = functionDefinition(PORTABILITY, "ai_credit_spend");
const STALE_SPEND = functionDefinition(STALE_EXPORT, "ai_credit_spend");
const STALE_REFUND = functionDefinition(STALE_EXPORT, "ai_credit_refund");

interface FunctionRow {
  signature: string;
  exact_match_count: number;
  identity_arguments: string | null;
  result_type: string | null;
  language: string | null;
  security_definer: boolean | null;
  proconfig: string[] | null;
  service_role_execute: boolean | null;
  authenticated_execute: boolean | null;
  anon_execute: boolean | null;
  definition: string | null;
}

function functionRow(signature: string, definition: string | null): FunctionRow {
  return {
    signature,
    exact_match_count: 1,
    identity_arguments:
      signature === AI_CREDIT_SERVICE_SIGNATURES.spend
        ? "uuid, text, text, uuid, text, text, jsonb"
        : "uuid, uuid, text, text",
    result_type: "jsonb",
    language: "plpgsql",
    security_definer: true,
    proconfig: ["search_path=public, pg_temp"],
    service_role_execute: true,
    authenticated_execute: false,
    anon_execute: false,
    definition,
  };
}

function secureSidecar() {
  const result: Record<string, boolean> = {
    exists: true,
    service_role_select: true,
    service_role_insert: false,
    service_role_update: false,
    service_role_delete: false,
  };
  for (const role of ["authenticated", "anon"]) {
    for (const privilege of ["select", "insert", "update", "delete"]) {
      result[`${role}_${privilege}`] = false;
    }
  }
  return result;
}

function observation(
  options: {
    migrationApplied?: boolean;
    spend?: FunctionRow;
    refund?: FunctionRow;
    sidecar?: Record<string, boolean>;
  } = {},
) {
  return {
    target_env: "live",
    migration_applied: options.migrationApplied ?? true,
    functions: [
      options.spend ?? functionRow(AI_CREDIT_SERVICE_SIGNATURES.spend, FORWARD_SPEND),
      options.refund ?? functionRow(AI_CREDIT_SERVICE_SIGNATURES.refund, FORWARD_REFUND),
    ],
    result_sidecar: options.sidecar ?? secureSidecar(),
  };
}

describe("AI-credit service contract semantic evaluator", () => {
  it("accepts the forward-reassert definitions and keeps all four statuses independent", () => {
    const result = evaluateAiCreditServiceContractObservation(observation());

    expect(result.statuses).toEqual({
      migration_applied: true,
      contract_effective: true,
      definition_drift_detected: false,
      verification_blocked: false,
    });
    expect(result.functions.every((fn) => fn.failed_checks.length === 0)).toBe(true);
  });

  it("accepts the later portability spend body because it preserves and strengthens the asserted invariants", () => {
    const result = evaluateAiCreditServiceContractObservation(
      observation({
        spend: functionRow(AI_CREDIT_SERVICE_SIGNATURES.spend, PORTABLE_SPEND),
      }),
    );

    expect(result.statuses.contract_effective).toBe(true);
    expect(result.statuses.definition_drift_detected).toBe(false);
  });

  it("detects the stale Lovable export bodies without relying on raw textual equality", () => {
    const result = evaluateAiCreditServiceContractObservation(
      observation({
        spend: functionRow(AI_CREDIT_SERVICE_SIGNATURES.spend, STALE_SPEND),
        refund: functionRow(AI_CREDIT_SERVICE_SIGNATURES.refund, STALE_REFUND),
      }),
    );

    expect(result.statuses).toMatchObject({
      migration_applied: true,
      contract_effective: false,
      definition_drift_detected: true,
      verification_blocked: false,
    });
    const failed = result.functions.flatMap((fn) => fn.failed_checks.map((check) => check.id));
    expect(failed).toEqual(
      expect.arrayContaining([
        "inline_result_rejected",
        "result_sidecar_join",
        "funding_source_preserved",
      ]),
    );
  });

  it("normalizes comments, whitespace, and unquoted case but preserves quoted values", () => {
    expect(
      normalizeSqlDefinition(
        "SELECT /* irrelevant */ Foo\n-- ignored\n FROM Bar WHERE x = 'MiXeD';",
      ),
    ).toBe("select foo from bar where x = 'MiXeD';");
  });

  it("reports an exact-signature miss as measured drift, not an access blocker", () => {
    const missingSpend = {
      ...functionRow(AI_CREDIT_SERVICE_SIGNATURES.spend, null),
      exact_match_count: 0,
      identity_arguments: null,
      result_type: null,
      language: null,
      security_definer: null,
      proconfig: null,
      service_role_execute: null,
      authenticated_execute: null,
      anon_execute: null,
    };
    const result = evaluateAiCreditServiceContractObservation(observation({ spend: missingSpend }));

    expect(result.statuses.contract_effective).toBe(false);
    expect(result.statuses.definition_drift_detected).toBe(true);
    expect(result.statuses.verification_blocked).toBe(false);
  });

  it("fails closed with unknown effect and drift when an existing definition is unreadable", () => {
    const result = evaluateAiCreditServiceContractObservation(
      observation({
        spend: functionRow(AI_CREDIT_SERVICE_SIGNATURES.spend, null),
      }),
    );

    expect(result.statuses.contract_effective).toBeNull();
    expect(result.statuses.definition_drift_detected).toBeNull();
    expect(result.statuses.verification_blocked).toBe(true);
  });

  it("rejects missing, duplicate, or unexpected observation rows as unreadable input", () => {
    const valid = observation();
    expect(() =>
      evaluateAiCreditServiceContractObservation({ ...valid, functions: [valid.functions[0]] }),
    ).toThrow(/exactly one row/);
    expect(() =>
      evaluateAiCreditServiceContractObservation({
        ...valid,
        functions: [valid.functions[0], valid.functions[0]],
      }),
    ).toThrow(/exactly one row/);
  });

  it("distinguishes privilege drift from function-body drift", () => {
    const unsafeSidecar = { ...secureSidecar(), service_role_insert: true };
    const result = evaluateAiCreditServiceContractObservation(
      observation({ sidecar: unsafeSidecar }),
    );

    expect(result.statuses.contract_effective).toBe(false);
    expect(result.statuses.definition_drift_detected).toBe(false);
    expect(result.statuses.verification_blocked).toBe(false);
  });

  it("does not let a healthy current body rewrite missing migration history", () => {
    const result = evaluateAiCreditServiceContractObservation(
      observation({ migrationApplied: false }),
    );

    expect(result.statuses).toEqual({
      migration_applied: false,
      contract_effective: true,
      definition_drift_detected: false,
      verification_blocked: false,
    });
  });
});

const PRODUCTION_REF = "knkwiiywfkbqznbxwqfh";
let tempDir: string;
let psqlStub: InstalledPsqlSpawnStub | undefined;

function directUrl(password: string) {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${PRODUCTION_REF}.supabase.co:5432/postgres?sslmode=require`;
}

function installPsql(stub: PsqlSpawnStubResult) {
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
  if (psqlStub) env.NODE_OPTIONS = psqlStub.nodeOptions;
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ai-credit-effect-"));
  psqlStub = undefined;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("AI-credit service contract process boundary", () => {
  it("passes a complete observation while keeping the database URL off argv and artifacts", () => {
    const dbUrl = directUrl("effect-verifier-secret");
    const payload = observation();
    const reportPath = join(tempDir, "report.md");
    const auditPath = join(tempDir, "audit.json");
    installPsql({ stdout: `${JSON.stringify(payload)}\n` });

    const result = runScript({
      SUPABASE_DB_URL: dbUrl,
      TARGET_ENV: "live",
      REPORT_PATH: reportPath,
      AUDIT_PATH: auditPath,
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      migration_applied: true,
      contract_effective: true,
      definition_drift_detected: false,
      verification_blocked: false,
    });
    const invocation = psqlStub?.readInvocation();
    expect(invocation?.args.join(" ")).not.toContain(dbUrl);
    expect(invocation?.args.join(" ")).not.toContain("effect-verifier-secret");
    expect(invocation?.env.PGHOST).toBe(`db.${PRODUCTION_REF}.supabase.co`);
    expect(invocation?.env.PGCONNECT_TIMEOUT).toBe("15");
    const persisted = `${readFileSync(reportPath, "utf8")}\n${readFileSync(auditPath, "utf8")}`;
    expect(persisted).not.toContain("effect-verifier-secret");
    expect(persisted).not.toContain("postgresql://");
    expect(persisted).not.toContain("CREATE OR REPLACE FUNCTION");
  });

  it("withholds raw psql diagnostics and emits four unknown/blocked statuses", () => {
    const secret = "diagnostic-secret";
    const rawDiagnostic = `connection failed for postgresql://postgres:${secret}@db.example/postgres`;
    const auditPath = join(tempDir, "blocked.json");
    installPsql({ stderr: rawDiagnostic, exit: 2 });

    const result = runScript({
      SUPABASE_DB_URL: directUrl(secret),
      TARGET_ENV: "live",
      AUDIT_PATH: auditPath,
    });

    expect(result.status).toBe(5);
    expect(result.stderr).toContain("Raw diagnostics were withheld");
    const observable = `${result.stdout}\n${result.stderr}\n${readFileSync(auditPath, "utf8")}`;
    expect(observable).not.toContain(secret);
    expect(observable).not.toContain(rawDiagnostic);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      migration_applied: null,
      contract_effective: null,
      definition_drift_detected: null,
      verification_blocked: true,
    });
  });

  it("rejects a sandbox URL for a live run before psql is invoked", () => {
    const wrongUrl =
      "postgresql://postgres:wrong-target-secret@db.bzatgtgjvuojpoxcknaa.supabase.co:5432/postgres?sslmode=require";
    const result = runScript({ SUPABASE_DB_URL: wrongUrl, TARGET_ENV: "live" });

    expect(result.status).toBe(6);
    expect(result.stderr).toContain("Database target identity rejected");
    expect(result.stderr).not.toContain("wrong-target-secret");
    expect(psqlStub).toBeUndefined();
  });

  it("turns an incomplete catalog payload into a blocked verdict", () => {
    const incomplete = { ...observation(), functions: [] };
    installPsql({ stdout: `${JSON.stringify(incomplete)}\n` });

    const result = runScript({
      SUPABASE_DB_URL: directUrl("incomplete-payload-secret"),
      TARGET_ENV: "live",
    });

    expect(result.status).toBe(7);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      migration_applied: null,
      contract_effective: null,
      definition_drift_detected: null,
      verification_blocked: true,
    });
  });

  it("persists a blocked report when no connection is configured", () => {
    const auditPath = join(tempDir, "no-connection.json");
    const result = runScript({
      TARGET_ENV: "unspecified",
      SUPABASE_DB_URL: "",
      AUDIT_PATH: auditPath,
    });

    expect(result.status).toBe(3);
    expect(existsSync(auditPath)).toBe(true);
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    expect(audit.statuses.verification_blocked).toBe(true);
    expect(audit.statuses.migration_applied).toBeNull();
  });
});
