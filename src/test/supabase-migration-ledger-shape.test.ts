/**
 * Every production delivery lane accepts the migration ledger and client roles
 * production actually has.
 *
 * Measured read-only on production (knk, PostgreSQL 17.6) on 2026-09-25: the
 * ledger has six columns and a unique idempotency_key, and the client roles
 * are INHERIT. Lanes pinned to the older three-column / NOINHERIT shape
 * classified production as prerequisite drift and could never deliver.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const SHAPE_PATH = resolve("scripts/lib/supabaseMigrationLedgerShape.mjs");

async function load(path: string) {
  return import(`${pathToFileURL(resolve(path)).href}?test=${Date.now()}-${Math.random()}`);
}

const OLD_THREE_COLUMN_ROWS = [
  "'2|name|text|f|||t'",
  "'3|statements|text[]|f|||t'",
  "'2|name|text|f|||'",
  "'3|statements|text[]|f|||'",
  "array['version|text|t|','name|text|f|','statements|text[]|f|']",
];

/** Lanes whose contract uses the `attnum|name|type|notnull|generated|identity|no-default` rows. */
const NO_DEFAULT_FLAG_LANES = [
  ["scripts/apply-quicklog-manual-delegate-forward-repair.mjs", "CATALOG_STATE_QUERY_SQL"],
  ["scripts/apply-action-queue-transition-forward-repair.mjs", "CATALOG_STATE_QUERY_SQL"],
  ["scripts/apply-agreement-acceptance-insert-forward-repair.mjs", "CATALOG_STATE_QUERY_SQL"],
  ["scripts/apply-quicklog-revision-idempotent-replay.mjs", "CATALOG_STATE_QUERY_SQL"],
] as const;

const HARNESSES = [
  "scripts/run-quicklog-manual-delegate-forward-repair-pg15-harness.mjs",
  "scripts/run-action-queue-transition-forward-repair-pg15-harness.mjs",
  "scripts/run-signup-acquisition-forward-repair-pg15-harness.mjs",
  "scripts/run-quicklog-corrections-retractions-pg15-harness.mjs",
  "scripts/run-quicklog-revision-idempotent-replay-pg15-harness.mjs",
];

describe("measured production migration ledger shape", () => {
  it("pins the six measured columns, both constraints and both indexes", async () => {
    const shape = await load(SHAPE_PATH);

    expect(shape.ledgerColumnRowsWithNoDefaultFlag()).toEqual([
      "1|version|text|t|||t",
      "2|statements|text[]|f|||t",
      "3|name|text|f|||t",
      "4|created_by|text|f|||t",
      "5|idempotency_key|text|f|||t",
      "6|rollback|text[]|f|||t",
    ]);
    expect(shape.ledgerColumnRowsByName()).toEqual([
      "version|text|t|",
      "statements|text[]|f|",
      "name|text|f|",
      "created_by|text|f|",
      "idempotency_key|text|f|",
      "rollback|text[]|f|",
    ]);
    expect(shape.ledgerInformationSchemaColumns()).toEqual([
      { name: "version", data_type: "text", udt_name: "text", nullable: "NO" },
      { name: "statements", data_type: "ARRAY", udt_name: "_text", nullable: "YES" },
      { name: "name", data_type: "text", udt_name: "text", nullable: "YES" },
      { name: "created_by", data_type: "text", udt_name: "text", nullable: "YES" },
      { name: "idempotency_key", data_type: "text", udt_name: "text", nullable: "YES" },
      { name: "rollback", data_type: "ARRAY", udt_name: "_text", nullable: "YES" },
    ]);
    expect(shape.ledgerConstraintRows()).toEqual([
      "schema_migrations_idempotency_key_key|u|t|f|f|UNIQUE (idempotency_key)",
      "schema_migrations_pkey|p|t|f|f|PRIMARY KEY (version)",
    ]);
    expect(shape.MIGRATION_LEDGER_INDEXES.map((index: { name: string }) => index.name)).toEqual([
      "schema_migrations_idempotency_key_key",
      "schema_migrations_pkey",
    ]);
  });

  it.each(NO_DEFAULT_FLAG_LANES)(
    "%s accepts the measured ledger and inheriting roles",
    async (path, key) => {
      const shape = await load(SHAPE_PATH);
      const sql = (await load(path))[key] as string;

      for (const row of [
        ...shape.ledgerColumnRowsWithNoDefaultFlag(),
        ...shape.ledgerConstraintRows(),
      ]) {
        expect(sql, row).toContain(`'${row}'`);
      }
      for (const old of OLD_THREE_COLUMN_ROWS) expect(sql).not.toContain(old);
      expect(sql).not.toContain("conname='schema_migrations_pkey' and contype='p'");
      expect(sql).not.toContain("rolinherit");
    },
  );

  it("the corrections lane and the core verifier accept the measured ledger and roles", async () => {
    const shape = await load(SHAPE_PATH);
    const corrections = await load("scripts/apply-quicklog-corrections-retractions.mjs");
    const sql = corrections.QUICKLOG_CATALOG_STATE_QUERY_SQL as string;

    expect(sql).toContain(shape.sqlTextArrayLiteral(shape.ledgerColumnRowsByName()));
    expect(sql).toContain(shape.sqlTextArrayLiteral(shape.ledgerConstraintRows()));
    for (const old of OLD_THREE_COLUMN_ROWS) expect(sql).not.toContain(old);
    expect(corrections.QUICKLOG_DEPENDENCY_CATALOG_EXPRESSIONS_SQL).not.toContain("rolinherit");
    const core = await load("scripts/assert-required-core-migrations-applied.mjs");
    expect(core.QUICKLOG_CORRECTIONS_CATALOG_SQL).not.toContain("rolinherit");
  });

  it("the signup lane accepts the measured ledger, both indexes and the default owner ACL", async () => {
    const shape = await load(SHAPE_PATH);
    const sql = (await load("scripts/apply-signup-acquisition-forward-repair.mjs"))
      .PREFLIGHT_SQL as string;

    for (const row of shape.ledgerColumnRowsWithDefaultText()) {
      expect(sql, row).toContain(`'${row}'`);
    }
    for (const old of OLD_THREE_COLUMN_ROWS) expect(sql).not.toContain(old);
    expect(sql).toContain("con.conname = 'schema_migrations_idempotency_key_key'");
    expect(sql).toContain("index_class.relname = 'schema_migrations_idempotency_key_key'");
    // Owner-only ACL compared with PostgreSQL's own default, so the PG17
    // MAINTAIN privilege on production and its absence on PG15 both hold.
    expect(sql).toContain("aclexplode(acldefault('r', expected_ledger.relowner))");
  });

  it("the pinned production lane expects the measured information_schema columns", async () => {
    const shape = await load(SHAPE_PATH);
    const pinned = await load("scripts/apply-pinned-production-migrations.mjs");

    expect(pinned.EXPECTED_LEDGER_COLUMNS).toEqual(shape.ledgerInformationSchemaColumns());
  });

  it.each(HARNESSES)("%s builds its scaffold ledger from the measured shape", (path) => {
    const source = readFileSync(resolve(path), "utf8");

    expect(source).toContain("MIGRATION_LEDGER_CREATE_TABLE_SQL");
    expect(source).not.toMatch(/create table supabase_migrations\.schema_migrations\s*\(/);
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(source, role).not.toMatch(
        new RegExp(`(create|alter) role ${role} [^;'\\n]*\\bnoinherit\\b`),
      );
    }
  });
});
