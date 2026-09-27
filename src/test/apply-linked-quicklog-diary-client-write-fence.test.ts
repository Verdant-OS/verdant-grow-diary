import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import * as lane from "../../scripts/apply-linked-quicklog-diary-client-write-fence.mjs";
import { PRODUCTION_SUPABASE_CA_FILENAME } from "../../scripts/lib/productionSupabaseTls.mjs";
import {
  BOOLEAN_KEYS,
  CATALOG_STATE_QUERY_SQL,
  INTEGER_KEYS,
  PREREQUISITE_KEYS,
  RESULT_KEYS,
} from "../../scripts/lib/linkedQuicklogDiaryDeliveryCatalog.mjs";
import { disposableConnection } from "../../scripts/run-linked-diary-delivery-pg15-harness.mjs";

const MIGRATION = "supabase/migrations/20260927094000_linked_quicklog_diary_client_write_fence.sql";
const WORKFLOW = resolve(".github/workflows/apply-linked-quicklog-diary-client-write-fence.yml");
const VERIFIER = resolve(
  "scripts/verify-linked-quicklog-diary-client-write-fence-preflight-artifact.mjs",
);

function committedMigration() {
  return execFileSync("git", ["show", `HEAD:${MIGRATION}`]);
}

function state(overrides: Record<string, unknown> = {}) {
  const value = Object.fromEntries(
    RESULT_KEYS.map((key) => [
      key,
      key === "ledger_exact_names"
        ? []
        : BOOLEAN_KEYS.includes(key)
          ? false
          : INTEGER_KEYS.includes(key)
            ? 0
            : null,
    ]),
  );
  for (const key of PREREQUISITE_KEYS) value[key] = true;
  value.diary_table_oid = 41000;
  return { ...value, ...overrides };
}

const canonical = state({
  insert_policy_count: 1,
  insert_policy_contract: true,
  delete_policy_count: 1,
  delete_policy_contract: true,
  guard_function_overload_count: 1,
  guard_function_oid: 42000,
  guard_function_contract: true,
  guard_function_source_contract: true,
  guard_trigger_count: 1,
  guard_trigger_contract: true,
});

const HEAD = "a".repeat(40);
const temporaryRoots: string[] = [];

