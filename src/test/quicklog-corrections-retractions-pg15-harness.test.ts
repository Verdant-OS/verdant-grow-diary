import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const HARNESS_PATH = resolve("scripts/run-quicklog-corrections-retractions-pg15-harness.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/quicklog-corrections-retractions-pg15.yml");
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";
const DISPOSABLE_DATABASE_URL =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_quicklog_delivery";
const DISPOSABLE_SENTINEL = "verdant_quicklog_pg15_disposable_v1";

async function loadHarness() {
  try {
    return await import(`${pathToFileURL(HARNESS_PATH).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `Quick Log PG15 harness could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

describe("Quick Log corrections/retractions PostgreSQL 15 runtime gate", () => {
  it("uses bounded psql output with tuple-only quiet arguments", async () => {
    const harness = await loadHarness();
    expect(harness.buildPsqlArgs({ quiet: true })).toEqual([
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    expect(harness.formatPsqlFailureCode("postflight", "ERROR:  boom\nSQL state: 55000")).toBe(
      "postflight:55000",
    );
    expect(harness.formatPsqlFailureCode("postflight", "owner@example.com token=secret")).toBe(
      "postflight:unknown",
    );
  });

  it("rejects every non-loopback database target before spawning psql", async () => {
    const harness = await loadHarness();
    let spawnCount = 0;
    await expect(
      harness.runPg15Harness({
        databaseUrl: "postgresql://postgres:secret@db.knkwiiywfkbqznbxwqfh.supabase.co/postgres",
        spawnImpl: () => {
          spawnCount += 1;
          return { status: 1, stdout: "", stderr: "" };
        },
      }),
    ).resolves.toBe(1);
    expect(spawnCount).toBe(0);
  });

  it.each([
    ["user", "postgresql://service_role:secret@127.0.0.1:5432/verdant_quicklog_delivery"],
    ["port", "postgresql://postgres:secret@127.0.0.1:6543/verdant_quicklog_delivery"],
    ["database", "postgresql://postgres:secret@127.0.0.1:5432/postgres"],
  ])("rejects an arbitrary loopback %s before spawning psql", async (_field, databaseUrl) => {
    const harness = await loadHarness();
    let spawnCount = 0;

    await expect(
      harness.runPg15Harness({
        databaseUrl,
        spawnImpl: () => {
          spawnCount += 1;
          return { status: 1, stdout: "", stderr: "" };
        },
      }),
    ).resolves.toBe(1);
    expect(spawnCount).toBe(0);
  });

  it("rejects a failed SQL-side target attestation before sending destructive SQL", async () => {
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
    const calls: Array<{ args: string[]; input: string }> = [];

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, args: string[], options: { input?: string }) => {
          calls.push({ args, input: String(options.input ?? "") });
          if (calls.length === 1) {
            return { status: 0, stdout: `${DISPOSABLE_SENTINEL}\n`, stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "ERROR: late failure\nSQL state: 55000" };
        },
      }),
    ).resolves.toBe(1);

    expect(calls).toHaveLength(2);
    expect(calls[0].input).not.toContain("drop schema");
    expect(calls[1].input).toMatch(/^begin;\n/);
    expect(calls[1].input).toContain("drop schema if exists public cascade;");
    expect(calls[1].input).toMatch(/\ncommit;\s*$/);
  });

  it("never deletes shared cluster roles while preparing the disposable database", async () => {
    const harness = await loadHarness();
    const calls: Array<{ args: string[]; input: string }> = [];

    await expect(
      harness.runPg15Harness({
        databaseUrl: DISPOSABLE_DATABASE_URL,
        spawnImpl: (_command: string, args: string[], options: { input?: string }) => {
          calls.push({ args, input: String(options.input ?? "") });
          if (calls.length === 1) {
            return { status: 0, stdout: `${DISPOSABLE_SENTINEL}\n`, stderr: "" };
          }
          return { status: 1, stdout: "", stderr: "ERROR: stop after scaffold capture" };
        },
      }),
    ).resolves.toBe(1);

    expect(calls).toHaveLength(2);
    const scaffold = calls[1].input.toLowerCase();
    expect(scaffold).not.toContain("drop owned by");
    expect(scaffold).not.toContain("drop role");
    expect(scaffold).not.toContain("alter role");
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(scaffold).toContain(
        `if not exists(select 1 from pg_roles where rolname='${role}') then`,
      );
      expect(scaffold).toContain(`create role ${role} nologin`);
      expect(scaffold).toContain(
        `raise exception 'existing harness role ${role} has unsafe attributes'`,
      );
    }
    for (const boundedAttribute of [
      "not rolsuper",
      "not rolinherit",
      "not rolcreaterole",
      "not rolcreatedb",
      "not rolcanlogin",
      "not rolreplication",
      "not rolbypassrls",
    ]) {
      expect(scaffold).toContain(boundedAttribute);
    }
  });

  it("scaffolds the canonical user_roles RLS, policy, and least-privilege ACL trust chain", async () => {
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
          return { status: 1, stdout: "", stderr: "ERROR: stop after scaffold capture" };
        },
      }),
    ).resolves.toBe(1);

    expect(calls).toHaveLength(2);
    const scaffold = calls[1].input.toLowerCase();
    expect(scaffold).toContain("alter table public.user_roles enable row level security");
    expect(scaffold).toContain('create policy "users view own roles"');
    expect(scaffold).toContain('create policy "operators manage roles"');
    expect(scaffold).toContain(
      "using (auth.uid() = user_id or public.has_role(auth.uid(), 'operator'))",
    );
    expect(scaffold).toContain("with check (public.has_role(auth.uid(), 'operator'))");
    expect(scaffold).toContain("revoke all on public.user_roles from public, anon");
    expect(scaffold).toContain("revoke all on public.user_roles from authenticated, service_role");
    expect(scaffold).toContain("grant select on public.user_roles to authenticated");
    expect(scaffold).toContain("grant all on public.user_roles to service_role");
    expect(scaffold).not.toContain(
      "alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated",
    );
  });

  it("injects hostile prerequisite and target mutations inside the guarded apply transaction", async () => {
    const harness = await loadHarness();
    const migration = harness.validatePinnedMigrationFile({
      root: resolve("supabase", "migrations"),
    });
    const prerequisiteMutation = "alter role authenticated bypassrls;";
    const targetMutation =
      "grant execute on function public.quicklog_revision_resolve_root(uuid,uuid,uuid) to authenticated;";
    const sql = harness.buildHarnessApplySql(migration, {
      beforePrerequisiteGuardSql: prerequisiteMutation,
      beforePostflightGuardSql: targetMutation,
    });

    const prerequisiteGuard = sql.indexOf("do $quicklog_delivery_prerequisite_guard$");
    const pinnedMigration = sql.indexOf("-- BEGIN EXACT PINNED FILE:");
    const targetGuard = sql.indexOf("do $quicklog_delivery_catalog_guard$");
    expect(sql.indexOf(prerequisiteMutation)).toBeGreaterThan(
      sql.indexOf("lock table public.user_roles in share row exclusive mode;"),
    );
    expect(sql.indexOf(prerequisiteMutation)).toBeLessThan(prerequisiteGuard);
    expect(prerequisiteGuard).toBeLessThan(pinnedMigration);
    expect(sql.indexOf(targetMutation)).toBeGreaterThan(pinnedMigration);
    expect(sql.indexOf(targetMutation)).toBeLessThan(targetGuard);
  });

  it("names absent/apply/verified, partial drift, collision, catalog drift, and rollback proofs", () => {
    const source = readFileSync(HARNESS_PATH, "utf8");
    for (const proof of [
      "proveBaselineAndApply",
      "provePartialTargetDrift",
      "proveLedgerCollision",
      "proveCatalogDrift",
      "proveHostilePolicyDrift",
      "proveDependencyDrift",
      "proveHostileOwnerRollback",
      "proveHostileFunctionAclRollback",
      "proveAuthenticatedBypassRlsRollback",
      "proveInvalidIndexRollback",
      "provePrerequisiteRaceRollback",
      "proveUserRolesInheritanceDrift",
      "proveUserRolesInheritanceRollback",
      "proveRevisionInheritanceDrift",
      "proveRevisionInheritanceRollback",
      "proveLateTransactionRollback",
      "proveClientAccessFences",
      "proveFiveFunctionFingerprints",
    ]) {
      expect(source).toContain(proof);
    }
    expect(source).toContain("quicklog_entry_revisions");
    expect(source).toContain("alter table public.diary_entries add column retracted_at");
    expect(source).toContain("alter role authenticated bypassrls");
    expect(source).toContain("update pg_catalog.pg_index");
    expect(source).not.toContain("retraction_reason");
  });

  it("is path-scoped to a real pinned PostgreSQL 15 service", () => {
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const workflow = loadYaml(source) as Record<string, any>;
    const trigger = workflow.on ?? workflow.true;
    const job = workflow.jobs.pg15_runtime;

    expect(trigger.pull_request.paths).toContain(
      "scripts/run-quicklog-corrections-retractions-pg15-harness.mjs",
    );
    expect(trigger.pull_request.paths).toContain(
      "supabase/migrations/20260811090000_quicklog_corrections_retractions.sql",
    );
    expect(trigger.pull_request.paths).toContain(
      "scripts/assert-required-core-migrations-applied.mjs",
    );
    expect(trigger.pull_request.paths).toContain(".github/workflows/required-core-migrations.yml");
    expect(trigger.push.branches).toEqual(["verdant-grow-diary"]);
    expect(trigger).toHaveProperty("merge_group");
    expect(trigger.merge_group ?? {}).toEqual({});
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.env.QUICKLOG_CORRECTIONS_PG15_URL).toBe(DISPOSABLE_DATABASE_URL);
    expect(source).not.toContain("continue-on-error");
  });

  it("initializes the SQL-side disposable marker required by the harness", () => {
    const workflow = loadYaml(readFileSync(WORKFLOW_PATH, "utf8")) as Record<string, any>;
    const job = workflow.jobs.pg15_runtime;
    const markerStep = job.steps.find(
      (step: Record<string, unknown>) =>
        step.name === "Create disposable PostgreSQL harness sentinel",
    );

    expect(markerStep).toBeDefined();
    expect(markerStep.run).toContain(
      "create schema verdant_quicklog_harness authorization postgres",
    );
    expect(markerStep.run).toContain("create table verdant_quicklog_harness.runtime_sentinel");
    expect(markerStep.run).toContain(DISPOSABLE_SENTINEL);
    expect(markerStep.run).toContain("--single-transaction");
  });
});
