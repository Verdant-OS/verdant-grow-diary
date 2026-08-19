import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const SUFFIX = "_action_queue_transition_forward_repair.sql";
const HISTORICAL_RPC = readFileSync(
  join(MIGRATIONS, "20260726093000_action_queue_transition_rpc.sql"),
  "utf8",
).replace(/\r\n?/g, "\n");
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
  expect(matches, "exactly one forward Action Queue repair migration").toHaveLength(1);
  return matches.length === 1
    ? readFileSync(join(MIGRATIONS, matches[0]), "utf8").replace(/\r\n?/g, "\n")
    : "";
}

function functionBody(sql: string): string {
  const match = sql.match(
    /(?:create|create\s+or\s+replace)\s+function\s+public\.action_queue_transition\s*\([\s\S]*?\)\s*returns\s+jsonb[\s\S]*?as\s+\$function\$([\s\S]*?)\$function\$/i,
  );
  expect(match, "canonical action_queue_transition body").not.toBeNull();
  return match?.[1].replace(/\r\n?/g, "\n") ?? "";
}

// @source-scan-justified: this verifies an immutable SQL delivery artifact before execution;
// the dedicated PostgreSQL 15 harness exercises the catalog and behavior at runtime.
describe("Action Queue transition forward repair migration", () => {
  it("exists once as a newly timestamped forward migration", () => {
    const matches = migrationMatches();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatch(/^\d{14}_action_queue_transition_forward_repair\.sql$/);
  });

  it("is one self-transactional, advisory-locked, fail-closed repair", () => {
    const sql = repairSql();
    const begin = sql.search(/^begin;$/im);
    const preflight = sql.indexOf("$action_queue_transition_preflight$");
    const replace = sql.search(
      /create\s+or\s+replace\s+function\s+public\.action_queue_transition/i,
    );
    const postflight = sql.indexOf("$action_queue_transition_postflight$");
    const commit = sql.search(/^commit;$/im);

    expect(begin).toBeGreaterThanOrEqual(0);
    expect(sql).toMatch(/pg_advisory_xact_lock\s*\(/i);
    expect(preflight).toBeGreaterThan(begin);
    expect(replace).toBeGreaterThan(preflight);
    expect(postflight).toBeGreaterThan(replace);
    expect(commit).toBeGreaterThan(postflight);
    expect(sql.slice(commit + "commit;".length)).not.toMatch(
      /\b(create|alter|drop|grant|revoke|insert|update|delete)\b/i,
    );
  });

  it("installs the reviewed atomic transition behavior without inventing a second graph", () => {
    const sql = repairSql();
    const expected = functionBody(HISTORICAL_RPC);
    const actual = functionBody(sql);

    expect(actual).toBe(expected);
    expect(createHash("md5").update(actual, "utf8").digest("hex")).toBe(
      createHash("md5").update(expected, "utf8").digest("hex"),
    );
  });

  it("recognizes only exact legacy, contracted, and reconciled policy fingerprints", () => {
    const sql = repairSql();

    // The measured production state predates both transition migrations.
    expect(sql).toContain("02cf2857792d152113b7ab13fae6ca3f");
    expect(sql).toContain("b3c61a20be8f6d80b62d4abd81066fab");
    expect(sql).toContain("e79ba22f2e33a05579e48db4b022a4a9");
    // Full source replay can contain either the expand/contract policy or the
    // later breeding-reconciled insert policy.
    expect(sql).toContain("4d4741c455cf307f3e4909041c9d85d7");
    expect(sql).toContain("e08f43c1f4e1308a8d50e6cab797f933");
    expect(sql).toContain("420914cd6ffbd2d552c30e8d7b6ddf73");
    expect(sql).toMatch(
      /coalesce\s*\(\s*p\.grow_id\s*,\s*pt\.grow_id\s*\)\s*=\s*action_queue\.grow_id/i,
    );
    expect(sql).toMatch(/p\.grow_id\s+is\s+null[\s\S]*pt\.grow_id\s*=\s*action_queue\.grow_id/i);
  });

  it("makes lifecycle mutation RPC-only and audit history append-only", () => {
    const sql = repairSql();

    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"Users update own action_queue"/i);
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"Users delete own action_queue"/i);
    expect(sql).toMatch(
      /revoke\s+update\s*,\s*delete\s+on\s+table\s+public\.action_queue[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"Users delete own action_queue_events"/i);
    expect(sql).toMatch(/create\s+policy\s+"Users append own non-transition action_queue_events"/i);
    expect(sql).toMatch(/event_type\s+in\s*\(\s*'created'\s*,\s*'note'\s*\)/i);
    expect(sql).toMatch(
      /revoke\s+update\s*,\s*delete\s+on\s+table\s+public\.action_queue_events[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
  });

  it("attests required read/insert grants and effective mutation denial", () => {
    const sql = repairSql();

    expect(sql).toMatch(
      /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.action_queue\s*,\s*public\.action_queue_events\s+to\s+authenticated/i,
    );

    for (const [table, privilege] of [
      ["action_queue", "SELECT"],
      ["action_queue", "INSERT"],
      ["action_queue_events", "SELECT"],
      ["action_queue_events", "INSERT"],
    ]) {
      const pattern = new RegExp(
        `has_table_privilege\\(\\s*'authenticated'\\s*,\\s*'public\\.${table}'\\s*,\\s*'${privilege}'\\s*\\)`,
        "gi",
      );
      expect(sql.match(pattern)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }

    for (const role of ["anon", "authenticated"]) {
      for (const table of ["action_queue", "action_queue_events"]) {
        for (const privilege of ["UPDATE", "DELETE"]) {
          expect(sql).toMatch(
            new RegExp(
              `or\\s+pg_catalog\\.has_table_privilege\\(\\s*'${role}'\\s*,\\s*'public\\.${table}'\\s*,\\s*'${privilege}'\\s*\\)`,
              "i",
            ),
          );
        }
      }
    }
  });

  it("keeps the local production-parity seed from reopening lifecycle writes", () => {
    for (const table of ["action_queue", "action_queue_events"]) {
      expect(LOCAL_PARITY_SEED).toMatch(
        new RegExp(
          `revoke\\s+update\\s*,\\s*delete\\s+on\\s+table\\s+public\\.${table}[\\s\\S]*?from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
          "i",
        ),
      );
    }
  });

  it("exposes the SECURITY DEFINER RPC only to authenticated and pins an empty search path", () => {
    const sql = repairSql();

    expect(sql).toMatch(/security\s+definer\s+set\s+search_path\s*=\s*''/i);
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.action_queue_transition[\s\S]*from\s+public/i,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.action_queue_transition[\s\S]*from\s+anon/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.action_queue_transition[\s\S]*to\s+authenticated/i,
    );
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*to\s+(?:public|anon)/i);
  });

  it("contains no device-control, automatic approval, destructive data, or broad schema surface", () => {
    const sql = repairSql();

    expect(sql).not.toMatch(/mqtt|webhook|relay|actuator|home\s*assistant|device[_ -]?control/i);
    expect(sql).not.toMatch(
      /truncate\s+table|delete\s+from\s+public\.|drop\s+table|alter\s+table\s+public\.[a-z_]+\s+disable\s+row\s+level\s+security/i,
    );
    expect(sql).not.toMatch(/status\s*=\s*'approved'\s*(?:;|,)/i);
    expect(sql).not.toMatch(/create\s+table|create\s+type|create\s+extension/i);
  });
});
