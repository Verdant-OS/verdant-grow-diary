import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const HARNESS_PATH = resolve(
  "scripts/run-quicklog-manual-delegate-forward-repair-pg15-harness.mjs",
);
const WORKFLOW_PATH = resolve(".github/workflows/quicklog-manual-delegate-forward-repair-pg15.yml");
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";
const DISPOSABLE_DATABASE_URL =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delegate_repair";
const DISPOSABLE_SENTINEL = "verdant_quicklog_delegate_repair_pg15_disposable_v1";

async function loadHarness() {
  try {
    return await import(`${pathToFileURL(HARNESS_PATH).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `Quick Log manual delegate PG15 harness could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

describe("Quick Log manual delegate forward-repair PostgreSQL 15 runtime gate", () => {
  it("uses bounded tuple-only quiet psql output and redacted failure codes", async () => {
    const harness = await loadHarness();

    expect(harness.buildPsqlArgs({ quiet: true })).toEqual([
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    expect(harness.formatPsqlFailureCode("postflight", "ERROR: boom\nSQL state: 55000")).toBe(
      "postflight:55000",
    );
    expect(harness.formatPsqlFailureCode("ledger", "ERROR:  55000\n")).toBe("ledger:55000");
    expect(harness.formatPsqlFailureCode("postflight", "token=secret owner@example.test")).toBe(
      "postflight:unknown",
    );
  });

  it("rejects remote and arbitrary loopback targets before spawning psql", async () => {
    const harness = await loadHarness();
    let spawnCount = 0;
    const spawnImpl = () => {
      spawnCount += 1;
      return { status: 1, stdout: "", stderr: "" };
    };

    for (const databaseUrl of [
      "postgresql://postgres:secret@db.knkwiiywfkbqznbxwqfh.supabase.co/postgres",
      "postgresql://service_role:secret@127.0.0.1:5432/verdant_quicklog_delegate_repair",
      "postgresql://postgres:secret@127.0.0.1:6543/verdant_quicklog_delegate_repair",
      "postgresql://postgres:secret@127.0.0.1:5432/postgres",
    ]) {
      await expect(harness.runPg15Harness({ databaseUrl, spawnImpl })).resolves.toBe(1);
    }
    expect(spawnCount).toBe(0);
  });

  it("can address the pinned Docker service through the local WSL Docker bridge", async () => {
    const harness = await loadHarness();
    const calls: Array<{ command: string; args: string[] }> = [];

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        containerId: "a".repeat(64),
        containerRuntime: "wsl-docker",
        spawnImpl: (command: string, args: string[]) => {
          calls.push({ command, args });
          return { status: 0, stdout: "rejected\n", stderr: "" };
        },
      }),
    ).resolves.toBe(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].command.toLowerCase()).toBe("wsl.exe");
    expect(calls[0].args.slice(0, 5)).toEqual(["-d", "Ubuntu", "--", "docker", "exec"]);
  });

  it("attests the SQL-side sentinel before sending destructive scaffold SQL", async () => {
    const harness = await loadHarness();
    const inputs: string[] = [];

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          inputs.push(String(options.input ?? ""));
          return { status: 0, stdout: "rejected\n", stderr: "" };
        },
      }),
    ).resolves.toBe(1);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).not.toContain("drop schema");
  });

  it("wraps the destructive scaffold reset in one transaction after attestation", async () => {
    const harness = await loadHarness();
    const calls: Array<{ input: string }> = [];

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          calls.push({ input: String(options.input ?? "") });
          if (calls.length === 1) {
            return { status: 0, stdout: `${DISPOSABLE_SENTINEL}\n`, stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "ERROR: stop\nSQL state: 55000" };
        },
      }),
    ).resolves.toBe(1);

    expect(calls).toHaveLength(2);
    expect(calls[0].input).not.toContain("drop schema");
    expect(calls[1].input).toMatch(/^begin;\n/);
    expect(calls[1].input).toContain("drop schema if exists public cascade;");
    expect(calls[1].input).toMatch(/\ncommit;\s*$/);
    expect(calls[1].input.toLowerCase()).not.toContain("drop role");
  });

  it("pins the one additive repair migration by exact version and filename", async () => {
    const harness = await loadHarness();
    const migration = harness.validatePinnedMigrationFile({
      root: resolve("supabase", "migrations"),
    });

    expect(migration.version).toBe("20260818010000");
    expect(migration.fileName).toBe("20260818010000_quicklog_manual_delegate_forward_repair.sql");
    expect(migration.sha256).toBe(
      "641c033a6453b180505cfb4eead8c97ec0c89c7ec0a501a64d4d5b1b71897b1c",
    );
    expect(createHash("sha256").update(migration.sql).digest("hex")).toBe(migration.sha256);
    expect(migration.sql).toContain("quicklog_save_manual_pre_logged_at");
  });

  it("names every required runtime and fail-closed proof", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");
    for (const proof of [
      "proveDefectiveDelegateRollback",
      "proveRepairSuccess",
      "provePublicWrapperIdentityPreserved",
      "proveIdempotentRetry",
      "proveConcurrentSameKeyReuse",
      "proveCrossUserFence",
      "proveFunctionAclFences",
      "proveMigrationReapply",
      "proveUnknownDelegateRejected",
      "proveWrongWrapperRejected",
      "proveMissingContractRejected",
      "proveStrictFunctionsRejected",
      "proveHelperSourceRejected",
      "proveTriggerShapeRejected",
      "proveFunctionAclAdversariesRejected",
      "proveFunctionOverloadsRejected",
      "proveRequestHashShapesRejected",
      "proveLoggedAtShapesRejected",
      "proveHistoricalOutOfOrderUnsafe",
    ]) {
      expect(source).toContain(proof);
    }
    expect(source).toContain("dual_timestamp_persist_failed");
    expect(source).toContain("linked_grow_event_id");
    expect(source).toContain("quicklog_save_manual_pre_logged_at");
    expect(source).toContain("requireDeliveryPreflightBlocked");
    expect(source).toContain("wrapper_service_execute_revoked");
    expect(source).toContain("delegate_extra_role_execute");
    expect(source).toContain("wrapper_extra_overload");
    expect(source).toContain("helper_extra_overload");
    expect(source).toContain("trigger_when_false");
    expect(source).toContain("trigger_args");
    expect(source).toContain("request_hash_generated");
    expect(source).toContain("request_hash_identity");
    expect(source).toContain('for (const relation of ["diary_entries", "grow_events"])');
    expect(source).toContain("`${prefix}_logged_at_generated`");
    expect(source).toContain("`${prefix}_logged_at_identity`");
    expect(source).not.toContain("knkwiiywfkbqznbxwqfh");
  });

  it("ACL fence covers all five private helpers, both wrapper callers, and runtime probes", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");
    // The postgres-only matrix must enumerate every private helper by exact
    // signature — a dropped line here reopens a helper without any signal.
    expect(source).toContain("private_helper_acl_matrix");
    expect(source).toContain(
      "'public.quicklog_save_manual_pre_logged_at(${MANUAL_SIGNATURE})'::regprocedure",
    );
    expect(source).toContain("'public.quicklog_try_parse_logged_at(text)'::regprocedure");
    expect(source).toContain("'public.quicklog_try_parse_uuid(text)'::regprocedure");
    expect(source).toContain("'public.quicklog_stamp_diary_logged_at()'::regprocedure");
    expect(source).toContain("'public.quicklog_stamp_grow_event_logged_at()'::regprocedure");
    expect(source).toContain("has_function_privilege('postgres', sig, 'execute')");
    // Wrapper must stay executable for BOTH intended callers…
    expect(source).toContain(
      "has_function_privilege('service_role','public.quicklog_save_manual(${MANUAL_SIGNATURE})','execute')",
    );
    // …and the runtime probes must stay: authenticated dies on a helper,
    // service_role executes the wrapper.
    expect(source).toContain("authenticated_helper_probe");
    expect(source).toContain("service_role_wrapper_call");
  });

  it("runs parallel, helper ABI, and raw UUID fingerprint adversaries through delivery preflight", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");
    for (const proof of [
      "proveFunctionParallelAdversariesRejected",
      "proveFreshReplayUuidHelperLineage",
      "proveHelperArgumentShapeAdversariesRejected",
      "proveHelperCarriageReturnFingerprintRules",
      "proveRequiredRoleAttributesRejected",
      "proveMigrationLedgerColumnShapesRejected",
      "proveGuardedLedgerInsertAndCollision",
    ]) {
      expect(source.match(new RegExp(proof, "g")) ?? []).toHaveLength(2);
    }
    expect(source).toContain("tryParseUuidSource");
    expect(source).toContain("tryParseUuidDefinition");
    expect(source).toContain("4b132ee2034f8e2887da1af582295ad8");
    for (const mutation of [
      "wrapper_parallel_safe",
      "delegate_parallel_safe",
      "helper_parallel_safe",
      "helper_pronargs_drift",
      "helper_pronargdefaults_drift",
      "helper_proargmodes_drift",
      "helper_proallargtypes_drift",
      "helper_proargnames_drift",
      "helper_pronargs_restore",
      "helper_pronargdefaults_restore",
      "helper_proargmodes_restore",
      "helper_proallargtypes_restore",
      "helper_proargnames_restore",
      "helper_uuid_cr_drift",
      "helper_logged_at_cr_normalized",
      "helper_diary_stamp_cr_normalized",
      "helper_event_stamp_cr_normalized",
      "service_role_bypassrls_revoked",
      "anon_bypassrls_granted",
      "authenticated_bypassrls_granted",
      "ledger_name_default",
      "ledger_name_generated",
      "ledger_version_identity",
      "ledger_insert_success",
      "ledger_insert_collision",
      "ledger_collision_unchanged",
    ]) {
      expect(source).toContain(mutation);
    }
    expect(source).toContain("requireDeliveryPreflightBlocked");
    expect(source).toContain('requireDeliveryPreflightStatus(label, "apply"');
    expect(source).toContain(
      "create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit noreplication bypassrls",
    );
    expect(source).toContain("buildLedgerInsertSql");
    expect(source).toContain("ledger_insert_mutated");
    expect(source).toContain("\\set VERBOSITY sqlstate");
    expect(source).toContain(
      'requireDeliveryPreflightStatus("ledger_insert_success", "verify_only"',
    );
    expect(source).toContain("'source', p.prosrc");
    expect(source).toContain("'pronargs', p.pronargs");
    expect(source).toContain("'acl', p.proacl");
    expect(source).not.toContain("'definition', pg_get_functiondef(p.oid)");
  });

  it("is path-scoped to a pinned PostgreSQL 15.18 loopback service", () => {
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const workflow = loadYaml(source) as Record<string, any>;
    const trigger = workflow.on ?? workflow.true;
    const job = workflow.jobs.pg15_runtime;

    expect(trigger.pull_request.paths).toContain(
      "scripts/run-quicklog-manual-delegate-forward-repair-pg15-harness.mjs",
    );
    expect(trigger.pull_request.paths).toContain(
      "supabase/migrations/20260818010000_quicklog_manual_delegate_forward_repair.sql",
    );
    expect(trigger.pull_request.paths).toContain(
      "src/test/quicklog-manual-delegate-forward-repair-pg15-harness.test.ts",
    );
    expect(trigger.pull_request.paths).toContain(
      "scripts/apply-quicklog-manual-delegate-forward-repair.mjs",
    );
    expect(trigger.pull_request.paths).toContain("scripts/lib/productionSupabaseTls.mjs");
    expect(trigger.pull_request.paths).toContain("src/test/production-supabase-tls.test.ts");
    expect(trigger.push.branches).toEqual(["verdant-grow-diary"]);
    expect(trigger).toHaveProperty("merge_group");
    expect(trigger.merge_group ?? {}).toEqual({});
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.env.QUICKLOG_MANUAL_DELEGATE_REPAIR_PG15_URL).toBe(DISPOSABLE_DATABASE_URL);
    expect(job.env.QUICKLOG_MANUAL_DELEGATE_REPAIR_PG15_CONTAINER).toBeUndefined();
    const harnessStep = job.steps.find(
      (step: Record<string, unknown>) => step.name === "Run isolated PostgreSQL 15 harness",
    );
    expect(harnessStep?.env?.QUICKLOG_MANUAL_DELEGATE_REPAIR_PG15_CONTAINER).toBe(
      "${{ job.services.postgres.id }}",
    );
    expect(source).not.toContain("continue-on-error");
    expect(source).not.toContain("supabase.co");
    expect(source).not.toContain("apt-get");
    expect(source).not.toContain("postgresql-client");
  });

  it("initializes the exact disposable sentinel in one transaction", () => {
    const workflow = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const markerStep = workflow.jobs.pg15_runtime.steps.find(
      (step: Record<string, unknown>) =>
        step.name === "Create disposable PostgreSQL harness sentinel",
    );

    expect(markerStep).toBeDefined();
    expect(markerStep.run).toContain(
      "create schema verdant_quicklog_delegate_repair_harness authorization postgres",
    );
    expect(markerStep.run).toContain(
      "create table verdant_quicklog_delegate_repair_harness.runtime_sentinel",
    );
    expect(markerStep.run).toContain(DISPOSABLE_SENTINEL);
    expect(markerStep.run).toContain("--single-transaction");
  });
});
