/**
 * The Supabase migration ledger and client-role shape the production delivery
 * lanes pin, as MEASURED read-only on production (knkwiiywfkbqznbxwqfh,
 * PostgreSQL 17.6) as `postgres` on 2026-09-25.
 *
 * Earlier lanes pinned a three-column `supabase_migrations.schema_migrations`
 * (version, name, statements) with one constraint and one index, and NOINHERIT
 * client roles. Production has none of those: the ledger has six columns in
 * the order below plus a unique idempotency_key, and anon / authenticated /
 * service_role are INHERIT roles. Pinned to the old shape, every lane's
 * preflight classified production as prerequisite drift and could never
 * deliver.
 *
 * Every lane renders these rows into its own existing SQL format, and every
 * PostgreSQL 15 harness builds its scaffold ledger from
 * MIGRATION_LEDGER_CREATE_TABLE_SQL, so the contract and its runtime proof
 * cannot drift apart. Delivered ledger rows set only version, name and
 * statements; the other three columns are nullable with no default, and a
 * NULL idempotency_key cannot collide with the unique key.
 *
 * Role INHERIT is deliberately not pinned: every privilege fence in the lanes
 * uses has_*_privilege, which already resolves role membership.
 */

export const MIGRATION_LEDGER_COLUMNS = Object.freeze(
  [
    { attnum: 1, name: "version", type: "text", notNull: true, dataType: "text", udtName: "text" },
    {
      attnum: 2,
      name: "statements",
      type: "text[]",
      notNull: false,
      dataType: "ARRAY",
      udtName: "_text",
    },
    { attnum: 3, name: "name", type: "text", notNull: false, dataType: "text", udtName: "text" },
    {
      attnum: 4,
      name: "created_by",
      type: "text",
      notNull: false,
      dataType: "text",
      udtName: "text",
    },
    {
      attnum: 5,
      name: "idempotency_key",
      type: "text",
      notNull: false,
      dataType: "text",
      udtName: "text",
    },
    {
      attnum: 6,
      name: "rollback",
      type: "text[]",
      notNull: false,
      dataType: "ARRAY",
      udtName: "_text",
    },
  ].map((column) => Object.freeze(column)),
);

export const MIGRATION_LEDGER_CONSTRAINTS = Object.freeze(
  [
    {
      name: "schema_migrations_idempotency_key_key",
      type: "u",
      definition: "UNIQUE (idempotency_key)",
    },
    { name: "schema_migrations_pkey", type: "p", definition: "PRIMARY KEY (version)" },
  ].map((constraint) => Object.freeze(constraint)),
);

/** Both constraints are backed by a unique single-column btree index of the same name. */
export const MIGRATION_LEDGER_INDEXES = Object.freeze(
  [
    { name: "schema_migrations_idempotency_key_key", primary: false },
    { name: "schema_migrations_pkey", primary: true },
  ].map((index) => Object.freeze(index)),
);

/** Scaffold DDL that reproduces the measured shape, including constraint names. */
export const MIGRATION_LEDGER_CREATE_TABLE_SQL = `create table supabase_migrations.schema_migrations(
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text unique,
  rollback text[]
);`;

const flag = (value) => (value ? "t" : "f");

/** `attnum|name|type|notnull|generated|identity|no-default` rows (newer lanes). */
export function ledgerColumnRowsWithNoDefaultFlag() {
  return MIGRATION_LEDGER_COLUMNS.map(
    (column) => `${column.attnum}|${column.name}|${column.type}|${flag(column.notNull)}|||t`,
  );
}

/** `attnum|name|type|notnull|default|generated|identity` rows (signup lane). */
export function ledgerColumnRowsWithDefaultText() {
  return MIGRATION_LEDGER_COLUMNS.map(
    (column) => `${column.attnum}|${column.name}|${column.type}|${flag(column.notNull)}|||`,
  );
}

/** `name|type|notnull|default` rows (corrections lane). */
export function ledgerColumnRowsByName() {
  return MIGRATION_LEDGER_COLUMNS.map(
    (column) => `${column.name}|${column.type}|${flag(column.notNull)}|`,
  );
}

/** information_schema.columns rows in ordinal order (pinned production lane). */
export function ledgerInformationSchemaColumns() {
  return MIGRATION_LEDGER_COLUMNS.map((column) =>
    Object.freeze({
      name: column.name,
      data_type: column.dataType,
      udt_name: column.udtName,
      nullable: column.notNull ? "NO" : "YES",
    }),
  );
}

/** `conname|contype|validated|deferrable|deferred|definition`, ordered by name. */
export function ledgerConstraintRows() {
  return MIGRATION_LEDGER_CONSTRAINTS.map(
    (constraint) => `${constraint.name}|${constraint.type}|t|f|f|${constraint.definition}`,
  );
}

/** A SQL text[] literal of the given rows. */
export function sqlTextArrayLiteral(rows) {
  return `array[${rows.map((row) => `'${String(row).replaceAll("'", "''")}'`).join(",")}]::text[]`;
}
