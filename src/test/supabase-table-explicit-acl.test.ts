import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  findTablesWithoutExplicitAcl,
  LEGACY_DEFAULT_PRIVILEGE_TABLES,
} from "../../scripts/lib/supabaseTableAclRules.mjs";

// From 2026-10-30 Supabase stops granting new public tables to
// anon/authenticated/service_role by default. supabase/seed.sql grants every
// table on local replay, so only this static rule sees a migration that
// forgets its GRANT before it reaches the hosted project.

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

function tables(...sqls: string[]): string[] {
  return findTablesWithoutExplicitAcl(
    sqls.map((sql, i) => ({ name: `2026110${i}000000_m.sql`, sql })),
  ).map((f: { table: string }) => f.table);
}

const CREATE = "CREATE TABLE public.leaky (id uuid primary key);";

// Independent freeze of the 22-entry exception list. The exported array may
// shrink (a later GRANT + removal), but a new tuple must not appear here.
const PINNED_LEGACY_DEFAULT_PRIVILEGE_TABLES = [
  { table: "alert_events", migration: "20260520234331_06b08698-1358-48b4-9c91-335d8913458a.sql" },
  { table: "alerts", migration: "20260520233437_40d368dc-f696-42ac-bd37-7efcb94eccb1.sql" },
  { table: "diary_entries", migration: "20260515173341_0c573a48-5b45-4310-897b-4a65f8a4ecdb.sql" },
  {
    table: "environment_events",
    migration: "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql",
  },
  { table: "feeding_events", migration: "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql" },
  { table: "grow_events", migration: "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql" },
  { table: "grow_targets", migration: "20260520225333_57f23225-fcb9-4173-9715-1d52904d9487.sql" },
  { table: "grows", migration: "20260515173341_0c573a48-5b45-4310-897b-4a65f8a4ecdb.sql" },
  { table: "harvests", migration: "20260515205725_3c724eb0-98de-4c17-a571-59e7b8b1a584.sql" },
  { table: "nug_events", migration: "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql" },
  {
    table: "observation_events",
    migration: "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql",
  },
  { table: "photo_events", migration: "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql" },
  {
    table: "pi_ingest_bridge_credentials",
    migration: "20260523062559_300cfcfa-46b2-45f7-84f4-0df1db6bd605.sql",
  },
  {
    table: "pi_ingest_idempotency_keys",
    migration: "20260523060642_98031981-ea3e-49d2-a147-f9fcddb4c7e7.sql",
  },
  { table: "plants", migration: "20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql" },
  { table: "profiles", migration: "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql" },
  {
    table: "sensor_readings",
    migration: "20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql",
  },
  { table: "tents", migration: "20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql" },
  {
    table: "training_events",
    migration: "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql",
  },
  { table: "unlocks", migration: "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql" },
  { table: "user_quests", migration: "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql" },
  {
    table: "watering_events",
    migration: "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql",
  },
] as const;