function deliveryEnv(extra: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "verdant-linked-diary-delivery-test-"));
  temporaryRoots.push(root);
  const caPath = join(root, PRODUCTION_SUPABASE_CA_FILENAME);
  const ca = rootCertificates[0];
  if (!ca) throw new Error("Node root certificate is required for delivery tests");
  writeFileSync(caPath, ca, { mode: 0o600 });
  return {
    OPERATION: "PREFLIGHT",
    TARGET_ENV: "production",
    EXPECTED_HEAD_SHA: HEAD,
    CURRENT_DEPLOY_HEAD_SHA: HEAD,
    GITHUB_SHA: HEAD,
    GITHUB_REF_NAME: "verdant-grow-diary",
    GITHUB_REPOSITORY: "Verdant-OS/verdant-grow-diary",
    GITHUB_REPOSITORY_ID: "8675309",
    GITHUB_RUN_ID: "24680",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "Verdant-OS/verdant-grow-diary/.github/workflows/apply-linked-quicklog-diary-client-write-fence.yml@refs/heads/verdant-grow-diary",
    CONFIRM_PROJECT_REF: "knkwiiywfkbqznbxwqfh",
    CONFIRM_APPLY: lane.APPLY_CONFIRMATION,
    PREFLIGHT_RUN_ID: "13579",
    PREFLIGHT_RECEIPT_DIGEST: "",
    SOLO_FOUNDER_ACKNOWLEDGEMENT: "I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN",
    SOLO_FOUNDER_DELIVERY_MODE: "solo_founder_self_review_v1",
    SOLO_FOUNDER_VERIFIED_USER_ID: "72639960",
    SOLO_FOUNDER_VERIFIED_LOGIN: "cheekhimself",
    SOLO_FOUNDER_VERIFIED_ENVIRONMENT: "verdant-production-solo-founder",
    SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED: "true",
    SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED: "true",
    SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED: "true",
    SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS: "900",
    SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS: "86400",
    SUPABASE_DB_URL:
      "postgresql://postgres:local-test-only@db.knkwiiywfkbqznbxwqfh.supabase.co:5432/postgres?sslmode=require",
    SUPABASE_DB_CA_CERT_PATH: caPath,
    REPORT_PATH: join(root, "report.md"),
    AUDIT_PATH: join(root, "audit.json"),
    PREFLIGHT_RECEIPT_PATH: join(root, "receipt.json"),
    RUNNER_TEMP: root,
    PATH: process.env.PATH ?? "",
    ...extra,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("pinned linked Quick Log diary production delivery", () => {
  it("accepts only the exact self-transactional committed migration bytes", () => {
    const raw = committedMigration();
    const digest = createHash("sha256").update(raw).digest("hex").toUpperCase();
    expect(digest).toBe("DB09A0C9CDA6C1A1933E9C1DA919B45E1288030DD866C51529A02B9C434C8F7F");
    expect(raw.includes(13)).toBe(false);
    expect(raw.at(-1)).toBe(10);
    expect(lane.validatePinnedMigrationFile({ readFile: () => raw }).sha256).toBe(digest);
    expect(() =>
      lane.validatePinnedMigrationFile({
        readFile: () => Buffer.concat([raw, Buffer.from(" ")]),
      }),
    ).toThrow("hash_mismatch:20260927094000");
    expect(raw.toString()).toMatch(/\nBEGIN;\n[\s\S]*\nCOMMIT;\n$/);
  });

  it("classifies absent, canonical, recorded, partial and collision states fail-closed", () => {
    expect(lane.classifyPreflight(state())).toEqual({ status: "apply" });
    expect(lane.classifyPreflight(canonical)).toEqual({
      status: "schema_live_ledger_absent",
    });
    expect(
      lane.classifyPreflight({
        ...canonical,
        ledger_exact_count: 1,
        ledger_exact_names: ["linked_quicklog_diary_client_write_fence"],
        ledger_statements_contract: true,
      }),
    ).toEqual({ status: "verify_only" });
    expect(lane.classifyPreflight(state({ insert_policy_count: 1 }))).toEqual({
      status: "schema_drift",
      reason: "target_partial_or_fingerprint",
    });
    expect(lane.classifyPreflight(state({ ledger_conflict_count: 1 }))).toEqual({
      status: "ledger_drift",
      reason: "target_collision",
    });
    expect(lane.classifyPreflight(state({ owner_policies_contract: false }))).toEqual({
      status: "prerequisite_drift",
      reason: "owner_policies_contract",
    });
  });

  it("rejects malformed or incomplete catalog output", () => {
    expect(lane.parsePreflightStdout(`${JSON.stringify(state())}\n`)).toEqual(state());
    expect(() => lane.parsePreflightStdout("{}")).toThrow("preflight_result_shape");
    expect(() =>
      lane.parsePreflightStdout(JSON.stringify(state({ guard_trigger_count: -1 }))),
    ).toThrow("preflight_result_shape");
    expect(() => lane.parsePreflightStdout(JSON.stringify(state({ unknown_key: true })))).toThrow(
      "preflight_result_shape",
    );
    expect(() => lane.parsePreflightStdout("not json")).toThrow("preflight_result_shape");
  });

  it("binds the receipt to the exact state, migration and deploy head", () => {
    const headSha = "a".repeat(40);
    const first = lane.buildPreflightReceipt({ state: state(), headSha });
    const again = lane.buildPreflightReceipt({ state: state(), headSha });
    const changed = lane.buildPreflightReceipt({
      state: state({ guard_trigger_count: 1 }),
      headSha,
    });
    expect(first).toEqual(again);
    expect(first.digest).not.toBe(changed.digest);
    expect(first.migration_sha256).toBe(lane.PINNED_MIGRATION.sha256);
    expect(() => lane.buildPreflightReceipt({ state: state(), headSha: "short" })).toThrow();
  });

  it("makes PREFLIGHT read-only and guards the postflight ledger insert", () => {
    const args = lane.buildReadOnlyPsqlArgs();
    expect(args).toContain("--single-transaction");
    expect(args).not.toContain("--file");
    expect(args.at(-1)).toContain("set transaction read only");
    const ledger = lane.buildLedgerInsertSql();
    expect(ledger).toContain("lock table supabase_migrations.schema_migrations");
    expect(ledger).toContain("guard_function_source_contract");
    expect(ledger).toContain("guard_trigger_contract");
    expect(ledger).toContain("linked diary fence ledger collision");
    expect(ledger).toContain("20260927094000");
    expect(ledger).not.toContain("20260924120000");
  });

  it("pins both restrictive policies and the invoker trigger/function in catalog reads", () => {
    expect(CATALOG_STATE_QUERY_SQL).toContain("Linked Quick Log diary requires server insert");
    expect(CATALOG_STATE_QUERY_SQL).toContain(
      "Linked Quick Log diary requires revision for delete",
    );
    expect(CATALOG_STATE_QUERY_SQL).toContain("pol.permissive='RESTRICTIVE'");
    expect(CATALOG_STATE_QUERY_SQL).toContain("pol.roles=array['authenticated']::name[]");
    expect(CATALOG_STATE_QUERY_SQL).toContain("guard_function_source_contract");
    expect(CATALOG_STATE_QUERY_SQL).toContain("tg.tgtype=19");
    expect(CATALOG_STATE_QUERY_SQL).toContain("not p.prosecdef");
    expect(CATALOG_STATE_QUERY_SQL).toContain("owner_policies_contract");
  });

  it("keeps the workflow founder-gated, exact-head, serialized and pinned", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    expect(workflow).toContain("environment: verdant-production-solo-founder");
    expect(workflow).toContain("group: verdant-production-migration-writer");
    expect(workflow).toContain("refs/heads/verdant-grow-diary");
    expect(workflow).toContain("EXPECTED_HEAD_SHA");
    expect(workflow).toContain("SOLO_FOUNDER_ACKNOWLEDGEMENT");
    expect(workflow).toContain("SUPABASE_DB_CA_CERT_B64");
    expect(workflow).toContain(
      "verify-linked-quicklog-diary-client-write-fence-preflight-artifact.mjs",
    );
    expect(workflow).toContain("node scripts/apply-linked-quicklog-diary-client-write-fence.mjs");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(readFileSync(VERIFIER, "utf8")).toContain("linked-quicklog-diary-client-write-fence");
  });

  it("refuses non-disposable database targets in the PG15 proof", () => {
    expect(
      disposableConnection(
        "postgresql://postgres:local-only@127.0.0.1:5432/verdant_linked_diary_delivery",
      ),
    ).toEqual({ host: "127.0.0.1", password: "local-only" });
    expect(
      disposableConnection(
        "postgresql://postgres:local-only@db.knkwiiywfkbqznbxwqfh.supabase.co:5432/verdant_linked_diary_delivery",
      ),
    ).toBeNull();
    expect(
      disposableConnection("postgresql://postgres:local-only@127.0.0.1:5432/postgres"),
    ).toBeNull();
  });

  it("issues a read-only, state-bound PREFLIGHT receipt without writing SQL", () => {
    const env = deliveryEnv();
    const calls: string[][] = [];
    const status = lane.runLinkedQuicklogDiaryClientWriteFence({
      env,
      readFile: committedMigration,
      logger: { log() {}, error() {} },
      spawnImpl: (_command: string, args: string[]) => {
        calls.push(args);
        return { status: 0, stdout: `${JSON.stringify(state())}\n` };
      },
    });
    expect(status).toBe(lane.EXIT.OK);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("--single-transaction");
    expect(calls[0]).not.toContain("--file");
    expect(JSON.parse(readFileSync(env.PREFLIGHT_RECEIPT_PATH, "utf8"))).toMatchObject({
      outcome: "safe_to_apply",
      state_digest: lane.buildPreflightReceipt({ state: state(), headSha: HEAD }).digest,
      migration_sha256: lane.PINNED_MIGRATION.sha256,
    });
  });

  it("applies once, checks canonical state, then inserts the ledger and verifies it", () => {
    const env = deliveryEnv({
      OPERATION: "APPLY",
      PREFLIGHT_RECEIPT_DIGEST: lane.buildPreflightReceipt({
        state: state(),
        headSha: HEAD,
      }).digest,
    });
    const recorded = {
      ...canonical,
      ledger_exact_count: 1,
      ledger_exact_names: ["linked_quicklog_diary_client_write_fence"],
      ledger_statements_contract: true,
    };
    const responses = [state(), canonical, recorded];
    const calls: string[][] = [];
    const status = lane.runLinkedQuicklogDiaryClientWriteFence({
      env,
      readFile: committedMigration,
      logger: { log() {}, error() {} },
      spawnImpl: (_command: string, args: string[]) => {
        calls.push(args);
        return args.includes("--file")
          ? { status: 0, stdout: "" }
          : { status: 0, stdout: `${JSON.stringify(responses.shift())}\n` };
      },
    });
    expect(status).toBe(lane.EXIT.OK);
    expect(calls).toHaveLength(5);
    expect(calls.filter((args) => args.includes("--file"))).toHaveLength(2);
    expect(calls.filter((args) => args.includes("--single-transaction"))).toHaveLength(3);
    expect(calls[1]).not.toContain("--single-transaction");
    expect(calls[3]).not.toContain("--single-transaction");
    expect(JSON.parse(readFileSync(env.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome: "applied_verified",
      recovery_path: "migration_then_ledger",
    });
  });

  it("recovers canonical schema with a missing ledger without replaying the migration", () => {
    const env = deliveryEnv({
      OPERATION: "APPLY",
      PREFLIGHT_RECEIPT_DIGEST: lane.buildPreflightReceipt({
        state: canonical,
        headSha: HEAD,
      }).digest,
    });
    const recorded = {
      ...canonical,
      ledger_exact_count: 1,
      ledger_exact_names: ["linked_quicklog_diary_client_write_fence"],
      ledger_statements_contract: true,
    };
    const responses = [canonical, canonical, recorded];
    const calls: string[][] = [];
    const status = lane.runLinkedQuicklogDiaryClientWriteFence({
      env,
      readFile: committedMigration,
      logger: { log() {}, error() {} },
      spawnImpl: (_command: string, args: string[]) => {
        calls.push(args);
        return args.includes("--file")
          ? { status: 0, stdout: "" }
          : { status: 0, stdout: `${JSON.stringify(responses.shift())}\n` };
      },
    });
    expect(status).toBe(lane.EXIT.OK);
    expect(calls).toHaveLength(4);
    expect(calls.filter((args) => args.includes("--file"))).toHaveLength(1);
    expect(JSON.parse(readFileSync(env.AUDIT_PATH, "utf8"))).toMatchObject({
      outcome: "applied_verified",
      recovery_path: "ledger_only",
    });
  });

  it("rejects an unreviewed receipt before any persistent write", () => {
    const env = deliveryEnv({
      OPERATION: "APPLY",
      PREFLIGHT_RECEIPT_DIGEST: "f".repeat(64),
    });
    const calls: string[][] = [];
    const status = lane.runLinkedQuicklogDiaryClientWriteFence({
      env,
      readFile: committedMigration,
      logger: { log() {}, error() {} },
      spawnImpl: (_command: string, args: string[]) => {
        calls.push(args);
        return { status: 0, stdout: `${JSON.stringify(state())}\n` };
      },
    });
    expect(status).toBe(lane.EXIT.RECEIPT_MISMATCH);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("--file");
  });

  it("never records the ledger when the migration postflight is incomplete", () => {
    const env = deliveryEnv({
      OPERATION: "APPLY",
      PREFLIGHT_RECEIPT_DIGEST: lane.buildPreflightReceipt({
        state: state(),
        headSha: HEAD,
      }).digest,
    });
    const responses = [state(), state({ insert_policy_count: 1 })];
    const calls: string[][] = [];
    const status = lane.runLinkedQuicklogDiaryClientWriteFence({
      env,
      readFile: committedMigration,
      logger: { log() {}, error() {} },
      spawnImpl: (_command: string, args: string[]) => {
        calls.push(args);
        return args.includes("--file")
          ? { status: 0, stdout: "" }
          : { status: 0, stdout: `${JSON.stringify(responses.shift())}\n` };
      },
    });
    expect(status).toBe(lane.EXIT.POSTFLIGHT_CONTRACT_FAILED);
    expect(calls).toHaveLength(3);
    expect(calls.filter((args) => args.includes("--file"))).toHaveLength(1);
  });

  it("rejects an unverified founder context before starting any database process", () => {
    const env = deliveryEnv({ SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED: "false" });
    let calls = 0;
    const status = lane.runLinkedQuicklogDiaryClientWriteFence({
      env,
      readFile: committedMigration,
      logger: { log() {}, error() {} },
      spawnImpl: () => {
        calls += 1;
        return { status: 0, stdout: "" };
      },
    });
    expect(status).toBe(lane.EXIT.INPUT_REJECTED);
    expect(calls).toBe(0);
  });

  it("keeps database output and credentials out of failed PREFLIGHT evidence", () => {
    const env = deliveryEnv();
    const outputSentinel = "user-row-output-do-not-log";
    const status = lane.runLinkedQuicklogDiaryClientWriteFence({
      env,
      readFile: committedMigration,
      logger: { log() {}, error() {} },
      spawnImpl: () => ({
        status: 1,
        stdout: outputSentinel,
        stderr: env.SUPABASE_DB_URL,
      }),
    });
    expect(status).toBe(lane.EXIT.PREFLIGHT_FAILED);
    const evidence = [
      readFileSync(env.REPORT_PATH, "utf8"),
      readFileSync(env.AUDIT_PATH, "utf8"),
    ].join("\n");
    expect(evidence).not.toContain(outputSentinel);
    expect(evidence).not.toContain(env.SUPABASE_DB_URL);
    expect(evidence).not.toContain("local-test-only");
  });
});
