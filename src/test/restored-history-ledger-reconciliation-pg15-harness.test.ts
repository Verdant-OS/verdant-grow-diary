import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

import { RECONCILIATION_TARGETS } from "../../scripts/reconcile-restored-history-ledger.mjs";

const HARNESS_PATH = resolve("scripts/run-restored-history-ledger-reconciliation-pg15-harness.mjs");
const SQL_PROOF_PATH = resolve("supabase/tests/restored_history_ledger_reconciliation.sql");
const WORKFLOW_PATH = resolve(".github/workflows/restored-history-ledger-reconciliation-pg15.yml");
const CONTRACT_TEST_PATH = resolve(
  "src/test/restored-history-ledger-reconciliation-pg15-harness.test.ts",
);
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";
const DISPOSABLE_DATABASE_URL =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/postgres";
const DISPOSABLE_SENTINEL = "verdant_restored_history_ledger_reconciliation_pg15_disposable_v2";

async function loadHarness() {
  return import(`${pathToFileURL(HARNESS_PATH).href}?test=${Date.now()}-${Math.random()}`);
}

describe("restored-history ledger exact-production PostgreSQL 15 runtime harness", () => {
  it("ships the complete isolated runtime proof surface", () => {
    for (const path of [HARNESS_PATH, SQL_PROOF_PATH, WORKFLOW_PATH, CONTRACT_TEST_PATH]) {
      expect(existsSync(path), path).toBe(true);
    }
  });

  it("builds the catalog fixture from pinned immutable function definitions", async () => {
    const { buildCatalogFixtureSql } = await loadHarness();
    const fixture = buildCatalogFixtureSql();

    expect(fixture).toContain(
      "CREATE OR REPLACE FUNCTION public.grant_staff_role_for_verified_allowlist()",
    );
    expect(fixture).toContain("CREATE FUNCTION public.quicklog_save_event(");
    expect(fixture).not.toContain("__EXACT_STAFF_ALLOWLIST_FUNCTION__");
    expect(fixture).not.toContain("__EXACT_QUICKLOG_SAVE_EVENT_FUNCTION__");
    expect(fixture).toContain("grant_staff_role_for_verified_email()");
    expect(fixture).toContain("on_auth_user_created_grant_staff");
    expect(fixture).toContain("on_auth_user_confirmed_grant_staff");
    expect(fixture).toContain("pheno_hunts_notes_length");
    expect(fixture).toContain("quicklog_idempotency");
    expect(fixture).toContain("request_hash text");
    expect(fixture).toContain("plants_plant_type_check");
    expect(fixture).toContain("20260709015800");
    expect(fixture).toContain("catalog_fixture_ready");
  });

  it("executes exact production preflight, classifier, builder, and postflight exports", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");
    const fixture = readFileSync(SQL_PROOF_PATH, "utf8");

    for (const productionExport of [
      "PREFLIGHT_SQL",
      "CATALOG_STATE_QUERY_SQL",
      "parsePreflightStdout",
      "classifyPreflight",
      "buildApplySql",
      "buildPostflightSql",
      "loadReconciliationManifest",
    ]) {
      expect(source).toContain(productionExport);
    }
    expect(source).toContain("buildApplySql({ manifest, state: initial })");
    expect(source).toContain("executeSql(PREFLIGHT_SQL");
    expect(source).toContain("executeSql(buildPostflightSql()");
    expect(source).toContain("PREFLIGHT_SQL.includes(CATALOG_STATE_QUERY_SQL)");
    expect(fixture).not.toContain("reconciliation_state");
    expect(fixture).not.toContain("application_row_access=forbidden");
    expect(fixture).not.toMatch(/create function[\s\S]+\.reconcile\(/i);
    expect(RECONCILIATION_TARGETS).toHaveLength(3);
  });

  it("rejects every database target except sentinel-attested loopback PostgreSQL postgres", async () => {
    const { buildPsqlArgs, validateDisposableDatabaseUrl } = await loadHarness();

    expect(buildPsqlArgs()).toContain(`harness_confirmation=${DISPOSABLE_SENTINEL}`);
    expect(buildPsqlArgs()).toContain("VERBOSITY=verbose");
    expect(validateDisposableDatabaseUrl(DISPOSABLE_DATABASE_URL)).toEqual({
      hostname: "127.0.0.1",
      password: "verdant-runtime-only",
    });
    for (const rejected of [
      "postgresql://postgres:verdant-runtime-only@db.example.com:5432/postgres",
      "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/other",
      "postgresql://app:verdant-runtime-only@127.0.0.1:5432/postgres",
      "postgresql://postgres@127.0.0.1:5432/postgres",
      `${DISPOSABLE_DATABASE_URL}?sslmode=require`,
      "not-a-url",
    ]) {
      expect(validateDisposableDatabaseUrl(rejected), rejected).toBeNull();
    }
  });

  it("pins rollback and both racing sessions to byte-for-byte builder output", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");

    expect(
      source.match(/const exactApplySql = buildApplySql\(\{ manifest, state: initial \}\)/g),
    ).toHaveLength(2);
    expect(source.match(/input: exactApplySql/g)).toHaveLength(2);
    expect(source).toContain(
      'requireSqlFailure("exact_locked_collision_rollback", exactApplySql, "55000"',
    );
    expect(source).toContain('insertTargetCollisionSql(RECONCILIATION_TARGETS[1], "key_only")');
    expect(source).toContain("openPsqlSession");
    expect(source).toContain("process.child?.stdin.write(initialInput)");
    expect(source).toContain("process.child.stdin.end(input)");
    expect(source).toContain("state.granted === 1 && state.waiting === 2");
    expect(source).toContain("objsubid=2");
    expect(source).toContain('blocker.end("commit;\\n")');
    expect(source).toContain('blocker.end("rollback;\\n")');
    expect(source).toContain("successes.length !== 1 || failures.length !== 1");
    expect(source).toContain("pg_catalog.pg_locks");
    expect(source).toContain("concurrent_stale_apply:55000");
    expect(source).toContain("state changed under lock");
    expect(source).not.toContain("pg_sleep");
    expect(source).not.toMatch(/exactApplySql\s*\.\s*replace/);
    expect(source).not.toMatch(/input:\s*[^,\n]*(?:replace|inject)/i);
    expect(source).not.toMatch(/\bSUPABASE_DB_URL\b|supabase\.co|knkwiiywfkbqznbxwqfh/);
  });

  it("covers every required adversarial catalog refusal with the exact preflight", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");

    for (const caseName of [
      'name: "rewrite"',
      'name: "partition"',
      'name: "inheritance_child"',
      'name: "inheritance_parent"',
      'name: "index_extra"',
      'name: "index_standalone_unique"',
      'name: "index_partial_unique"',
      'name: "index_expression_unique"',
      'name: "index_included_column"',
      'name: "constraint_deferrable_unique"',
      'name: "constraint_nulls_not_distinct"',
      'name: "column_extra"',
      'name: "column_default"',
      'name: "column_nondeterministic_collation"',
      'name: "relation_unlogged"',
      'name: "relation_rls"',
      'name: "relation_acl"',
      'name: "column_acl"',
      'name: "effective_role_membership_acl"',
      'name: "publication_direct_insert"',
      'name: "publication_schema_insert"',
      'name: "publication_all_tables_insert"',
      'name: "publication_update_delete_only"',
      'name: "incoming_foreign_key_noninsert_triggers"',
      'name: "relation_trigger"',
      'name: "shifted_witness_duplicate"',
      'name: "quicklog_request_hash_missing"',
      'name: "quicklog_request_hash_default"',
      'name: "quicklog_request_hash_type"',
      'name: "quicklog_request_hash_not_null"',
      'name: "plant_type_nullable"',
      'name: "plant_type_missing"',
      'name: "plant_type_default_drift"',
      'name: "plant_type_constraint_missing"',
      'name: "plant_type_constraint_not_valid"',
      'name: "plant_type_constraint_widened"',
      'name: "plant_type_comment_drift"',
      'name: "plant_type_comment_missing"',
      'name: "legacy_helper_acl"',
      'name: "extra_legacy_trigger"',
      'name: "canonical_helper_external_trigger"',
    ]) {
      expect(source).toContain(caseName);
    }
    for (const collisionName of [
      'name: "key_only_collision"',
      'name: "version_only_collision"',
      'name: "name_only_collision"',
      'name: "version_name_wrong_key_collision"',
      'name: "exact_identity_wrong_metadata"',
    ]) {
      expect(source).toContain(collisionName);
    }
    expect(source).toContain('reason: "ledger_contract"');
    expect(source).toContain('reason: "staff_shifted_witness_contract"');
    expect(source).toContain('reason: "quicklog_request_hash_column_contract"');
    expect(source).toContain('reason: "plant_type_column_contract"');
    expect(source).toContain('reason: "plant_type_constraint_contract"');
    expect(source).toContain('reason: "plant_type_comment_contract"');
    expect(source).toContain('reason: "staff_legacy_acl_contract"');
    expect(source).toContain('reason: "staff_no_legacy_trigger_contract"');
    expect(source).toContain('reason: "staff_trigger_contract"');
    expect(source).toContain("readProductionState(env, spawnImpl)");
  });

  it("defines a genuine required-path PostgreSQL 15 CI lane without soft failure", () => {
    const workflow = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as any;
    const expectedPaths = [
      "scripts/run-restored-history-ledger-reconciliation-pg15-harness.mjs",
      "scripts/reconcile-restored-history-ledger.mjs",
      "config/restored-history-ledger-reconciliation.json",
      "supabase/tests/restored_history_ledger_reconciliation.sql",
      ".github/workflows/restored-history-ledger-reconciliation-pg15.yml",
      ".github/workflows/reconcile-restored-history-ledger.yml",
      "src/test/restored-history-ledger-reconciliation-pg15-harness.test.ts",
      "src/test/reconcile-restored-history-ledger.test.ts",
    ];

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.on.pull_request.paths).toEqual(expect.arrayContaining(expectedPaths));
    expect(workflow.on.push.branches).toEqual(["verdant-grow-diary"]);
    expect(workflow.on.push.paths).toEqual(expect.arrayContaining(expectedPaths));
    expect(workflow.on).toHaveProperty("merge_group");

    const job = workflow.jobs.pg15_runtime;
    expect(job.name).toBe("PostgreSQL 15 ledger reconciliation runtime contract");
    expect(job["runs-on"]).toBe("ubuntu-latest");
    expect(job["timeout-minutes"]).toBe(10);
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.services.postgres.env.POSTGRES_DB).toBe("postgres");
    expect(job.services.postgres.options).toContain("pg_isready -U postgres -d postgres");
    expect(job.env.RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_URL).toBe(DISPOSABLE_DATABASE_URL);

    const commands = job.steps.map((step: any) => step.run ?? "").join("\n");
    expect(commands).toContain(DISPOSABLE_SENTINEL);
    expect(commands).toContain(
      "node scripts/run-restored-history-ledger-reconciliation-pg15-harness.mjs",
    );
    expect(commands).not.toMatch(/apt-get|postgresql-client|continue-on-error/);
    expect(
      job.steps.some(
        (step: any) =>
          step.env?.RESTORED_HISTORY_LEDGER_RECONCILIATION_PG15_CONTAINER ===
          "${{ job.services.postgres.id }}",
      ),
    ).toBe(true);

    const workflowJson = JSON.stringify(workflow);
    expect(workflowJson).not.toContain("continue-on-error");
    for (const step of job.steps.filter((candidate: any) => candidate.uses)) {
      expect(step.uses).toMatch(/^[^@]+@[0-9a-f]{40}$/);
    }
  });
});
