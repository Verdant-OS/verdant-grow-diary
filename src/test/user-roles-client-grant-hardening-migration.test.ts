import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = resolve(
  "supabase/migrations/20260925090000_user_roles_client_grant_hardening.sql",
);
const PREREQUISITE_PATH = resolve(
  "supabase/migrations/20260517010926_65004f70-4e2c-48b3-bfcb-37bb8d2f0040.sql",
);
const HARNESS_PATH = resolve("scripts/run-user-roles-client-grant-hardening-pg15-harness.mjs");
const WORKFLOW_PATH = resolve(".github/workflows/user-roles-client-grant-hardening-pg15.yml");
const POSTGRES_IMAGE =
  "postgres:15.18@sha256:bb0df8b69f086efa2cbe4b8128df2f368a362bbdadef743731a63dd0f2f24c9e";
const DISPOSABLE_DATABASE_URL =
  "postgresql://postgres:verdant-runtime-only@127.0.0.1:5432/verdant_user_roles_grants";
const DISPOSABLE_SENTINEL = "verdant_user_roles_grants_pg15_disposable_v1";

async function load(path: string) {
  try {
    return await import(`${pathToFileURL(path).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `${path} could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** The migration's statements outside comments, DO bodies and string literals. */
function topLevelStatements(sql: string) {
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  const withoutBodies = withoutComments.replace(/(\$\w*\$)[\s\S]*?\1/g, () => "<body>");
  return withoutBodies
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

describe("user_roles client grant hardening migration", () => {
  it("is one LF transaction that changes only the browser roles' table grants", () => {
    const raw = readFileSync(MIGRATION_PATH);
    const sql = raw.toString("utf8");

    expect(raw.includes(13)).toBe(false);
    expect(raw.at(-1)).toBe(10);
    expect(sql).toMatch(/\nBEGIN;\n[\s\S]*\nCOMMIT;\n$/);
    expect(topLevelStatements(sql)).toEqual([
      "BEGIN",
      "SET LOCAL lock_timeout = '5s'",
      "SET LOCAL statement_timeout = '30s'",
      "DO <body>",
      "REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC, anon, authenticated",
      "GRANT SELECT ON TABLE public.user_roles TO authenticated",
      "DO <body>",
      "COMMIT",
    ]);
  });

  it("never grants, revokes or alters anything else", () => {
    // DO bodies are read-only catalog checks; their privilege names are data.
    const sql = topLevelStatements(readFileSync(MIGRATION_PATH, "utf8")).join(";\n");

    expect(sql.match(/\b(GRANT|REVOKE)\b/gi)).toHaveLength(2);
    expect(sql).not.toMatch(/\b(GRANT|REVOKE)\b[^;]*\b(service_role|sandbox_exec|postgres)\b/i);
    expect(sql).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\banon\b/i);
    expect(sql).not.toMatch(
      /\b(DROP|CREATE|ALTER\s+(TABLE|POLICY|ROLE|FUNCTION)|INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE)\b/i,
    );
  });

  it("fails closed on prerequisite drift, surviving client privileges and collateral change", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    for (const message of [
      "user_roles_client_grant_hardening_prerequisite_drift",
      "user_roles_client_grant_hardening_postcondition_failed",
      "user_roles_client_grant_hardening_preserved_state_changed",
    ]) {
      expect(sql, message).toContain(`MESSAGE = '${message}'`);
    }
    expect(sql.match(/ERRCODE = '55000'/g)?.length).toBeGreaterThanOrEqual(5);
    // Effective privileges, so a grant inherited through membership still fails.
    expect(sql).toContain("pg_catalog.has_table_privilege('anon', v_table, v_privilege)");
    expect(sql).toContain("pg_catalog.has_table_privilege('authenticated', v_table, v_privilege)");
    // MAINTAIN exists from PostgreSQL 17 (production) and is checked there.
    expect(sql).toContain("current_setting('server_version_num')::integer >= 170000");
    expect(sql).toContain("v_denied := v_denied || 'MAINTAIN'::text");
    expect(sql).toContain("IF v_direct <> ARRAY['authenticated|SELECT|f']::text[]");
    expect(sql).toContain("AND c.relrowsecurity");
  });

  it("keeps authenticated reads because the grower's own session still loads its roles", () => {
    const prerequisite = readFileSync(PREREQUISITE_PATH, "utf8");
    const entitlements = readFileSync(resolve("src/hooks/useMyEntitlements.ts"), "utf8");

    expect(prerequisite).toContain('CREATE POLICY "Users view own roles"');
    expect(entitlements).toContain('.from("user_roles")');
    expect(entitlements).toContain('.select("role")');
  });
});

describe("user_roles client grant hardening PostgreSQL 15 runtime gate", () => {
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
    expect(harness.formatPsqlFailureCode("apply", "ERROR: boom\nSQL state: 55000")).toBe(
      "apply:55000",
    );
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
      "postgresql://service_role:secret@127.0.0.1:5432/verdant_user_roles_grants",
      "postgresql://postgres:secret@127.0.0.1:6543/verdant_user_roles_grants",
      "postgresql://postgres:secret@127.0.0.1:5432/postgres",
      "postgresql://postgres:@127.0.0.1:5432/verdant_user_roles_grants",
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
    expect(inputs[0]).not.toContain("drop schema");
  });

  it("builds production's measured baseline from the reviewed user_roles DDL", async () => {
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
    expect(baseline).toContain(harness.readUserRolesPrerequisite());
    expect(readFileSync(PREREQUISITE_PATH, "utf8")).toContain(harness.readUserRolesPrerequisite());
    // Supabase-style defaults give the browser roles every privilege, as measured.
    expect(baseline).toContain("grant all on tables to anon, authenticated, service_role");
    expect(baseline).toContain("grant insert, select on public.user_roles to sandbox_exec;");
    expect(baseline.toLowerCase()).not.toContain("drop role");
  });

  it("drives every fail-closed case through the real migration", async () => {
    const harness = await load(HARNESS_PATH);
    const labels = (harness.FAIL_CLOSED_CASES as Array<{ label: string }>).map(
      (drift) => drift.label,
    );

    expect(labels).toEqual([
      "inherited_client_write",
      "inherited_client_truncate",
      "rls_disabled",
      "owner_drift",
      "client_role_bypassrls",
    ]);
    expect(harness.EXPECTED_CLIENT_ACL).toEqual(["authenticated|SELECT|f"]);
    expect(harness.MIGRATION_FILE).toBe("20260925090000_user_roles_client_grant_hardening.sql");
    expect(harness.readMigration()).toBe(readFileSync(MIGRATION_PATH, "utf8"));
  });

  it("is path-scoped to a pinned PostgreSQL 15.18 loopback service", () => {
    const source = readFileSync(WORKFLOW_PATH, "utf8");
    const workflow = loadYaml(source) as Record<string, any>;
    const trigger = workflow.on ?? workflow.true;
    const job = workflow.jobs.pg15_runtime;

    expect(trigger.pull_request.paths).toEqual(
      expect.arrayContaining([
        "supabase/migrations/20260925090000_user_roles_client_grant_hardening.sql",
        "supabase/migrations/20260517010926_65004f70-4e2c-48b3-bfcb-37bb8d2f0040.sql",
        "scripts/run-user-roles-client-grant-hardening-pg15-harness.mjs",
        "src/test/user-roles-client-grant-hardening-migration.test.ts",
      ]),
    );
    expect(trigger.push.paths).toEqual(trigger.pull_request.paths);
    expect(trigger.push.branches).toEqual(["verdant-grow-diary"]);
    expect(job.services.postgres.image).toBe(POSTGRES_IMAGE);
    expect(job.env.USER_ROLES_GRANTS_PG15_URL).toBe(DISPOSABLE_DATABASE_URL);
    expect(job.steps.at(-1).run).toBe(
      "node scripts/run-user-roles-client-grant-hardening-pg15-harness.mjs",
    );
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
      "create schema verdant_user_roles_grants_harness authorization postgres",
    );
    expect(markerStep.run).toContain(DISPOSABLE_SENTINEL);
    expect(markerStep.run).toContain("--single-transaction");
  });
});
