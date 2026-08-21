import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const SUFFIX = "_action_queue_table_acl_forward_repair.sql";
const PREDECESSOR_VERSION = "20260819190852";
const LOCAL_PARITY_SEED = readFileSync(resolve(ROOT, "supabase/seed.sql"), "utf8").replace(
  /\r\n?/g,
  "\n",
);

function migrationMatches(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(SUFFIX))
    .sort();
}

function repairSql(): string {
  const matches = migrationMatches();
  expect(matches, "exactly one Action Queue table-ACL forward repair").toHaveLength(1);
  return matches.length === 1
    ? readFileSync(join(MIGRATIONS, matches[0]), "utf8").replace(/\r\n?/g, "\n")
    : "";
}

// @source-scan-justified: this pins a forward-only SQL delivery artifact; the dedicated
// PostgreSQL 15 harness executes the migration and asserts its catalog/data effects.
describe("Action Queue table-ACL forward repair migration", () => {
  it("exists once after the published transition repair", () => {
    const matches = migrationMatches();

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatch(/^\d{14}_action_queue_table_acl_forward_repair\.sql$/);
    expect(matches[0].slice(0, 14) > PREDECESSOR_VERSION).toBe(true);
  });

  it("is transactional, advisory-locked, and orders preflight before ACL mutation", () => {
    const sql = repairSql();
    const begin = sql.search(/^begin;$/im);
    const preflight = sql.indexOf("$action_queue_table_acl_preflight$");
    const revoke = sql.search(
      /revoke\s+all\s+privileges\s+on\s+table\s+public\.action_queue\s*,\s*public\.action_queue_events\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i,
    );
    const grant = sql.search(
      /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.action_queue\s*,\s*public\.action_queue_events\s+to\s+authenticated\s*;/i,
    );
    const postflight = sql.indexOf("$action_queue_table_acl_postflight$");
    const commit = sql.search(/^commit;$/im);

    expect(begin).toBeGreaterThanOrEqual(0);
    expect(sql).toMatch(/pg_catalog\.pg_advisory_xact_lock\s*\(/i);
    expect(preflight).toBeGreaterThan(begin);
    expect(revoke).toBeGreaterThan(preflight);
    expect(grant).toBeGreaterThan(revoke);
    expect(postflight).toBeGreaterThan(grant);
    expect(commit).toBeGreaterThan(postflight);
    expect(sql.slice(commit + "commit;".length)).not.toMatch(
      /\b(create|alter|drop|grant|revoke|insert|update|delete|truncate)\b/i,
    );
  });

  it("accepts only the measured bloated client ACL or the exact canonical ACL", () => {
    const sql = repairSql();

    expect(sql).toContain("action_queue_table_acl_forward_repair_acl_drift");
    expect(sql).toContain("v_measured_acl_state");
    expect(sql).toContain("v_canonical_acl_state");
    expect(sql).toMatch(/pg_catalog\.aclexplode\s*\(/i);
    expect(sql).toContain("v_direct_client_acl");
    expect(sql).toContain("v_effective_client_acl");
    expect(sql).toContain("|f|postgres'");
    expect(sql).toMatch(
      /join\s+pg_catalog\.pg_roles\s+as\s+grantor\s+on\s+grantor\.oid\s*=\s*acl\.grantor/i,
    );

    for (const privilege of ["INSERT", "SELECT", "REFERENCES", "TRIGGER", "TRUNCATE"]) {
      expect(sql).toContain(`'${privilege}'`);
    }
    expect(sql).toMatch(/pg_catalog\.acldefault\s*\(\s*'r'/i);
    expect(sql).not.toMatch(/['"]MAINTAIN['"]/i);
  });

  it("fails closed on column grants and noncanonical effective privileges", () => {
    const sql = repairSql();

    expect(sql).toMatch(/pg_catalog\.has_table_privilege\s*\(/i);
    expect(sql).toMatch(/pg_catalog\.has_any_column_privilege\s*\(/i);
    expect(sql).toContain("action_queue_table_acl_forward_repair_column_acl_drift");
    expect(sql).toContain("action_queue_table_acl_forward_repair_effective_acl_drift");
  });

  it("pins browser roles against attributes that bypass the RLS contract", () => {
    const sql = repairSql();

    for (const attribute of ["rolsuper", "rolbypassrls", "rolcreaterole", "rolcreatedb"]) {
      expect(sql.match(new RegExp(`NOT role_state\\.${attribute}`, "g"))).toHaveLength(2);
    }
    expect(sql).toContain("action_queue_table_acl_forward_repair_role_drift");
  });

  it("snapshots privileged ACLs, rows, policies, and the Action Queue function scope", () => {
    const sql = repairSql();

    expect(sql).toMatch(
      /lock\s+table\s+public\.action_queue\s*,\s*public\.action_queue_events\s+in\s+share\s+mode/i,
    );
    expect(sql).toContain("verdant.action_queue_table_acl.privileged_acl_before");
    expect(sql).toContain("verdant.action_queue_table_acl.rows_before");
    expect(sql).toContain("verdant.action_queue_table_acl.policies_before");
    expect(sql).toContain("verdant.action_queue_table_acl.functions_before");
    expect(sql).toContain("action_queue_guard_decision_fields");
    expect(sql).toContain("action_queue_transition");
    expect(sql.split("AND p.proname LIKE 'action_queue\\_%' ESCAPE '\\';").length - 1).toBe(2);
    expect(sql).toContain("action_queue_table_acl_forward_repair_scope_changed");
  });

  it("postflights exact client privileges and no PUBLIC or anon table surface", () => {
    const sql = repairSql();
    const postflight = sql.slice(sql.indexOf("$action_queue_table_acl_postflight$"));

    for (const table of ["action_queue", "action_queue_events"]) {
      for (const privilege of ["SELECT", "INSERT"]) {
        expect(postflight).toMatch(
          new RegExp(
            `has_table_privilege\\(\\s*'authenticated'\\s*,\\s*'public\\.${table}'\\s*,\\s*'${privilege}'\\s*\\)`,
            "i",
          ),
        );
      }
      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
          expect(postflight).toMatch(
            new RegExp(
              `has_table_privilege\\(\\s*'${role}'\\s*,\\s*'public\\.${table}'\\s*,\\s*'${privilege}'\\s*\\)`,
              "i",
            ),
          );
        }
      }
    }
    expect(postflight).toContain("action_queue_table_acl_forward_repair_postcondition_failed");
  });

  it("contains no persistent data, policy, function, trigger, or schema mutation", () => {
    const sql = repairSql();

    expect(sql).not.toMatch(
      /^\s*(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+|table\s+)?public\./im,
    );
    expect(sql).not.toMatch(
      /^\s*(?:create|alter|drop)\s+(?:policy|function|trigger|table|schema|type|extension)\b/im,
    );
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
  });

  it("keeps local replay from reopening the repaired ACL", () => {
    expect(LOCAL_PARITY_SEED).toMatch(
      /revoke\s+all\s+privileges\s+on\s+table\s+public\.action_queue\s*,\s*public\.action_queue_events\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(LOCAL_PARITY_SEED).toMatch(
      /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.action_queue\s*,\s*public\.action_queue_events\s+to\s+authenticated/i,
    );
  });
});
