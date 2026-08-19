import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const HARNESS_PATH = resolve("scripts/run-action-queue-transition-forward-repair-pg15-harness.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/action-queue-transition-forward-repair-pg15.yml");
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql",
);
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";
const DISPOSABLE_DATABASE_URL =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_action_queue_transition_repair";
const DISPOSABLE_SENTINEL = "verdant_action_queue_transition_repair_pg15_disposable_v1";

async function loadHarness() {
  try {
    return await import(`${pathToFileURL(HARNESS_PATH).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `Action Queue transition PG15 harness could not be imported: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

describe("Action Queue transition forward-repair PostgreSQL 15 runtime gate", () => {
  it("uses bounded quiet psql output and stage-only diagnostics", async () => {
    const harness = await loadHarness();

    expect(harness.buildPsqlArgs()).toEqual(["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]);
    expect(harness.formatPsqlFailureCode("postflight", "ERROR: drift\nSQLSTATE: 55000")).toBe(
      "postflight:55000",
    );
    expect(harness.formatPsqlFailureCode("postflight", "secret=value owner@example.test")).toBe(
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
      "postgresql://postgres:secret@db.example.supabase.co/postgres",
      "postgresql://service_role:secret@127.0.0.1:5432/verdant_action_queue_transition_repair",
      "postgresql://postgres:secret@127.0.0.1:6543/verdant_action_queue_transition_repair",
      "postgresql://postgres:secret@127.0.0.1:5432/postgres",
    ]) {
      await expect(harness.runPg15Harness({ databaseUrl, spawnImpl })).resolves.toBe(1);
    }
    expect(spawnCount).toBe(0);
  });

  it("attests the disposable sentinel before sending scaffold SQL", async () => {
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

  it("pins the single forward migration by exact filename and digest", async () => {
    const harness = await loadHarness();
    const migration = harness.validatePinnedMigrationFile();
    const source = readFileSync(MIGRATION_PATH, "utf8");

    expect(migration.fileName).toBe("20260819190852_action_queue_transition_forward_repair.sql");
    expect(migration.sha256).toBe(createHash("sha256").update(source).digest("hex"));
    expect(migration.sql).toBe(source);
  });

  it("names every required success and fail-closed runtime proof", () => {
    expect(existsSync(HARNESS_PATH), "PG15 harness must exist").toBe(true);
    const source = readFileSync(HARNESS_PATH, "utf8");

    for (const proof of [
      "proveLegacyBaseline",
      "proveRepairSuccess",
      "proveOwnerTransitionAndRetry",
      "proveIllegalTransitionNoWrite",
      "proveDirectMutationFences",
      "proveAppendOnlyEventFence",
      "proveCrossUserAndAnonymousFences",
      "proveReconciledPlantFallback",
      "proveCanonicalReapply",
      "proveHistoricalContractRepair",
      "proveUnknownPolicyRejected",
      "provePartialContractRejected",
      "proveFunctionSourceRejected",
      "proveFunctionOverloadRejected",
      "proveGuardSourceRejected",
      "proveGuardTriggerRejected",
      "proveRlsDisabledRejected",
      "proveHardenedGrantBaselineConverges",
      "proveRequiredGrantDriftRejected",
      "proveInheritedMutationGrantRejected",
    ]) {
      expect(source).toContain(proof);
    }
    expect(source).toContain("02cf2857792d152113b7ab13fae6ca3f");
    expect(source).toContain("4d4741c455cf307f3e4909041c9d85d7");
    expect(source).toContain("e08f43c1f4e1308a8d50e6cab797f933");
    expect(source).toContain("420914cd6ffbd2d552c30e8d7b6ddf73");
    expect(source).toContain("set local role authenticated");
    expect(source).toContain("set local role anon");
    expect(source).toContain('"delivery_legacy_preflight", "apply"');
    expect(source).toContain('"delivery_canonical_ledger_absent"');
    expect(source).toContain('"schema_live_ledger_absent"');
    expect(source).toContain('"delivery_verify_only", "verify_only"');
    expect(source).toContain("buildLedgerInsertSql()");
    expect(source).not.toMatch(/supabase\.co|knkwiiywfkbqznbxwqfh/);
  });

  it("is wired to a no-apt path-scoped workflow using pinned PostgreSQL 15", () => {
    expect(existsSync(WORKFLOW_PATH), "PG15 workflow must exist").toBe(true);
    const workflow = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const paths = workflow.on.pull_request.paths;

    expect(workflow.on.push.branches).toContain("verdant-grow-diary");
    expect(workflow.on.push.paths).toEqual(paths);
    expect(workflow.on.merge_group ?? {}).toEqual({});
    expect(paths).toEqual(
      expect.arrayContaining([
        "scripts/run-action-queue-transition-forward-repair-pg15-harness.mjs",
        "scripts/lib/solo-founder-production-authorization.mjs",
        "scripts/verify-solo-founder-production-authorization.mjs",
        "scripts/apply-action-queue-transition-forward-repair.mjs",
        "scripts/verify-action-queue-transition-forward-repair-preflight-artifact.mjs",
        ".github/workflows/action-queue-transition-forward-repair-pg15.yml",
        ".github/workflows/apply-action-queue-transition-forward-repair.yml",
        "supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql",
        "supabase/migrations/20260725093000_restore_action_queue_owner_decisions.sql",
        "supabase/migrations/20260726093000_action_queue_transition_rpc.sql",
        "supabase/migrations/20260726094000_action_queue_transition_contract.sql",
        "supabase/migrations/20260728163100_production_breeding_workflow_reconciliation.sql",
        "src/test/action-queue-transition-forward-repair.test.ts",
        "src/test/action-queue-transition-forward-repair-pg15-harness.test.ts",
        "src/test/solo-founder-production-authorization.test.ts",
        "src/test/apply-action-queue-transition-forward-repair.test.ts",
        "src/test/verify-action-queue-transition-forward-repair-preflight-artifact.test.ts",
      ]),
    );

    const job = workflow.jobs.pg15_runtime;
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.services.postgres.options).toContain("pg_isready");
    const commands = job.steps.map((step: any) => step.run ?? "").join("\n");
    expect(commands).toContain("runtime_sentinel");
    expect(commands).toContain(
      "node scripts/run-action-queue-transition-forward-repair-pg15-harness.mjs",
    );
    expect(commands).not.toMatch(/apt-get|postgresql-client/);
    expect(
      job.steps.some(
        (step: any) =>
          step.env?.ACTION_QUEUE_TRANSITION_REPAIR_PG15_CONTAINER ===
          "${{ job.services.postgres.id }}",
      ),
    ).toBe(true);
    expect(job.env.ACTION_QUEUE_TRANSITION_REPAIR_PG15_URL).toBe(DISPOSABLE_DATABASE_URL);
    expect(commands).toContain(DISPOSABLE_SENTINEL);
  });
});
