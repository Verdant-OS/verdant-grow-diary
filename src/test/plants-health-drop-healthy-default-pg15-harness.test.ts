import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const HARNESS_PATH = resolve("scripts/run-plants-health-drop-healthy-default-pg15-harness.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/plants-health-drop-healthy-default-pg15.yml");
const MIGRATION_PATH = resolve(
  "supabase/migrations/20261015161000_plants_health_drop_healthy_default.sql",
);
const EARLIER_PATH = resolve(
  "supabase/migrations/20260924120000_plants_health_unassessed_default.sql",
);
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";
const DISPOSABLE_DATABASE_URL =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_plants_health_null";

async function load(path: string) {
  try {
    return await import(`${pathToFileURL(path).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `${path} could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

describe("plants health null PostgreSQL 15 regression", () => {
  it("rejects remote and arbitrary loopback targets before spawning psql", async () => {
    const harness = await load(HARNESS_PATH);
    let spawnCount = 0;
    const spawnImpl = () => {
      spawnCount += 1;
      return { status: 1, stdout: "", stderr: "" };
    };

    for (const databaseUrl of [
      "postgresql://postgres:secret@db.knkwiiywfkbqznbxwqfh.supabase.co/postgres",
      "postgresql://service_role:secret@127.0.0.1:5432/verdant_plants_health_null",
      "postgresql://postgres:secret@127.0.0.1:6543/verdant_plants_health_null",
      "postgresql://postgres:secret@127.0.0.1:5432/postgres",
      "postgresql://postgres:@127.0.0.1:5432/verdant_plants_health_null",
      undefined,
    ]) {
      await expect(harness.runPg15Harness({ databaseUrl, spawnImpl })).resolves.toBe(1);
    }
    expect(spawnCount).toBe(0);
  });

  it("attests the disposable sentinel before sending destructive baseline SQL", async () => {
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
    expect(inputs[0]).toBe(harness.attestationSql());
    expect(inputs[0]).toContain("set transaction read only");
    expect(inputs[0]).toContain("server_version_num')::integer >= 150000");
    expect(inputs[0]).toContain("server_version_num')::integer < 160000");
    expect(inputs[0]).not.toContain("drop schema");
  });

  it("applies this migration, inserts without health, and requires stored NULL", async () => {
    const harness = await load(HARNESS_PATH);
    const inputs: string[] = [];
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          inputs.push(String(options.input ?? ""));
          if (inputs.length === 1) {
            return { status: 0, stdout: `${harness.DISPOSABLE_SENTINEL}\n`, stderr: "" };
          }
          if (inputs.length === 5) return { status: 0, stdout: "null\n", stderr: "" };
          return { status: 0, stdout: "", stderr: "" };
        },
      }),
    ).resolves.toBe(0);

    expect(inputs).toHaveLength(5);
    expect(inputs[1]).toBe(harness.baselineSql());
    expect(inputs[1]).toContain("health text not null default 'unknown'");
    expect(inputs[1]).toContain(harness.validatePlantRowSql());
    expect(readFileSync(EARLIER_PATH, "utf8")).toContain(harness.validatePlantRowSql());
    expect(inputs[2]).toBe(migration);
    expect(inputs[2]).toContain("ALTER TABLE public.plants ALTER COLUMN health DROP NOT NULL;");
    expect(inputs[3]).toBe(harness.omittedHealthInsertSql());
    expect(inputs[3].toLowerCase()).not.toContain("health");
    expect(inputs[3]).toContain(harness.OMIT_PLANT_ID);
    expect(inputs[4]).toBe(harness.storedNullProbeSql());
    expect(inputs[4]).toContain("when health is null then 'null'");
  });

  it("fails when the omitted insert is rejected or the stored value is not NULL", async () => {
    const harness = await load(HARNESS_PATH);

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          const sql = String(options.input ?? "");
          if (sql.includes("set transaction read only") && sql.includes("runtime_sentinel")) {
            return { status: 0, stdout: `${harness.DISPOSABLE_SENTINEL}\n`, stderr: "" };
          }
          if (sql.includes("omit-column")) {
            return {
              status: 1,
              stdout: "",
              stderr: 'ERROR: null value in column "health"\nSQL state: 23502',
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
      }),
    ).resolves.toBe(1);

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, _args: string[], options: { input?: string }) => {
          const sql = String(options.input ?? "");
          if (sql.includes("runtime_sentinel")) {
            return { status: 0, stdout: `${harness.DISPOSABLE_SENTINEL}\n`, stderr: "" };
          }
          if (sql.includes("when health is null")) {
            return { status: 0, stdout: "stored:unknown\n", stderr: "" };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
      }),
    ).resolves.toBe(1);
  });

  it("is path-scoped to a pinned PostgreSQL 15.18 loopback service", () => {
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const workflow = loadYaml(source) as Record<string, any>;
    const trigger = workflow.on ?? workflow.true;
    const job = workflow.jobs.pg15_runtime;

    expect(trigger.pull_request.types).toEqual([
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
    ]);
    expect(trigger.pull_request.paths).toEqual([
      "scripts/run-plants-health-drop-healthy-default-pg15-harness.mjs",
      "supabase/migrations/20261015161000_plants_health_drop_healthy_default.sql",
      "supabase/migrations/20260924120000_plants_health_unassessed_default.sql",
      ".github/workflows/plants-health-drop-healthy-default-pg15.yml",
      "src/test/plants-health-drop-healthy-default-pg15-harness.test.ts",
      "src/test/plants-health-drop-healthy-default-migration.test.ts",
    ]);
    expect(trigger.push.branches).toEqual(["verdant-grow-diary"]);
    expect(trigger.merge_group ?? {}).toEqual({});
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.services.postgres.env.POSTGRES_DB).toBe("verdant_plants_health_null");
    expect(job.env.PLANTS_HEALTH_NULL_PG15_URL).toBe(DISPOSABLE_DATABASE_URL);
    expect(job["timeout-minutes"]).toBe(10);
    expect(workflow.permissions).toEqual({ contents: "read" });
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
    const runStep = workflow.jobs.pg15_runtime.steps.find(
      (step: Record<string, unknown>) => step.name === "Run isolated PostgreSQL 15 harness",
    );

    expect(markerStep.run).toContain(
      "create schema verdant_plants_health_null_harness authorization postgres",
    );
    expect(markerStep.run).toContain("verdant_plants_health_null_pg15_disposable_v1");
    expect(markerStep.run).toContain("--single-transaction");
    expect(runStep.run).toBe(
      "node scripts/run-plants-health-drop-healthy-default-pg15-harness.mjs",
    );
  });
});