describe("supabase table explicit ACL rule", () => {
  it("the real migrations tree leaves exactly the legacy default-privilege tables", () => {
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((n) => n.endsWith(".sql"))
      .sort()
      .map((name) => ({
        name,
        sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n"),
      }));
    // Bound to the creating migration: a legacy table that is dropped and
    // recreated is a new table and must not inherit the exemption.
    expect(findTablesWithoutExplicitAcl(migrations)).toEqual(
      LEGACY_DEFAULT_PRIVILEGE_TABLES.map((e: { table: string; migration: string }) => ({
        table: e.table,
        migration: e.migration,
      })),
    );
  });

  it("keeps the legacy list frozen, sorted and free of duplicates", () => {
    const names = LEGACY_DEFAULT_PRIVILEGE_TABLES.map((e: { table: string }) => e.table);
    expect(Object.isFrozen(LEGACY_DEFAULT_PRIVILEGE_TABLES)).toBe(true);
    expect(LEGACY_DEFAULT_PRIVILEGE_TABLES.every((e: object) => Object.isFrozen(e))).toBe(true);
    expect(names).toEqual([...new Set(names)].sort());
  });

  it("does not let the legacy allowlist grow past the pinned tuples", () => {
    expect(PINNED_LEGACY_DEFAULT_PRIVILEGE_TABLES).toHaveLength(22);
    expect(PINNED_LEGACY_DEFAULT_PRIVILEGE_TABLES).toEqual(
      expect.arrayContaining(
        LEGACY_DEFAULT_PRIVILEGE_TABLES.map((e: { table: string; migration: string }) => ({
          table: e.table,
          migration: e.migration,
        })),
      ),
    );
  });

  it("does not let a legacy name cover a table dropped and recreated without an ACL", () => {
    const legacy = LEGACY_DEFAULT_PRIVILEGE_TABLES.find(
      (e: { table: string }) => e.table === "plants",
    );
    const found = findTablesWithoutExplicitAcl([
      { name: legacy.migration, sql: "CREATE TABLE public.plants (id uuid);" },
      {
        name: "20261101000000_m.sql",
        sql: "DROP TABLE public.plants;\nCREATE TABLE public.plants (id uuid);",
      },
    ]);
    expect(found).toEqual([{ table: "plants", migration: "20261101000000_m.sql" }]);
    expect(found).not.toContainEqual({ table: legacy.table, migration: legacy.migration });
  });

  it.each([
    CREATE,
    'CREATE TABLE public."leaky" (id int);',
    'CREATE TABLE "public"."leaky" (id int);',
    'CREATE TABLE "public" . leaky (id int);',
    "CREATE UNLOGGED TABLE public.leaky (id int);",
    "create table if not exists public.leaky (id int);",
    "CREATE TABLE leaky (id int);",
    "CREATE TABLE IF NOT EXISTS leaky (id int);",
    "COMMENT ON SCHEMA public IS $c$grower's notes$c$;\nCREATE TABLE public.leaky (id int);\nSELECT 'x';",
    "SELECT 1 AS id INTO TABLE public.leaky;",
    "SELECT 1 INTO public.leaky;",
    "SELECT 1 INTO UNLOGGED TABLE public.leaky;",
    "SELECT 1 INTO UNLOGGED public.leaky;",
    "SELECT 1 AS id INTO TABLE leaky;",
    "WITH x AS (SELECT 1 AS id) SELECT * INTO TABLE public.leaky FROM x;",
  ])("flags a new public table with no grant: %s", (sql) => {
    expect(tables(sql)).toEqual(["leaky"]);
  });

  it("keeps SQL after an unterminated quote visible and indices aligned", () => {
    expect(tables("SELECT 'oops;\nCREATE TABLE public.leaky (id int);")).toEqual(["leaky"]);
  });

  it("tracks a top-level SELECT INTO table and ignores PL/pgSQL INTO", () => {
    expect(tables("SELECT 1 AS id INTO TABLE public.leaky;")).toEqual(["leaky"]);
    expect(
      tables(
        "SELECT 1 AS id INTO TABLE public.leaky;\nGRANT SELECT ON public.leaky TO authenticated;",
      ),
    ).toEqual([]);
    expect(tables("SELECT 1 INTO TEMP TABLE public.leaky;")).toEqual([]);
    expect(tables("SELECT 1 INTO TEMPORARY TABLE public.leaky;")).toEqual([]);
    expect(tables("SELECT 1 INTO TABLE private.leaky;")).toEqual([]);
    expect(tables("WITH x AS (SELECT 1 AS id) INSERT INTO public.leaky SELECT * FROM x;")).toEqual(
      [],
    );
    expect(
      tables(
        "WITH x AS (SELECT 1 AS id) MERGE INTO public.leaky t USING x ON t.id = x.id WHEN MATCHED THEN DO NOTHING;",
      ),
    ).toEqual([]);
    expect(tables("DO $$ DECLARE n int; BEGIN SELECT 1 INTO n; END $$;")).toEqual([]);
    expect(
      tables(
        "CREATE FUNCTION public.later() RETURNS void LANGUAGE plpgsql AS $fn$ DECLARE n int; BEGIN SELECT 1 INTO n; END $fn$;",
      ),
    ).toEqual([]);
  });

  it("ignores tables in other schemas", () => {
    expect(tables("CREATE TABLE private.leaky (id int);")).toEqual([]);
    expect(
      tables("CREATE TABLE leaky (id int);\nGRANT SELECT ON private.leaky TO authenticated;"),
    ).toEqual(["leaky"]);
  });

  it("resets the ACL when an unqualified drop precedes IF NOT EXISTS", () => {
    expect(
      tables(
        `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;`,
        "DROP TABLE leaky;\nCREATE TABLE IF NOT EXISTS public.leaky (id int);",
      ),
    ).toEqual(["leaky"]);
  });

  it("masks literals nested inside an EXECUTE string", () => {
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN EXECUTE 'COMMENT ON TABLE public.leaky IS ''GRANT SELECT ON public.leaky TO authenticated;'''; END $$;`,
      ),
    ).toEqual(["leaky"]);
    // The payload itself still runs.
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN EXECUTE 'GRANT SELECT ON public.leaky TO authenticated'; END $$;`,
      ),
    ).toEqual([]);
  });

  it("does not read a keyword inside a quoted identifier as a grant", () => {
    expect(
      tables(
        `${CREATE}\nCREATE POLICY "Admins grant access" ON public.leaky TO authenticated USING (true);`,
      ),
    ).toEqual(["leaky"]);
    expect(
      tables(
        'CREATE TABLE public."table with spaces" (id int);\nGRANT SELECT ON public."table with spaces" TO authenticated;',
      ),
    ).toEqual([]);
  });

  it("tracks a table moved into public with ALTER TABLE ... SET SCHEMA", () => {
    const moveIn =
      "CREATE TABLE private.leaky (id int);\nALTER TABLE private.leaky SET SCHEMA public;";
    expect(tables(moveIn)).toEqual(["leaky"]);
    expect(tables(`${moveIn}\nGRANT SELECT ON public.leaky TO authenticated;`)).toEqual([]);
    // Moving out of public takes the table out of scope.
    expect(tables(`${CREATE}\nALTER TABLE IF EXISTS public.leaky SET SCHEMA private;`)).toEqual([]);
  });

  it("leaves a tracked table alone when a move into public onto its name does not run", () => {
    const granted = `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;`;
    // IF EXISTS and a missing source is a no-op in PostgreSQL.
    expect(tables(`${granted}\nALTER TABLE IF EXISTS private.leaky SET SCHEMA public;`)).toEqual(
      [],
    );
    // The destination already holds a table: PostgreSQL rejects the move.
    expect(
      tables(
        `${granted}\nCREATE TABLE private.leaky (id int);\nALTER TABLE private.leaky SET SCHEMA public;`,
      ),
    ).toEqual([]);
  });

  it("keeps tracking a table whose removal or rename never runs", () => {
    // An uncalled function body.
    expect(
      tables(
        CREATE,
        "CREATE FUNCTION public.reset() RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN DROP TABLE IF EXISTS public.leaky; END $fn$;",
      ),
    ).toEqual(["leaky"]);
    // Prose inside a string literal.
    expect(
      tables(`${CREATE}\nCOMMENT ON TABLE public.leaky IS 'never drop table leaky by hand';`),
    ).toEqual(["leaky"]);
    // A rename onto the tracked name inside an uncalled function body.
    expect(
      tables(
        `${CREATE}\nCREATE FUNCTION public.r() RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN ALTER TABLE public.other RENAME TO leaky; END $fn$;`,
      ),
    ).toEqual(["leaky"]);
    // Removals that do run still clear tracking.
    expect(tables(CREATE, "DO $$ BEGIN DROP TABLE public.leaky; END $$;")).toEqual([]);
    expect(tables(CREATE, "DO $$ BEGIN EXECUTE 'DROP TABLE public.leaky'; END $$;")).toEqual([]);
  });

  it("does not count a grant inside an uncalled function body", () => {
    expect(
      tables(
        `${CREATE}\nCREATE OR REPLACE FUNCTION public.later() RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN GRANT SELECT ON public.leaky TO authenticated; END $fn$;`,
      ),
    ).toEqual(["leaky"]);
  });

  it("tracks a table created by dynamic SQL and accepts a dynamic grant that runs", () => {
    expect(tables("DO $$ BEGIN EXECUTE 'CREATE TABLE public.leaky (id int)'; END $$;")).toEqual([
      "leaky",
    ]);
    expect(
      tables(
        "DO $$ BEGIN EXECUTE $ddl$ CREATE TABLE public.leaky (id int) $ddl$; EXECUTE 'GRANT SELECT ON public.leaky TO authenticated'; END $$;",
      ),
    ).toEqual([]);
    // A grant assembled at run time cannot be read statically: fail closed.
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN EXECUTE format($f$GRANT SELECT ON %I TO authenticated$f$, $t$leaky$t$); END $$;`,
      ),
    ).toEqual(["leaky"]);
  });

  it("fails closed when a CREATE TABLE target cannot be read", () => {
    const formatSql = "DO $$ BEGIN EXECUTE format('CREATE TABLE %I (id int)', 'leaky'); END $$;";
    const concatSql = "DO $$ BEGIN EXECUTE 'CREATE TABLE ' || quote_ident('leaky'); END $$;";
    const phantomSql = "CREATE TABLE public.%I (id int);";
    expect(tables(formatSql)).toEqual([
      `(unreadable CREATE TABLE target at offset ${formatSql.indexOf("CREATE TABLE")})`,
    ]);
    expect(tables(concatSql)).toEqual([
      `(unreadable CREATE TABLE target at offset ${concatSql.indexOf("CREATE TABLE")})`,
    ]);
    expect(tables(phantomSql)).toEqual([
      `(unreadable CREATE TABLE target at offset ${phantomSql.indexOf("CREATE TABLE")})`,
    ]);
  });

  it("counts an unqualified table under SET search_path as public", () => {
    expect(tables("SET search_path = public;\nCREATE TABLE leaky (id int);")).toEqual(["leaky"]);
  });

  it("does not count grant prose inside a dollar-quoted COMMENT", () => {
    expect(
      tables(
        `${CREATE}\nCOMMENT ON TABLE public.leaky IS $c$GRANT SELECT ON public.leaky TO authenticated;$c$;`,
      ),
    ).toEqual(["leaky"]);
  });

  it("scans dollar-quoted bodies as SQL but keeps their literals masked", () => {
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN RAISE NOTICE 'don''t'; GRANT SELECT ON public.leaky TO authenticated; END $$;`,
      ),
    ).toEqual([]);
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN RAISE NOTICE 'GRANT SELECT ON public.leaky TO authenticated;'; END $$;`,
      ),
    ).toEqual(["leaky"]);
  });

  it("does not let an apostrophe in a quoted identifier open a string literal", () => {
    expect(
      tables(
        `CREATE TABLE public."grower's" (id int);\nGRANT SELECT ON public."grower's" TO authenticated;\n${CREATE}\nSELECT 'x';`,
      ),
    ).toEqual(["leaky"]);
  });

  it("keeps quoted identifier case distinct from the folded name", () => {
    expect(
      tables(
        'CREATE TABLE public."Leaky" (id int);\nGRANT SELECT ON public.leaky TO authenticated;',
      ),
    ).toEqual(["Leaky"]);
    expect(
      tables(
        'CREATE TABLE public."Leaky" (id int);\nGRANT SELECT ON public."Leaky" TO authenticated;',
      ),
    ).toEqual([]);
  });

  it("keeps an existing table's ACL through a no-op CREATE TABLE IF NOT EXISTS", () => {
    expect(
      tables(
        `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;`,
        "CREATE TABLE IF NOT EXISTS public.leaky (id uuid primary key);",
      ),
    ).toEqual([]);
  });

  it("resets the ACL when IF NOT EXISTS follows a real drop", () => {
    expect(
      tables(
        `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;`,
        "DROP TABLE public.leaky;\nCREATE TABLE IF NOT EXISTS public.leaky (id int);",
      ),
    ).toEqual(["leaky"]);
  });

  it("carries a table's ACL state through ALTER TABLE ... RENAME TO", () => {
    const renamed = "ALTER TABLE public.leaky RENAME TO renamed;";
    expect(
      tables(`${CREATE}\n${renamed}\nGRANT SELECT ON public.renamed TO authenticated;`),
    ).toEqual([]);
    expect(
      tables(
        `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;\nALTER TABLE IF EXISTS ONLY leaky RENAME TO renamed;`,
      ),
    ).toEqual([]);
    expect(tables(`${CREATE}\n${renamed}`)).toEqual(["renamed"]);
    // A grant on the old name after the rename reaches no table.
    expect(tables(`${CREATE}\n${renamed}\nGRANT SELECT ON public.leaky TO authenticated;`)).toEqual(
      ["renamed"],
    );
    expect(tables(`${CREATE}\nALTER TABLE public.leaky RENAME COLUMN id TO uid;`)).toEqual([
      "leaky",
    ]);
  });

  it("leaves a tracked table alone when a rename onto its name does not run", () => {
    // IF EXISTS and a missing source is a no-op in PostgreSQL.
    expect(tables(`${CREATE}\nALTER TABLE IF EXISTS public.missing RENAME TO leaky;`)).toEqual([
      "leaky",
    ]);
    // Both names already hold tables: PostgreSQL rejects the rename.
    expect(
      tables(
        `${CREATE}\nCREATE TABLE public.other (id int);\nALTER TABLE public.other RENAME TO leaky;`,
      ),
    ).toEqual(["leaky", "other"]);
  });

  it("reads a removal target list only as complete names", () => {
    // A comma inside a quoted name does not split it into the tracked table.
    expect(tables(`${CREATE}\nDROP TABLE IF EXISTS public."unused,leaky";`)).toEqual(["leaky"]);
    expect(tables(`${CREATE}\nDROP TABLE IF EXISTS public."unused,leaky", public.leaky;`)).toEqual(
      [],
    );
    expect(tables(`${CREATE}\nDROP TABLE public.leaky CASCADE;`)).toEqual([]);
  });

  it("counts an EXECUTE string only when it is the whole command", () => {
    // The command is built at run time and names leaky_backup, not leaky.
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN\n  EXECUTE 'DROP TABLE IF EXISTS public.leaky' || '_backup';\nEND $$;`,
      ),
    ).toEqual(["leaky"]);
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN\n  EXECUTE 'GRANT SELECT ON public.leaky TO ' || quote_ident('authenticated');\nEND $$;`,
      ),
    ).toEqual(["leaky"]);
    expect(
      tables(`${CREATE}\nDO $$ BEGIN\n  EXECUTE 'DROP TABLE IF EXISTS public.leaky';\nEND $$;`),
    ).toEqual([]);
  });

  it("blanks dollar-quote tags around an exposed EXECUTE or DO body", () => {
    // No semicolon inside the payload; the closing tag sits on the identifier.
    expect(
      tables(`${CREATE}\nDO $$ BEGIN EXECUTE $ddl$DROP TABLE public.leaky$ddl$; END $$;`),
    ).toEqual([]);
    expect(tables(`${CREATE}\nEXECUTE $ddl$DROP TABLE public.leaky$ddl$;`)).toEqual([]);
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN EXECUTE $ddl$ALTER TABLE public.leaky RENAME TO renamed$ddl$; END $$;`,
      ),
    ).toEqual(["renamed"]);
    expect(
      tables(
        `${CREATE}\nDO $$ BEGIN EXECUTE $ddl$ALTER TABLE public.leaky RENAME TO renamed$ddl$; END $$;\nGRANT SELECT ON public.renamed TO authenticated;`,
      ),
    ).toEqual([]);
    // A payload joined to more text is not the whole command (fails closed).
    expect(
      tables(`${CREATE}\nDO $$ BEGIN EXECUTE $d$DROP TABLE public.leaky$d$ || '_x'; END $$;`),
    ).toEqual(["leaky"]);
  });

  it("reads non-ASCII unquoted identifiers", () => {
    expect(tables("CREATE TABLE α (id int);")).toEqual(["α"]);
    expect(
      tables("CREATE TABLE public.café (id int);\nGRANT SELECT ON café TO authenticated;"),
    ).toEqual([]);
  });

  it("drops every table in a DROP TABLE list", () => {
    expect(
      tables(
        "CREATE TABLE public.a (id int);\nCREATE TABLE public.b (id int);",
        "DROP TABLE IF EXISTS public.a, public.b CASCADE;",
      ),
    ).toEqual([]);
  });

  it.each([
    "GRANT SELECT ON public.leaky TO authenticated;",
    "grant select on table leaky to authenticated, service_role;",
    'GRANT SELECT ON TABLE public."leaky" TO authenticated;',
    "GRANT SELECT ON public.other, public.leaky TO authenticated;",
    "GRANT SELECT ON leaky TO authenticated;",
    "GRANT INSERT, SELECT (id) ON public.leaky TO anon;",
    "REVOKE ALL ON TABLE public.leaky FROM PUBLIC, anon, authenticated, service_role;",
    "REVOKE ALL PRIVILEGES ON public.leaky FROM anon, authenticated;",
    "COMMENT ON TABLE public.leaky IS 'it''s granted below';\nGRANT SELECT ON public.leaky TO anon;",
    "DO $$ BEGIN EXECUTE 'SELECT 1'; GRANT SELECT ON public.leaky TO authenticated; END $$;",
  ])("accepts an explicit table ACL: %s", (acl) => {
    expect(tables(`${CREATE}\n${acl}`)).toEqual([]);
  });

  it("accepts a grant in a later migration", () => {
    expect(tables(CREATE, "GRANT SELECT ON public.leaky TO authenticated;")).toEqual([]);
  });

  it.each([
    ["a partial revoke", "REVOKE INSERT, UPDATE, DELETE ON public.leaky FROM anon, authenticated;"],
    ["a column-level revoke", "REVOKE ALL PRIVILEGES (id) ON TABLE public.leaky FROM anon;"],
    ["a line-commented grant", "-- GRANT SELECT ON public.leaky TO authenticated;"],
    ["a block-commented grant", "/* GRANT SELECT ON public.leaky TO authenticated; */"],
    [
      "a grant inside a nested block comment",
      "/* outer /* nested */ GRANT SELECT ON public.leaky TO authenticated; */",
    ],
    [
      "grant text inside a COMMENT string literal",
      "COMMENT ON TABLE public.leaky IS 'Requires GRANT SELECT ON public.leaky TO authenticated; first';",
    ],
    [
      "grant text inside an escaped E-string literal",
      "COMMENT ON TABLE public.leaky IS E'it\\'s GRANT SELECT ON public.leaky TO authenticated;';",
    ],
    ["a grant on another table", "GRANT SELECT ON public.leaky_audit TO authenticated;"],
    ["a function grant", "GRANT EXECUTE ON FUNCTION public.leaky() TO authenticated;"],
    ["a sequence grant", "GRANT USAGE ON SEQUENCE public.leaky TO authenticated;"],
    ["a column-level grant", "GRANT INSERT (id) ON public.leaky TO anon;"],
    ["a schema-wide grant", "GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;"],
    [
      "a default-privilege grant",
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;",
    ],
  ])("still flags the table after %s", (_label, acl) => {
    expect(tables(`${CREATE}\n${acl}`)).toEqual(["leaky"]);
  });

  it("does not let a grant before a recreate cover the new table", () => {
    expect(
      tables(
        `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;\nDROP TABLE public.leaky;\n${CREATE}`,
      ),
    ).toEqual(["leaky"]);
  });

  it("ignores a table that is dropped", () => {
    expect(tables(CREATE, "DROP TABLE IF EXISTS public.leaky;")).toEqual([]);
  });

  it("returns a stable, sorted result for the same input", () => {
    const sql = "CREATE TABLE public.zeta (id int);\nCREATE TABLE public.alpha (id int);";
    expect(tables(sql)).toEqual(["alpha", "zeta"]);
    expect(tables(sql)).toEqual(tables(sql));
  });

  it("returns nothing for no migrations", () => {
    expect(findTablesWithoutExplicitAcl([])).toEqual([]);
  });
});
