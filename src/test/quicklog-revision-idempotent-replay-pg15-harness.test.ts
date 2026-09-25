import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const HARNESS_PATH = resolve("scripts/run-quicklog-revision-idempotent-replay-pg15-harness.mjs");
const RUNNER_PATH = resolve("scripts/apply-quicklog-revision-idempotent-replay.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/quicklog-revision-idempotent-replay-pg15.yml");
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";
const DISPOSABLE_DATABASE_URL =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_revision_replay";
const DISPOSABLE_SENTINEL = "verdant_quicklog_revision_replay_pg15_disposable_v1";

async function load(path: string) {
  try {
    return await import(`${pathToFileURL(path).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `${path} could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

describe("Quick Log revision idempotent replay PostgreSQL 15 runtime gate", () => {
  it("uses bounded tuple-only quiet psql output and redacted failure codes", async () => {
    const harness = await load(HARNESS_PATH);

    expect(harness.buildPsqlArgs({ quiet: true })).toEqual([
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    expect(harness.formatPsqlFailureCode("apply", "ERROR: boom\nSQL state: 42P07")).toBe(
      "apply:42P07",
    );
    expect(harness.formatPsqlFailureCode("ledger", "ERROR:  55000\n")).toBe("ledger:55000");
    expect(harness.formatPsqlFailureCode("apply", "token=secret owner@example.test")).toBe(
      "apply:unknown",
    );
  });

  it("rejects remote and arbitrary loopback targets before spawning psql", async () => {
    const harness = await load(HARNESS_PATH);
    let spawnCount = 0;
    const spawnImpl = () => {
      spawnCount += 1;
      return { status: 1, stdout: "", stderr: "" };
    };

    for (const databaseUrl of [
      "postgresql://postgres:secret@db.knkwiiywfkbqznbxwqfh.supabase.co/postgres",
      "postgresql://service_role:secret@127.0.0.1:5432/verdant_quicklog_revision_replay",
      "postgresql://postgres:secret@127.0.0.1:6543/verdant_quicklog_revision_replay",
      "postgresql://postgres:secret@127.0.0.1:5432/postgres",
      "postgresql://postgres:@127.0.0.1:5432/verdant_quicklog_revision_replay",
      undefined,
    ]) {
      await expect(harness.runPg15Harness({ databaseUrl, spawnImpl })).resolves.toBe(1);
    }
    expect(spawnCount).toBe(0);
  });

  it("attests the SQL-side sentinel before sending destructive baseline SQL", async () => {
    const harness = await load(HARNESS_PATH);
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
    expect(inputs[0]).toContain("set transaction read only");
    expect(inputs[0]).toContain("server_version_num')::integer >= 150000");
    expect(inputs[0]).not.toContain("drop schema");
  });

  it("builds the production baseline in one transaction: scaffold, reviewed prerequisite, seed", async () => {
    const harness = await load(HARNESS_PATH);
    const calls: string[] = [];

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          calls.push(String(options.input ?? ""));
          if (calls.length === 1) {
            return { status: 0, stdout: `${DISPOSABLE_SENTINEL}\n`, stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "ERROR: stop\nSQL state: 55000" };
        },
      }),
    ).resolves.toBe(1);

    expect(calls).toHaveLength(2);
    const baseline = calls[1];
    expect(baseline).toMatch(/^begin;\n/);
    expect(baseline).toMatch(/\ncommit;\s*$/);
    expect(baseline).toContain("drop schema if exists public cascade;");
    expect(baseline).toContain(
      readFileSync(
        resolve("supabase/migrations/20260811090000_quicklog_corrections_retractions.sql"),
        "utf8",
      ),
    );
    // The measured production ledger shape and inheriting client roles.
    expect(baseline).toContain("idempotency_key text unique, rollback text[]");
    expect(baseline).toContain(
      "create role service_role nologin nosuperuser nocreatedb nocreaterole inherit noreplication bypassrls",
    );
    expect(baseline.toLowerCase()).not.toContain("drop role");
    expect(baseline).not.toContain("quicklog_revision_idempotency");
  });

  it("pins the same migration bytes as the production runner", async () => {
    const harness = await load(HARNESS_PATH);
    const runner = await load(RUNNER_PATH);
    const migration = harness.validatePinnedMigrationFile();

    expect(migration.sha256).toBe(runner.PINNED_MIGRATION.sha256);
    expect(migration.sql).toContain("CREATE TABLE public.quicklog_revision_idempotency");
  });

  it("drives every drift class through the delivery preflight, not a local copy", async () => {
    const harness = await load(HARNESS_PATH);
    const cases = harness.DRIFT_CASES as Array<{ label: string; stage: string; expected: string }>;
    const labels = cases.map((drift) => drift.label);

    expect(new Set(labels).size).toBe(labels.length);
    for (const drift of cases) {
      expect(["baseline", "recorded"]).toContain(drift.stage);
      expect(["prerequisite_drift", "schema_drift", "ledger_drift"]).toContain(drift.expected);
    }
    expect(labels).toEqual(
      expect.arrayContaining([
        "legacy_retract_body_drift",
        "legacy_correct_anon_grant",
        "partial_receipt_table_only",
        "apply_once_body_drift",
        "keyed_correct_anon_grant",
        "apply_once_client_grant",
        "keyed_retract_dropped",
        "receipt_table_client_read",
        "receipt_table_policy",
        "receipt_table_rls_disabled",
        "receipt_table_key_check_dropped",
        "ledger_name_default",
        "ledger_extra_column",
        "ledger_idempotency_key_unique_dropped",
        "ledger_statements_drift",
        "ledger_name_collision",
        "ledger_recorded_but_objects_absent",
      ]),
    );
    expect(cases.filter((drift) => drift.expected === "prerequisite_drift").length).toBeGreaterThan(
      2,
    );
    expect(cases.filter((drift) => drift.expected === "ledger_drift").length).toBeGreaterThan(0);
  });

  it("is path-scoped to a pinned PostgreSQL 15.18 loopback service", () => {
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const workflow = loadYaml(source) as Record<string, any>;
    const trigger = workflow.on ?? workflow.true;
    const job = workflow.jobs.pg15_runtime;

    expect(trigger.pull_request.paths).toContain(
      "src/test/quicklog-revision-idempotent-replay-pg15-harness.test.ts",
    );
    expect(trigger.push.branches).toEqual(["verdant-grow-diary"]);
    expect(trigger.merge_group ?? {}).toEqual({});
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.env.QUICKLOG_REVISION_REPLAY_PG15_URL).toBe(DISPOSABLE_DATABASE_URL);
    expect(source).not.toContain("continue-on-error");
    expect(source).not.toContain("supabase.co");
    expect(source).not.toContain("secrets.");
  });

  it("initializes the exact disposable sentinel in one transaction", () => {
    const workflow = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const markerStep = workflow.jobs.pg15_runtime.steps.find(
      (step: Record<string, unknown>) =>
        step.name === "Create disposable PostgreSQL harness sentinel",
    );

    expect(markerStep.run).toContain(
      "create schema verdant_quicklog_revision_replay_harness authorization postgres",
    );
    expect(markerStep.run).toContain(DISPOSABLE_SENTINEL);
    expect(markerStep.run).toContain("--single-transaction");
  });
});
