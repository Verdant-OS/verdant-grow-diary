import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  buildPsqlArgs,
  formatPsqlFailureCode,
} from "../../scripts/run-signup-acquisition-forward-repair-pg15-harness.mjs";
import { buildReadOnlyPsqlArgs } from "../../scripts/apply-signup-acquisition-forward-repair.mjs";

const HARNESS_PATH = resolve("scripts/run-signup-acquisition-forward-repair-pg15-harness.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/signup-acquisition-forward-repair-pg15.yml");
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";

describe("signup-acquisition forward-repair PostgreSQL 15 runtime gate", () => {
  it("suppresses command tags while retaining unaligned tuple output", () => {
    expect(buildPsqlArgs({ quiet: false })).toEqual(
      buildReadOnlyPsqlArgs({ includeCommand: false }),
    );
    expect(buildPsqlArgs({ quiet: true })).toEqual([
      "-X",
      "-q",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
    ]);
  });

  it("reduces psql diagnostics to a named stage and SQLSTATE", () => {
    expect(formatPsqlFailureCode("baseline_scaffold", "ERROR:  42883\nsecret-value")).toBe(
      "baseline_scaffold_42883",
    );
    expect(formatPsqlFailureCode("baseline_scaffold", "secret-value without a sqlstate")).toBe(
      "baseline_scaffold_unknown",
    );
  });

  it("reports only a bounded internal failure code when the harness fails", () => {
    const rejectedConnection = "postgresql://secret-user:secret-password@production.invalid/db";
    const result = spawnSync(process.execPath, [HARNESS_PATH], {
      encoding: "utf8",
      env: { ...process.env, SIGNUP_REPAIR_PG15_URL: rejectedConnection },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("failure_code=connection_rejected");
    expect(result.stderr).not.toContain(rejectedConnection);
    expect(result.stderr).not.toContain("secret-user");
    expect(result.stderr).not.toContain("secret-password");
  });

  it("uses a real loopback-only psql harness against PostgreSQL major 15", () => {
    expect(existsSync(HARNESS_PATH), "PG15 harness must exist").toBe(true);
    const source = readFileSync(HARNESS_PATH, "utf8");

    expect(source).toContain("PREFLIGHT_SQL");
    expect(source).toContain("buildApplySql");
    expect(source).toContain("parsePreflightStdout");
    expect(source).toContain("classifyPreflight");
    expect(source).toMatch(/server_version_num/);
    expect(source).toMatch(/150000/);
    expect(source).toMatch(/160000/);
    expect(source).toMatch(/127\.0\.0\.1|localhost|::1/);
    expect(source).toMatch(/psql/);
    expect(source).toMatch(/--single-transaction/);
    expect(source).not.toMatch(/supabase\.co|knkwiiywfkbqznbxwqfh/);
  });

  it("proves the named success, authorization, rollback, concurrency, and unsafe-catalog scenarios", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");

    for (const marker of [
      "attributed_auth_user_insert",
      "unknown_source_is_not_attributed",
      "idempotent_rerun",
      "check_false",
      "unique_source_constraint",
      "standalone_unique_source_index",
      "extra_plain_index",
      "extra_target_column",
      "altered_target_column",
      "extra_foreign_key",
      "extra_exclusion_constraint",
      "altered_source_check_with_ledger",
      "unvalidated_source_check_with_ledger",
      "target_user_trigger",
      "target_rewrite_rule",
      "force_row_level_security",
      "partitioned_target",
      "unlogged_target",
      "target_owner_drift",
      "target_acl_drift",
      "missing_profiles_user_id_uniqueness",
      "altered_profiles_prerequisite",
      "profile_omitted_required_column",
      "profile_marketing_opt_in_at_not_null",
      "profile_marketing_opt_in_default_drift",
      "profile_check_not_valid",
      "profile_unique_constraint",
      "profile_exclusion_constraint",
      "profile_standalone_unique_index",
      "profile_insert_trigger",
      "profile_insert_rule",
      "missing_user_roles",
      "dependency_body_drift",
      "dependency_search_path_drift",
      "dependency_owner_drift",
      "dependency_acl_drift",
      "target_function_owner_drift",
      "target_function_extra_role_acl",
      "disabled_auth_trigger",
      "wrong_auth_trigger",
      "migration_ledger_column_drift",
      "migration_ledger_owner_drift",
      "migration_schema_owner_drift",
      "migration_ledger_acl_drift",
      "migration_schema_acl_drift",
      "migration_ledger_insert_trigger",
      "preexisting_user_backfill",
      "first_touch_valid",
      "first_touch_invalid",
      "first_touch_expired",
      "operator_snapshot_paid_fixture",
      "non_operator_snapshot_denial",
      "direct_anon_table_denial",
      "direct_authenticated_table_denial",
      "compatible_partial_applied_verified",
      "late_transaction_rollback",
      "concurrent_signup_gap_closed",
      "preapply_handle_fingerprint_preserved",
      "locked_profile_index_guard_rollback",
      "hosted_default_acl_normalized",
      "unexpected_default_acl_rollback",
      "unexpected_creation_default_acl",
      "ledger_wrapper_markers_recorded",
      "hostile_public_md5_shadow_ignored",
    ]) {
      expect(source).toContain(marker);
    }

    expect(source).toContain("signup_acquisition_attributions");
    expect(source).toContain("auth.users");
    expect(source).toContain("verdant_signup_source");
    expect(source).toContain("ledger_exact_count");
    expect(source).toContain("verify_only");
    expect(source).toContain("target_table_incompatible");
    expect(source).toContain("lock table auth.users in share row exclusive mode");
    expect(source).toContain("set local role anon");
    expect(source).toContain("set local role authenticated");
    expect(source).toContain("record_signup_acquisition_first_touch");
    expect(source).toContain("signup_acquisition_operator_snapshot");
    expect(source).toContain("signup_to_paid_operator_snapshot");
    expect(source).toContain("pg_sleep");
    expect(source).toContain("pg_blocking_pids");
    expect(source).toContain("proveBaselineAndApply(env);");
    expect(source).toContain("proveFirstTouchRpc(env)");
    expect(source).toContain("proveSnapshotsAndAccess(env)");
    expect(source).toContain("proveLateTransactionRollback(env)");
    expect(source).toContain("await proveConcurrentSignupGapClosed(env)");
    expect(source).toContain("proveLockedProfileIndexGuardRollback(env)");
    expect(source).toContain("handleNewUserDefinition");
    expect(source).toContain("alter default privileges for role postgres in schema public");
    expect(source).toContain("proveUnexpectedDefaultAclRollback(env)");
    expect(source).toContain("proveUnsafeScenarios(env);");
    expect(source).toContain("proveCatalogShadowIsolation(env);");
    expect(source).toContain(
      "grant execute on function public.record_signup_acquisition_first_touch(text) to signup_repair_drift_owner",
    );
    expect(source).toContain(
      "grant select on public.signup_acquisition_attributions to signup_repair_drift_owner",
    );
    expect(source).toContain("create unique index profiles_pkey on public.profiles(user_id)");
    expect(source).toContain(
      "alter function public.record_signup_acquisition_first_touch(text) owner to signup_repair_drift_owner",
    );
  });

  it("is wired to a path-scoped CI workflow with a real PostgreSQL 15 service", () => {
    expect(existsSync(WORKFLOW_PATH), "PG15 workflow must exist").toBe(true);
    const workflow = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const paths = workflow.on.pull_request.paths;

    expect(workflow.on).toHaveProperty("push");
    expect(workflow.on).toHaveProperty("merge_group");
    expect(workflow.on.push.branches).toContain("verdant-grow-diary");
    expect(workflow.on.push.paths).toEqual(paths);
    expect(workflow.on.merge_group ?? {}).toEqual({});

    expect(paths).toEqual(
      expect.arrayContaining([
        "scripts/apply-signup-acquisition-forward-repair.mjs",
        "scripts/apply-pinned-production-migrations.mjs",
        "scripts/lib/candidateNumberToolRuntime.mjs",
        "scripts/lib/supabaseDatabaseTargetIdentity.mjs",
        ".github/workflows/apply-signup-acquisition-forward-repair.yml",
        "scripts/run-signup-acquisition-forward-repair-pg15-harness.mjs",
        ".github/workflows/signup-acquisition-forward-repair-pg15.yml",
        "supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql",
        "supabase/migrations/20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5.sql",
        "supabase/migrations/20260721194239_18592b2d-3ca9-4608-bbf5-c2262e422c70.sql",
        "supabase/migrations/20260517010926_65004f70-4e2c-48b3-bfcb-37bb8d2f0040.sql",
        "supabase/migrations/20260518154114_0694692d-c860-4083-93ec-c5161950bd9d.sql",
        "src/test/apply-signup-acquisition-forward-repair.test.ts",
        "src/test/signup-acquisition-forward-repair-pg15-harness.test.ts",
      ]),
    );
    const job = workflow.jobs.pg15_runtime;
    expect(job["timeout-minutes"]).toBeGreaterThan(0);
    expect(job.if).toBeUndefined();
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.services.postgres.options).toContain("pg_isready");
    expect(job.env.SIGNUP_REPAIR_PG15_URL).toMatch(/127\.0\.0\.1|localhost/);
    const commands = job.steps.map((step: any) => step.run ?? "").join("\n");
    expect(commands).toContain("postgresql-client");
    expect(commands).toMatch(/psql\s+--version/);
    expect(
      job.steps.some(
        (step: any) =>
          step.run === "node scripts/run-signup-acquisition-forward-repair-pg15-harness.mjs",
      ),
    ).toBe(true);
  });
});
