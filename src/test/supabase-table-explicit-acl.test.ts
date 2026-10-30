import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  findTablesWithoutExplicitAcl,
  LEGACY_DEFAULT_PRIVILEGE_TABLES,
} from "../../scripts/lib/supabaseTableAclRules.mjs";

// @source-scan-justified: From 2026-10-30 Supabase stops granting new public
// tables to anon/authenticated/service_role by default. supabase/seed.sql
// grants every table on local and CI replay, so only this static scan of
// migration SQL sees a CREATE that forgets its GRANT before it reaches the
// hosted project.

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

  it("tracks SELECT INTO when an alias is named insert or merge", () => {
    expect(tables('SELECT 1 AS "insert" INTO TABLE public.leaky;')).toEqual(["leaky"]);
    expect(tables('SELECT 1 AS "merge" INTO TABLE public.leaky;')).toEqual(["leaky"]);
    expect(tables("SELECT 1 AS insert INTO TABLE public.leaky;")).toEqual(["leaky"]);
    expect(
      tables(
        "WITH x AS (SELECT 1 AS id) MERGE INTO public.leaky t USING x ON t.id = x.id WHEN MATCHED THEN DO NOTHING;",
      ),
    ).toEqual([]);
  });

  it("carries a quoted semicolon through masked statement scans", () => {
    expect(tables('SELECT 1 AS "semi;colon" INTO TABLE public.leaky;')).toEqual(["leaky"]);
    expect(tables('CREATE TABLE public."semi;name" (id int);')).toEqual(["semi;name"]);
    expect(
      tables(
        'CREATE TABLE public."semi;name" (id int);\nGRANT SELECT ON public."semi;name" TO authenticated;',
      ),
    ).toEqual([]);
    expect(
      tables('CREATE TABLE public."semi;name" (id int);\nDROP TABLE public."semi;name";'),
    ).toEqual([]);
  });

  it("tracks SELECT INTO from a whole-command EXECUTE string", () => {
    expect(tables("DO $$ BEGIN EXECUTE 'SELECT 1 INTO TABLE public.leaky'; END $$;")).toEqual([
      "leaky",
    ]);
    expect(tables("DO $$ BEGIN EXECUTE $q$ SELECT 1 INTO TABLE public.leaky $q$; END $$;")).toEqual(
      ["leaky"],
    );
    expect(
      tables(
        "DO $$ BEGIN EXECUTE 'SELECT 1 INTO TABLE public.leaky; GRANT SELECT ON public.leaky TO authenticated'; END $$;",
      ),
    ).toEqual([]);
    expect(tables("DO $$ DECLARE n int; BEGIN SELECT 1 INTO n; END $$;")).toEqual([]);
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

  it("does not invent a table from CREATE TABLE inside a quoted identifier", () => {
    expect(
      tables('CREATE POLICY "CREATE TABLE public.leaky (" ON public.existing USING (true);'),
    ).toEqual([]);
  });

  it("does not invent a second table when a policy name contains CREATE TABLE", () => {
    expect(
      tables(
        `${CREATE}\nCREATE POLICY "CREATE TABLE public.other (" ON public.leaky USING (true);`,
      ),
    ).toEqual(["leaky"]);
  });

  it("does not invent a table from CREATE UNLOGGED TABLE inside a quoted identifier", () => {
    expect(
      tables(
        'CREATE POLICY "CREATE UNLOGGED TABLE public.leaky (" ON public.existing USING (true);',
      ),
    ).toEqual([]);
  });

  it("does not report an unreadable CREATE TABLE target that starts inside a quoted identifier", () => {
    expect(
      tables('CREATE POLICY "CREATE TABLE public.%I (" ON public.existing USING (true);'),
    ).toEqual([]);
  });

  it("still tracks CREATE TABLE after a quote inside a string literal", () => {
    expect(tables(`COMMENT ON SCHEMA public IS 'a " b';\n${CREATE}`)).toEqual(["leaky"]);
  });

  it("still tracks CREATE TABLE after a quote inside a dollar-quoted body", () => {
    expect(
      tables(
        `CREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $$ SELECT '"' $$;\n${CREATE}`,
      ),
    ).toEqual(["leaky"]);
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

  it("tracks literal execution and rejects unreadable dynamic commands", () => {
    expect(tables("DO $$ BEGIN EXECUTE 'CREATE TABLE public.leaky (id int)'; END $$;")).toEqual(["leaky"]);
    expect(tables("DO $$ BEGIN EXECUTE $ddl$ CREATE TABLE public.leaky (id int) $ddl$; EXECUTE 'GRANT SELECT ON public.leaky TO authenticated'; END $$;")).toEqual([]);
    const sql = `${CREATE}\nDO $$ BEGIN EXECUTE format($f$GRANT SELECT ON %I TO authenticated$f$, $t$leaky$t$); END $$;`;
    expect(tables(sql)).toEqual([`(unreadable dynamic EXECUTE at offset ${sql.indexOf("EXECUTE")})`, "leaky"]);
  });

  it("fails closed when a CREATE TABLE target cannot be read", () => {
    const formatSql = "DO $$ BEGIN EXECUTE format('CREATE TABLE %I (id int)', 'leaky'); END $$;";
    const concatSql = "DO $$ BEGIN EXECUTE 'CREATE TABLE ' || quote_ident('leaky'); END $$;";
    const phantomSql = "CREATE TABLE public.%I (id int);";
    expect(tables(formatSql)).toEqual([`(unreadable dynamic EXECUTE at offset ${formatSql.indexOf("EXECUTE")})`]);
    expect(tables(concatSql)).toEqual([`(unreadable dynamic EXECUTE at offset ${concatSql.indexOf("EXECUTE")})`]);
    expect(tables(phantomSql)).toEqual([`(unreadable CREATE TABLE target at offset ${phantomSql.indexOf("CREATE TABLE")})`]);
  });

  it("fails closed when EXECUTE concatenates CREATE and TABLE", () => {
    const sql = "DO $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky (id int)'; END $$;";
    expect(tables(sql)).toEqual([
      `(unreadable dynamic EXECUTE at offset ${sql.indexOf("EXECUTE")})`,
    ]);
  });

  it("fails closed when EXECUTE concatenates SELECT and INTO", () => {
    const sql = "DO $$ BEGIN EXECUTE 'SELECT 1 ' || 'INTO TABLE public.leaky'; END $$;";
    expect(tables(sql)).toEqual([
      `(unreadable dynamic EXECUTE at offset ${sql.indexOf("EXECUTE")})`,
    ]);
  });

  it("fails closed when a variable EXECUTE is assembled from split literals", () => {
    const sql =
      "DO $$ DECLARE v text; BEGIN v := 'CREATE ' || 'TABLE public.leaky (id int)'; EXECUTE v; END $$;";
    expect(tables(sql)).toEqual([
      `(unreadable dynamic EXECUTE at offset ${sql.indexOf("EXECUTE")})`,
    ]);
  });

  it("rejects unreadable dynamic SQL while ignoring trigger EXECUTE FUNCTION", () => {
    const selectSql = "DO $$ DECLARE n int; BEGIN EXECUTE format('SELECT id FROM %I', 'leaky') INTO n; END $$;";
    const grantSql = `${CREATE}\nDO $$ BEGIN EXECUTE format('GRANT SELECT ON public.leaky TO authenticated'); END $$;`;
    expect(tables(selectSql)).toEqual([`(unreadable dynamic EXECUTE at offset ${selectSql.indexOf("EXECUTE")})`]);
    expect(tables(grantSql)).toEqual([`(unreadable dynamic EXECUTE at offset ${grantSql.indexOf("EXECUTE")})`, "leaky"]);
    expect(tables(`${CREATE}\nCREATE FUNCTION public.tg() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RETURN NEW; END $fn$;\nCREATE TRIGGER t BEFORE INSERT ON public.leaky FOR EACH ROW EXECUTE FUNCTION public.tg();`)).toEqual(["leaky"]);
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

  it("scans a single-quoted DO body as SQL but keeps other literals masked", () => {
    expect(
      tables(`${CREATE}\nDO 'BEGIN GRANT SELECT ON public.leaky TO authenticated; END';`),
    ).toEqual([]);
    expect(
      tables(
        `${CREATE}\nDO LANGUAGE plpgsql 'BEGIN GRANT SELECT ON public.leaky TO authenticated; END';`,
      ),
    ).toEqual([]);
    expect(tables(`${CREATE}\nDO 'BEGIN DROP TABLE public.leaky; END';`)).toEqual([]);
    expect(
      tables(
        `${CREATE}\nDO 'BEGIN RAISE NOTICE ''GRANT SELECT ON public.leaky TO authenticated;''; END';`,
      ),
    ).toEqual(["leaky"]);
    expect(
      tables(
        `${CREATE}\nCOMMENT ON TABLE public.leaky IS 'GRANT SELECT ON public.leaky TO authenticated;';`,
      ),
    ).toEqual(["leaky"]);
    const escapedDo = `${CREATE}\nDO E'BEGIN GRANT SELECT ON public.leaky TO authenticated; END';`;
    expect(tables(escapedDo)).toEqual([`(unreadable escaped DO body at offset ${escapedDo.indexOf("'")})`, "leaky"]);
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
    const dropSql=`${CREATE}\nDO $$ BEGIN\n  EXECUTE 'DROP TABLE IF EXISTS public.leaky' || '_backup';\nEND $$;`;
    const grantSql=`${CREATE}\nDO $$ BEGIN\n  EXECUTE 'GRANT SELECT ON public.leaky TO ' || quote_ident('authenticated');\nEND $$;`;
    expect(tables(dropSql)).toEqual([`(unreadable dynamic EXECUTE at offset ${dropSql.indexOf("EXECUTE")})`, "leaky"]);
    expect(tables(grantSql)).toEqual([`(unreadable dynamic EXECUTE at offset ${grantSql.indexOf("EXECUTE")})`, "leaky"]);
    expect(tables(`${CREATE}\nDO $$ BEGIN\n  EXECUTE 'DROP TABLE IF EXISTS public.leaky';\nEND $$;`)).toEqual([]);
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
    const joined = `${CREATE}\nDO $ BEGIN EXECUTE $d$DROP TABLE public.leaky$d$ || '_x'; END $;`;
    expect(tables(joined)).toEqual([`(unreadable DROP TABLE target at offset ${joined.indexOf("DROP")})`, `(unreadable dynamic EXECUTE at offset ${joined.indexOf("EXECUTE")})`, "leaky"]);
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

  it.each(["functions", "sequence", "schema"])(
    "accepts GRANT SELECT ON unqualified table %s",
    (name) => {
      expect(
        tables(`CREATE TABLE public.${name} (id int);\nGRANT SELECT ON ${name} TO authenticated;`),
      ).toEqual([]);
    },
  );

  it.each(["functions", "sequence", "schema"])(
    "accepts REVOKE ALL ON unqualified table %s",
    (name) => {
      expect(
        tables(`CREATE TABLE public.${name} (id int);\nREVOKE ALL ON ${name} FROM PUBLIC;`),
      ).toEqual([]);
    },
  );

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
    ["a schema grant", "GRANT USAGE ON SCHEMA public TO authenticated;"],
    ["a column-level grant", "GRANT INSERT (id) ON public.leaky TO anon;"],
    ["a schema-wide grant", "GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;"],
    [
      "a schema-wide sequence grant",
      "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;",
    ],
    [
      "a schema-wide function grant",
      "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;",
    ],
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

  it("does not let a same-name temp table's unqualified drop clear a public table", () => {
    expect(tables(`${CREATE}\nCREATE TEMP TABLE leaky (id int);\nDROP TABLE leaky;`)).toEqual([
      "leaky",
    ]);
    expect(tables(`${CREATE}\nCREATE TEMPORARY TABLE leaky (id int);\nDROP TABLE leaky;`)).toEqual([
      "leaky",
    ]);
    expect(tables(`${CREATE}\nCREATE LOCAL TEMP TABLE leaky (id int);\nDROP TABLE leaky;`)).toEqual(
      ["leaky"],
    );
    expect(
      tables(`${CREATE}\nCREATE GLOBAL TEMPORARY TABLE leaky (id int);\nDROP TABLE leaky;`),
    ).toEqual(["leaky"]);
    expect(tables(`${CREATE}\nSELECT 1 INTO TEMP TABLE leaky;\nDROP TABLE leaky;`)).toEqual([
      "leaky",
    ]);
    expect(tables(`${CREATE}\nSELECT 1 INTO TEMPORARY leaky;\nDROP TABLE leaky;`)).toEqual([
      "leaky",
    ]);
  });

  it("does not credit an unqualified grant, revoke or rename while a temp of that name exists", () => {
    expect(
      tables(
        `${CREATE}\nCREATE TEMP TABLE leaky (id int);\nGRANT SELECT ON leaky TO authenticated;`,
      ),
    ).toEqual(["leaky"]);
    expect(
      tables(`${CREATE}\nCREATE TEMP TABLE leaky (id int);\nREVOKE ALL ON leaky FROM PUBLIC;`),
    ).toEqual(["leaky"]);
    expect(
      tables(`${CREATE}\nCREATE TEMP TABLE leaky (id int);\nALTER TABLE leaky RENAME TO other;`),
    ).toEqual(["leaky"]);
  });

  it("still applies schema-qualified public statements while a temp of that name exists", () => {
    expect(
      tables(`${CREATE}\nCREATE TEMP TABLE leaky (id int);\nDROP TABLE public.leaky;`),
    ).toEqual([]);
    expect(
      tables(
        `${CREATE}\nCREATE TEMP TABLE leaky (id int);\nGRANT SELECT ON public.leaky TO authenticated;`,
      ),
    ).toEqual([]);
    expect(
      tables(
        `${CREATE}\nCREATE TEMP TABLE leaky (id int);\nALTER TABLE public.leaky RENAME TO renamed;`,
      ),
    ).toEqual(["renamed"]);
  });

  it("ends the temp shadow on DROP of pg_temp.name so a later unqualified drop hits public", () => {
    expect(
      tables(
        `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;\nCREATE TEMP TABLE leaky (id int);\nDROP TABLE pg_temp.leaky;\nDROP TABLE leaky;`,
      ),
    ).toEqual([]);
  });

  it("ends the temp shadow on the first unqualified drop so a second unqualified drop hits public", () => {
    expect(
      tables(
        `${CREATE}\nGRANT SELECT ON public.leaky TO authenticated;\nCREATE TEMP TABLE leaky (id int);\nDROP TABLE leaky;\nDROP TABLE leaky;`,
      ),
    ).toEqual([]);
  });

  it("keeps temp names across migrations so a later unqualified drop still shadows", () => {
    expect(tables(`${CREATE}\nCREATE TEMP TABLE leaky (id int);`, "DROP TABLE leaky;")).toEqual([
      "leaky",
    ]);
  });

  it("does not let an unqualified SET SCHEMA clear a public table while a temp of that name exists", () => {
    expect(
      tables(`${CREATE}\nCREATE TEMP TABLE leaky (id int);\nALTER TABLE leaky SET SCHEMA private;`),
    ).toEqual(["leaky"]);
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

describe("ACL scanner safety regressions", () => {
  const checks: [string, string, boolean][] = [
    ["variable with unrelated literal", "DO $$ DECLARE v text; BEGIN RAISE NOTICE 'x'; v := 'CREATE ' || 'TABLE public.leaky (id int)'; EXECUTE v; END $$;", true],
    ["format placeholder in CREATE", "DO $$ BEGIN EXECUTE format('CREATE %s public.leaky (id int)', 'TABLE'); END $$;", true],
    ["dollar prose and dynamic SQL", "COMMENT ON SCHEMA public IS $c$grower's notes$c$; DO $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky (id int)'; END $$;", true],
    ["foreign table without grant", "CREATE FOREIGN TABLE public.leaky (id int) SERVER remote;", true],
    ["foreign table with grant", "CREATE FOREIGN TABLE public.leaky (id int) SERVER remote; GRANT SELECT ON public.leaky TO authenticated;", false],
    ["savepoint rolls grant back", "BEGIN; CREATE TABLE public.leaky(id int); SAVEPOINT p; GRANT SELECT ON public.leaky TO authenticated; ROLLBACK TO SAVEPOINT p; COMMIT;", true],
    ["savepoint rolls create back", "BEGIN; SAVEPOINT p; CREATE TABLE public.leaky(id int); ROLLBACK TO p; COMMIT;", false],
    ["savepoint restores dropped table", "BEGIN; CREATE TABLE public.leaky(id int); SAVEPOINT p; DROP TABLE public.leaky; ROLLBACK TO p; COMMIT;", true],
    ["quoted target delimiter", 'CREATE TABLE public."foo TO bar" (id int); GRANT SELECT ON public."foo TO bar" TO authenticated;', false],
    ["ordinary prose", "COMMENT ON SCHEMA public IS 'CREATE TABLE public.leaky (id int)';", false],
    ["dollar prose", "COMMENT ON SCHEMA public IS $c$CREATE TABLE public.leaky(id int)$c$;", false],
    ["grant to unrelated role", "CREATE TABLE public.leaky(id int); GRANT SELECT ON public.leaky TO postgres;", true],
    ["quoted api role", 'CREATE TABLE public.leaky(id int); GRANT SELECT ON public.leaky TO "authenticated";', false],
    ["quoted SELECT alias", 'SELECT 1 AS "x INTO private.decoy" INTO TABLE public.leaky;', true],
    ["non-ascii case", "CREATE TABLE public.Ä (id int); CREATE TABLE public.ä (id int); GRANT SELECT ON public.ä TO authenticated;", true],
    ["temporary table expires at commit", "BEGIN; CREATE TABLE public.leaky(id int); CREATE TEMP TABLE leaky(id int) ON COMMIT DROP; COMMIT; GRANT SELECT ON leaky TO authenticated;", false],
    ["temporary rename preserves expiration", "BEGIN; CREATE TABLE public.leaky(id int); CREATE TEMP TABLE leaky(id int) ON COMMIT DROP; ALTER TABLE leaky RENAME TO other; COMMIT; GRANT SELECT ON public.leaky TO authenticated;", false],
    ["CTAS WITH", "CREATE TABLE public.leaky WITH (fillfactor=90) AS SELECT 1 AS id; GRANT SELECT ON public.leaky TO authenticated;", false],
    ["CTAS USING", "CREATE TABLE public.leaky USING heap AS SELECT 1 AS id; GRANT SELECT ON public.leaky TO authenticated;", false],
    ["CTAS TABLESPACE", "CREATE TABLE public.leaky TABLESPACE pg_default AS SELECT 1 AS id; GRANT SELECT ON public.leaky TO authenticated;", false],
    ["single quoted DO dynamic", "DO 'BEGIN EXECUTE ''CREATE '' || ''TABLE public.leaky (id int)''; END';", true],
    ["escaped DO body", "DO E'BEGIN CREATE TABLE public.leaky(id int); END';", true],
    ["dynamic SQL in function", "CREATE FUNCTION public.make() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky (id int)'; END $$; SELECT public.make();", true],
    ["empty migrations", "", false],
  ];
  it.each(checks)("%s", (_name, sql, finding) => {
    expect(tables(sql).length > 0).toBe(finding);
    expect(tables(sql)).toEqual(tables(sql));
  });
});

describe("historical dynamic SQL is pinned to immutable migration bytes", () => {
  it.each([
    "20260709192453_507784b6-6a68-4a62-a5a4-ab2dc94598ea.sql",
    "20260722062644_8cdef271-abf0-4d82-9eca-970a91b6c547.sql",
    "20260728090000_production_schema_reconciliation.sql",
    "20260807150000_quicklog_save_manual_all_overloads.sql",
    "20260815054645_revoke_public_and_anon_execute_on_definer_functions.sql",
    "20260825233000_pheno_hunts_ownership_check_restore.sql",
  ])("fails closed when historical migration %s changes or is renamed", (name) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n");
    const dynamic = (file: string, text: string) => findTablesWithoutExplicitAcl([{name:file, sql:text}])
      .filter((finding: {table:string}) => finding.table.startsWith("(unreadable dynamic EXECUTE"));
    expect(dynamic(name, sql)).toEqual([]);
    expect(dynamic(name, sql + "\n").length > 0).toBe(true);
    expect(dynamic("20990101000000_new.sql", sql).length > 0).toBe(true);
    expect(dynamic(name, sql + "\nDO $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky(id int)'; END $$;").length > 0).toBe(true);
  });
});

describe("quoted routine body and comment boundaries", () => {
  it.each([
    "CREATE FUNCTION public.make() RETURNS void LANGUAGE plpgsql AS 'BEGIN CREATE TABLE public.leaky(id int); END'; SELECT public.make();",
    "CREATE FUNCTION public.make() RETURNS void LANGUAGE plpgsql AS E'BEGIN CREATE TABLE public.leaky(id int); END'; SELECT public.make();",
    "-- comment before DO\nDO $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky (id int)'; END $$;",
  ])("fails closed: %s", (sql) => {
    expect(tables(sql).length > 0).toBe(true);
  });
});

describe("security review transaction and lexical regressions", () => {
  it.each(["WORK", "TRANSACTION"])("honors ROLLBACK %s TO SAVEPOINT", (alias) => {
    const sql = "BEGIN; CREATE TABLE public.leaky(id int); SAVEPOINT p; GRANT SELECT ON public.leaky TO authenticated; ROLLBACK " + alias + " TO SAVEPOINT p; COMMIT;";
    expect(tables(sql)).toEqual(["leaky"]);
  });
  it("releases a repeated savepoint without the optional SAVEPOINT keyword", () => {
    expect(tables("BEGIN; CREATE TABLE public.leaky(id int); SAVEPOINT p; GRANT SELECT ON public.leaky TO authenticated; SAVEPOINT p; RELEASE p; ROLLBACK TO p; COMMIT;")).toEqual(["leaky"]);
  });
  it.each(["GRANT SELECT ON public.leaky TO authenticated;", "DROP TABLE public.leaky;"])("does not execute non-ASCII dollar prose: %s", (prose) => {
    expect(tables(CREATE + "\nCOMMENT ON SCHEMA public IS $é$" + prose + "$é$;")).toEqual(["leaky"]);
  });
  it.each(["note text DEFAULT 'ON COMMIT DROP'", '"ON COMMIT DROP" text'])("does not expire a temp shadow from descriptive text: %s", (column) => {
    expect(tables("BEGIN; CREATE TABLE public.leaky(id int); CREATE TEMP TABLE leaky(id int, " + column + "); COMMIT; GRANT SELECT ON leaky TO authenticated;")).toEqual(["leaky"]);
  });
});

describe("Unicode escape executable bodies", () => {
  it.each([
    "DO U&'BEGIN EXECUTE ''CREATE '' || ''TABLE public.leaky(id int)''; END';",
    "DO U&'BEGIN GRANT SELECT ON public.leaky TO authenticated; END';",
    "CREATE FUNCTION public.make() RETURNS void LANGUAGE plpgsql AS U&'BEGIN CREATE TABLE public.leaky(id int); END'; SELECT public.make();",
  ])("fails closed for unreadable Unicode escape SQL: %s", (sql) => {
    expect(tables(sql).length > 0).toBe(true);
  });
});

describe("DO language names use SQL identifier and string rules", () => {
  it.each([
    `DO LANGUAGE "plpgsql" $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky(id int)'; END $$;`,
    `DO LANGUAGE 'plpgsql' $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky(id int)'; END $$;`,
    `DO LANGUAGE "plpgsql" 'BEGIN EXECUTE ''CREATE '' || ''TABLE public.leaky(id int)''; END';`,
    `DO LANGUAGE 'plpgsql' 'BEGIN EXECUTE ''CREATE '' || ''TABLE public.leaky(id int)''; END';`,
  ])("reports dynamic DDL in %s", (sql) => { expect(tables(sql).length > 0).toBe(true); });
});

describe("transaction completion aliases and unknown DO prefixes", () => {
  it("uses END as a COMMIT for temporary tables", () => {
    expect(tables("BEGIN; CREATE TABLE public.leaky(id int); CREATE TEMP TABLE leaky(id int) ON COMMIT DROP; END; GRANT SELECT ON leaky TO authenticated;")).toEqual([]);
  });
  it.each(["BEGIN", "START TRANSACTION"])("uses ABORT to roll back %s", (start) => {
    expect(tables(start + "; CREATE TABLE public.leaky(id int); ABORT;")).toEqual([]);
  });
  it("rejects an executable DO body with an unparsed language prefix", () => {
    expect(tables("DO LANGUAGE U&'plpgsql' $$ BEGIN EXECUTE 'CREATE ' || 'TABLE public.leaky(id int)'; END $$;").length > 0).toBe(true);
  });
});

describe("executed literals normalize quoted identifier tokens", () => {
  const both = `CREATE TABLE public."grower''s"(id int); CREATE TABLE public."grower's"(id int);`;
  it("does not credit a raw doubled-apostrophe table from EXECUTE", () => {
    expect(tables(both + `DO $$ BEGIN EXECUTE 'GRANT SELECT ON public."grower''s" TO authenticated'; END $$; GRANT SELECT ON public."grower's" TO authenticated;`)).toEqual(["grower''s"]);
  });
  it("does not credit the raw spelling in a single-quoted DO body", () => {
    expect(tables(both + `DO 'BEGIN GRANT SELECT ON public."grower''s" TO authenticated; END'; GRANT SELECT ON public."grower's" TO authenticated;`)).toEqual(["grower''s"]);
  });
  it("accepts the correctly decoded identifier", () => {
    expect(tables(`CREATE TABLE public."grower's"(id int); DO $$ BEGIN EXECUTE 'GRANT SELECT ON public."grower''s" TO authenticated'; END $$;`)).toEqual([]);
  });
});

describe("EXECUTE statement contexts and control headers", () => {
  it.each([
    "CREATE TABLE public.operations (execute text); GRANT SELECT ON public.operations TO authenticated;",
    "CREATE TABLE public.execute (id int); GRANT SELECT ON public.execute TO authenticated;",
    "DO $$ DECLARE n int; execute text; BEGIN n := 1; END $$;",
    "DO $$ BEGIN CREATE TABLE public.operations (execute text); GRANT SELECT ON public.operations TO authenticated; END $$;",
  ])("does not invent dynamic SQL from an identifier: %s", (sql) => { expect(tables(sql)).toEqual([]); });
  it.each([
    "DO $$ BEGIN IF true THEN EXECUTE 'CREATE TABLE public.leaky(id int)'; END IF; END $$;",
    "DO $$ BEGIN FOR n IN 1..1 LOOP EXECUTE 'CREATE TABLE public.leaky(id int)'; END LOOP; END $$;",
    "DO $$ BEGIN IF false THEN NULL; ELSE EXECUTE 'CREATE TABLE public.leaky(id int)'; END IF; END $$;",
  ])("exposes literal creation after a control header: %s", (sql) => { expect(tables(sql)).toEqual(["leaky"]); });
  it("credits a literal grant after a true control header", () => {
    expect(tables(CREATE + "DO $$ BEGIN IF true THEN EXECUTE 'GRANT SELECT ON public.leaky TO authenticated'; END IF; END $$;")).toEqual([]);
  });
});

describe("nested literal SQL and relation lifecycle forms", () => {
  it("inspects nested DO commands inside literal EXECUTE", () => {
    const sql = "DO $outer$ BEGIN EXECUTE 'DO $inner$ BEGIN EXECUTE format(''CREATE %s public.leaky(id int)'', ''TABLE''); END $inner$'; END $outer$;";
    expect(tables(sql).length > 0).toBe(true);
  });
  it.each([
    "CREATE TABLE pg_temp.leaky(id int); DROP TABLE leaky;",
    "CREATE TABLE pg_temp.leaky(id int); GRANT SELECT ON leaky TO authenticated;",
    "CREATE TABLE pg_temp.leaky(id int); ALTER TABLE leaky RENAME TO other;",
    "SELECT 1 AS id INTO TABLE pg_temp.leaky; DROP TABLE leaky;",
  ])("tracks schema-qualified temp shadows: %s", (tail) => {
    expect(tables(CREATE + tail)).toEqual(["leaky"]);
  });
  it("ends a pg_temp shadow when it is dropped", () => {
    expect(tables(CREATE + "CREATE TABLE pg_temp.leaky(id int); DROP TABLE pg_temp.leaky; GRANT SELECT ON public.leaky TO authenticated;")).toEqual([]);
  });
  it("tracks foreign tables moved into public", () => {
    expect(tables("CREATE FOREIGN TABLE private.leaky(id int) SERVER remote; ALTER FOREIGN TABLE private.leaky SET SCHEMA public;")).toEqual(["leaky"]);
  });
  it("accepts a grant after a foreign-table move", () => {
    expect(tables("CREATE FOREIGN TABLE private.leaky(id int) SERVER remote; ALTER FOREIGN TABLE private.leaky SET SCHEMA public; GRANT SELECT ON public.leaky TO authenticated;")).toEqual([]);
  });
  it("preserves foreign-table ACL state through rename", () => {
    expect(tables("CREATE FOREIGN TABLE public.leaky(id int) SERVER remote; ALTER FOREIGN TABLE public.leaky RENAME TO renamed;")).toEqual(["renamed"]);
  });
});

describe("literal terminators, deferred routine bodies and opaque diagnostics", () => {
  it.each([
    "DO $$ BEGIN EXECUTE 'CREATE TABLE public.leaky(id int)' /* rationale */; END $$;",
    "DO $$ BEGIN EXECUTE $cmd$CREATE TABLE public.leaky(id int)$cmd$ /* rationale */; END $$;",
    "DO $$ BEGIN EXECUTE 'CREATE TABLE public.leaky(id int)' -- rationale\n; END $$;",
  ])("treats trailing comments as whitespace: %s", (sql) => { expect(tables(sql)).toEqual(["leaky"]); });
  it("accepts an executable literal grant with a trailing comment", () => {
    expect(tables(CREATE + "DO $$ BEGIN EXECUTE 'GRANT SELECT ON public.leaky TO authenticated' /* rationale */; END $$;")).toEqual([]);
  });
  it.each(["GRANT SELECT ON public.leaky TO authenticated;", "DROP TABLE public.leaky;"])("rejects deferred SQL-standard ACL/removal: %s", (command) => {
    expect(tables(CREATE + "CREATE FUNCTION public.later() RETURNS void LANGUAGE SQL BEGIN ATOMIC " + command + " END;").length > 0).toBe(true);
  });
  it("does not let a table identifier satisfy an opaque diagnostic", () => {
    const sql = 'DO $$ BEGIN EXECUTE \'CREATE \' || \'TABLE public.leaky(id int)\'; END $$; CREATE TABLE public."(unreadable dynamic EXECUTE at offset 12)"(id int); GRANT SELECT ON public."(unreadable dynamic EXECUTE at offset 12)" TO authenticated;';
    expect(tables(sql)).toEqual(["(unreadable dynamic EXECUTE at offset 12)"]);
  });
  it("fails closed for an unsupported SQL-standard routine even when innocuous", () => {
    expect(tables("CREATE FUNCTION public.later() RETURNS int LANGUAGE SQL BEGIN ATOMIC SELECT 1; END;").length > 0).toBe(true);
  });
});

describe("creation and nested literal views", () => {
  it("uses the creation view for quoted identifiers in routine bodies", () => {
    expect(tables('CREATE FUNCTION public.f() RETURNS int LANGUAGE SQL AS $$ SELECT 1 AS "CREATE TABLE public.ghost ("; $$;')).toEqual([]);
  });
  it("tracks SELECT INTO from EXECUTE in a single-quoted DO body", () => {
    expect(tables("DO 'BEGIN EXECUTE ''SELECT 1 INTO TABLE public.leaky''; END';")).toEqual(["leaky"]);
  });
  it("does not treat nested procedural SELECT INTO as table creation", () => {
    expect(tables("DO $o$ BEGIN EXECUTE 'DO $i$ DECLARE n int; BEGIN SELECT 1 INTO n; END $i$'; END $o$;")).toEqual([]);
  });
  it.each([
    "DO $o$ BEGIN EXECUTE 'DO $i$ BEGIN NULL; END $i$; SELECT 1 INTO TABLE public.leaky'; END $o$;",
    "DO $o$ BEGIN EXECUTE $cmd$DO $i$ BEGIN NULL; END $i$; SELECT 1 INTO TABLE public.leaky$cmd$; END $o$;",
  ])("tracks SQL after a DO statement in an EXECUTE payload: %s", (sql) => {
    expect(tables(sql)).toEqual(["leaky"]);
  });
});

describe("column lists with quoted punctuation", () => {
  it.each(["GRANT SELECT ON public.leaky TO GROUP authenticated;", "REVOKE ALL ON public.leaky FROM GROUP authenticated;"])("recognizes an API role with optional GROUP noise: %s", (acl) => {
    expect(tables(CREATE + acl)).toEqual([]);
  });
  it.each(['GRANT SELECT ON public.leaky TO "GROUP";', 'GRANT SELECT ON public.leaky TO GROUP unrelated;'])("still requires a Data API role: %s", (acl) => {
    expect(tables(CREATE + acl)).toEqual(["leaky"]);
  });
  it.each([
    ['"a, b, c(d" int', 'SELECT ("a, b, c(d")'],
    ['"a,b" int, "c(d" int', 'SELECT ("a,b"), UPDATE ("c(d")'],
    ['"a""b,c(d" int', 'SELECT ("a""b,c(d")'],
    ['"a)b,c" int, "d(e" int', 'REFERENCES ("a)b,c"), INSERT ("d(e")'],
    ['id int, private_note text', 'ALL (id)'],
    ['id int, private_note text', 'ALL PRIVILEGES (id)'],
    ['id int, private_note text', 'SELECT (id), ALL PRIVILEGES (id)'],
  ])("keeps column-only ACLs distinct: %s", (columns, privileges) => {
    expect(tables('CREATE TABLE public.leaky (' + columns + '); GRANT ' + privileges + ' ON public.leaky TO authenticated;')).toEqual(["leaky"]);
  });
  it("accepts a mixed table/column ACL despite quoted punctuation", () => {
    expect(tables('CREATE TABLE public.leaky ("a, b, c(d" int); GRANT SELECT ("a, b, c(d"), UPDATE ON public.leaky TO authenticated;')).toEqual([]);
  });
});

describe("schema-qualified object lifecycle", () => {
  const out = "ALTER TABLE public.leaky SET SCHEMA private;";
  const back = "ALTER TABLE private.leaky SET SCHEMA public;";
  const grant = "GRANT SELECT ON public.leaky TO authenticated;";
  it("preserves ACLs across a schema round trip", () => {
    expect(tables(CREATE + grant + out + back)).toEqual([]);
  });
  it("still requires an ACL after an ungranted round trip", () => {
    expect(tables(CREATE + out + back)).toEqual(["leaky"]);
  });
  it("clears an old ACL after an external drop and recreate", () => {
    expect(tables(CREATE + grant + out + "DROP TABLE private.leaky; CREATE TABLE private.leaky(id int);" + back)).toEqual(["leaky"]);
  });
  it("preserves the ACL through an external rename", () => {
    expect(tables(CREATE + grant + out + "ALTER TABLE private.leaky RENAME TO renamed; ALTER TABLE private.renamed SET SCHEMA public;")).toEqual([]);
  });
  it("recognizes an explicit ACL before moving into public", () => {
    expect(tables("CREATE TABLE private.leaky(id int); GRANT SELECT ON private.leaky TO authenticated;" + back)).toEqual([]);
  });
  it("restores external object state on rollback to a savepoint", () => {
    expect(tables("BEGIN;" + CREATE + grant + out + "SAVEPOINT s; DROP TABLE private.leaky; CREATE TABLE private.leaky(id int); ROLLBACK TO s;" + back + "COMMIT;")).toEqual([]);
  });
  it("does not retain an external grant rolled back to a savepoint", () => {
    expect(tables("BEGIN;" + CREATE + out + "SAVEPOINT s; GRANT SELECT ON private.leaky TO authenticated; ROLLBACK TO s;" + back + "COMMIT;")).toEqual(["leaky"]);
  });
  it("keeps identical names in different schemas separate", () => {
    expect(tables("CREATE TABLE one.leaky(id int); GRANT SELECT ON one.leaky TO authenticated; CREATE TABLE two.leaky(id int); ALTER TABLE two.leaky SET SCHEMA public;")).toEqual(["leaky"]);
  });
  it("resets state for SELECT INTO outside public", () => {
    expect(tables(CREATE + grant + out + "DROP TABLE private.leaky; SELECT 1 INTO TABLE private.leaky;" + back)).toEqual(["leaky"]);
  });
  it("preserves state across migration files", () => {
    expect(findTablesWithoutExplicitAcl([{name:"one.sql",sql:CREATE + grant + out},{name:"two.sql",sql:back}])).toEqual([]);
  });
  it("rejects schema drops instead of reviving a stale ACL", () => {
    const sql = "CREATE SCHEMA private; CREATE TABLE private.leaky(id int); GRANT SELECT ON private.leaky TO authenticated; DROP SCHEMA private CASCADE; CREATE SCHEMA private; CREATE TABLE public.leaky(id int); ALTER TABLE public.leaky SET SCHEMA private; DROP TABLE IF EXISTS public.leaky; ALTER TABLE private.leaky SET SCHEMA public;";
    expect(tables(sql).some((table) => table.startsWith("(unsupported schema lifecycle"))).toBe(true);
  });
  it("rejects schema renames instead of crediting the wrong object", () => {
    expect(tables("CREATE TABLE private.leaky(id int); ALTER SCHEMA private RENAME TO other; ALTER TABLE other.leaky SET SCHEMA public;").some((table) => table.startsWith("(unsupported schema lifecycle"))).toBe(true);
  });
});

describe("SQL token boundaries and repeated transaction starts", () => {
  it.each(["insert", "merge"])("retains a bare %s alias after a parenthesized expression", (alias) => {
    expect(tables("SELECT (1) " + alias + " INTO TABLE public.leaky;")).toEqual(["leaky"]);
    expect(tables("WITH x AS (SELECT 1) SELECT (1) " + alias + " INTO TABLE public.leaky;")).toEqual(["leaky"]);
    expect(tables("SELECT (SELECT 1) " + alias + " INTO TABLE public.leaky;")).toEqual(["leaky"]);
    expect(tables("WITH x AS (SELECT 1) SELECT (SELECT 1) " + alias + " INTO TABLE public.leaky;")).toEqual(["leaky"]);
  });
  it.each(["insert", "merge"])("retains a temporary shadow after parenthesized %s alias", (alias) => {
    expect(tables(CREATE + "SELECT (1) " + alias + " INTO TEMP leaky; GRANT SELECT ON leaky TO authenticated;")).toEqual(["leaky"]);
    expect(tables(CREATE + "WITH x AS (SELECT 1) SELECT (1) " + alias + " INTO TEMP leaky; GRANT SELECT ON leaky TO authenticated;")).toEqual(["leaky"]);
  });
  it.each(["INSERT", "MERGE"])("does not suppress SELECT INTO for a quoted %s alias", (verb) => {
    expect(tables('SELECT 1 AS ") ' + verb + ' INTO" INTO TABLE public.leaky;')).toEqual(["leaky"]);
  });
  it.each(["INSERT", "MERGE"])("retains a temporary shadow with a quoted %s alias", (verb) => {
    expect(tables(CREATE + 'SELECT 1 AS ") ' + verb + ' INTO" INTO TEMP leaky; GRANT SELECT ON leaky TO authenticated;')).toEqual(["leaky"]);
  });
  it.each(["BEGIN", "BEGIN WORK", "START TRANSACTION"])("preserves the initial rollback state on repeated %s", (begin) => {
    expect(tables(CREATE + "BEGIN; GRANT SELECT ON public.leaky TO authenticated; " + begin + "; ROLLBACK;")).toEqual(["leaky"]);
  });
  it("preserves savepoints across a repeated BEGIN", () => {
    expect(tables(CREATE + "BEGIN; SAVEPOINT s; GRANT SELECT ON public.leaky TO authenticated; BEGIN; ROLLBACK TO s; COMMIT;")).toEqual(["leaky"]);
  });
  it("keeps a real grant when repeated BEGIN is committed", () => {
    expect(tables(CREATE + "BEGIN; GRANT SELECT ON public.leaky TO authenticated; BEGIN; COMMIT;")).toEqual([]);
  });
  it.each(["p$grant", "égrant", "grant$foo", "granté", "p$revoke", "érevoke"])("does not read an ACL keyword inside policy identifier %s", (name) => {
    expect(tables(CREATE + "CREATE POLICY " + name + " ON public.leaky TO authenticated USING (true);")).toEqual(["leaky"]);
  });
  it("accepts a real ACL after a similarly named policy", () => {
    expect(tables(CREATE + "CREATE POLICY p$grant ON public.leaky TO authenticated USING (true); GRANT SELECT ON public.leaky TO authenticated;")).toEqual([]);
  });
});

describe("identifier byte limits and executable command variables", () => {
  it.each([false, true])("retains a truncated ASCII temporary shadow (quoted=%s)", (quoted) => {
    const n = "a".repeat(63);
    const ident = (value: string) => quoted ? '"' + value + '"' : value;
    expect(tables("CREATE TABLE public." + ident(n) + "(id int); CREATE TEMP TABLE " + ident(n + "x") + "(id int); DROP TABLE " + ident(n) + ";")).toEqual([n]);
  });
  it.each([false, true])("clips whole UTF-8 characters for temporary shadows (quoted=%s)", (quoted) => {
    const n = "é".repeat(31);
    const ident = (value: string) => quoted ? '"' + value + '"' : value;
    expect(tables("CREATE TABLE public." + ident(n) + "(id int); CREATE TEMP TABLE " + ident(n + "éx") + "(id int); DROP TABLE " + ident(n) + ";")).toEqual([n]);
  });
  it("uses the same truncated identity for a real ACL", () => {
    const n = "a".repeat(63);
    expect(tables("CREATE TABLE public." + n + "suffix(id int); GRANT SELECT ON public." + n + "other TO authenticated;")).toEqual([]);
  });
  it("keeps names differing inside the byte boundary distinct", () => {
    const prefix = "a".repeat(62);
    expect(tables("CREATE TABLE public." + prefix + "x(id int); CREATE TEMP TABLE " + prefix + "ysuffix(id int); DROP TABLE " + prefix + "x;")).toEqual([]);
  });
  it("retains a full multibyte character ending at byte63", () => {
    const n = "a".repeat(61) + "é";
    expect(tables('CREATE TABLE public."' + n + '"(id int); CREATE TEMP TABLE "' + n + 'suffix"(id int); DROP TABLE "' + n + '";')).toEqual([n]);
  });
  it("normalizes savepoint names at the same byte limit", () => {
    const n = "s".repeat(63);
    expect(tables(CREATE + "BEGIN; SAVEPOINT " + n + "; GRANT SELECT ON public.leaky TO authenticated; ROLLBACK TO " + n + "suffix; COMMIT;")).toEqual(["leaky"]);
  });
  it.each(["procedure", "function", '"procedure"', '"function"'])("rejects a runtime command variable named %s", (name) => {
    const findings = tables("DO $$ DECLARE " + name + " text := 'CREATE TABLE public.leaky(id int)'; BEGIN EXECUTE " + name + "; END $$;");
    expect(findings.some((table) => table.startsWith("(unreadable dynamic EXECUTE"))).toBe(true);
  });
  it.each(["FUNCTION", "PROCEDURE"])("does not reject real trigger EXECUTE %s syntax", (keyword) => {
    expect(tables("CREATE TRIGGER t BEFORE INSERT ON public.existing FOR EACH ROW EXECUTE " + keyword + " public.f();")).toEqual([]);
  });
});

describe("unsupported relation lifecycles and complete SELECT targets", () => {
  it.each([
    'CREATE TEMP TABLE U&"leaky"(id int);',
    'CREATE TEMPORARY TABLE U&"leaky"(id int);',
    'CREATE TEMP TABLE U&"pg_temp".leaky(id int);',
    'CREATE GLOBAL TEMP TABLE U&"leaky"(id int);',
  ])("rejects incomplete temporary-table targets: %s", (temporary) => {
    expect(tables(CREATE + temporary + "GRANT SELECT ON leaky TO authenticated;").some((table) => table.startsWith("(unreadable CREATE TEMP TABLE target"))).toBe(true);
  });
  it.each([
    "CREATE TEMP VIEW leaky AS SELECT 1 AS id;",
    "CREATE OR REPLACE TEMPORARY VIEW leaky AS SELECT 1 AS id;",
    "CREATE TEMP RECURSIVE VIEW leaky(id) AS SELECT 1;",
    "CREATE TEMP SEQUENCE leaky;",
    "CREATE TEMP SEQUENCE IF NOT EXISTS leaky;",
    "CREATE VIEW pg_temp.leaky AS SELECT 1 AS id;",
    "CREATE SEQUENCE pg_temp.leaky;",
    "CREATE SEQUENCE IF NOT EXISTS pg_temp.leaky;",
    "CREATE VIEW pg_temp_42.leaky AS SELECT 1 AS id;",
    "CREATE SEQUENCE pg_temp_42.leaky;",
  ])("rejects unsupported temporary relation shadows: %s", (relation) => {
    expect(tables(CREATE + relation + "GRANT SELECT ON leaky TO authenticated;").some((table) => table.startsWith("(unsupported temporary relation"))).toBe(true);
  });
  it("retains numeric pg_temp table-schema shadows", () => {
    expect(tables(CREATE + "CREATE TABLE pg_temp_42.leaky(id int); GRANT SELECT ON leaky TO authenticated;")).toEqual(["leaky"]);
  });
  it.each([true, false])("rejects potentially implicit temporary views (table first=%s)", (first) => {
    const view = "CREATE TEMP TABLE source(id int); CREATE VIEW leaky AS SELECT id FROM source;";
    const sql = (first ? CREATE + view : view + CREATE) + "GRANT SELECT ON leaky TO authenticated;";
    expect(tables(sql).some((table) => table.startsWith("(unreadable view persistence"))).toBe(true);
  });
  it("keeps qualified persistent views outside the table ACL contract", () => {
    expect(tables(CREATE + "GRANT SELECT ON public.leaky TO authenticated; CREATE TEMP TABLE source(id int); CREATE VIEW public.v AS SELECT id FROM public.leaky;")).toEqual([]);
  });
  it("keeps ordinary views without temp context outside this contract", () => {
    expect(tables("CREATE VIEW v AS SELECT 1 AS id;")).toEqual([]);
  });
  it("does not add a persistent-sequence ACL requirement", () => {
    expect(tables("CREATE SEQUENCE public.s START WITH 1 INCREMENT BY 1;")).toEqual([]);
  });
  it.each([
    'SELECT 1 AS id INTO TABLE public.U&"leaky";',
    'SELECT 1 AS id INTO TABLE U&"public".leaky;',
    'SELECT 1 AS id INTO TEMP U&"leaky";',
    'SELECT 1 AS id INTO TEMP U&"pg_temp".leaky;',
  ])("rejects incomplete SELECT INTO identifiers: %s", (select) => {
    expect(tables("CREATE TABLE public.u(id int);" + select + "GRANT SELECT ON public.u TO authenticated;").some((table) => table.startsWith("(unreadable SELECT INTO target"))).toBe(true);
  });
  it.each([
    "IMPORT FOREIGN SCHEMA public LIMIT TO (leaky) FROM SERVER remote INTO public;",
    'IMPORT FOREIGN SCHEMA "public" FROM SERVER remote INTO /* target */ "public";',
    "IMPORT FOREIGN SCHEMA public FROM SERVER remote INTO private;",
    "DO $$ BEGIN EXECUTE 'IMPORT FOREIGN SCHEMA public FROM SERVER remote INTO public'; END $$;",
  ])("rejects remote-dependent imports: %s", (sql) => {
    expect(tables(sql).some((table) => table.startsWith("(unsupported relation lifecycle"))).toBe(true);
  });
  it("rejects a partition-parent drop that could retain stale child ACLs", () => {
    const sql = "CREATE TABLE public.p(id int) PARTITION BY RANGE(id); CREATE TABLE public.leaky PARTITION OF public.p FOR VALUES FROM (0) TO (10); GRANT SELECT ON public.leaky TO authenticated; DROP TABLE public.p; CREATE TABLE IF NOT EXISTS public.leaky(id int);";
    expect(tables(sql).some((table) => table.startsWith("(unsupported relation lifecycle"))).toBe(true);
  });
  it.each([
    "CREATE TABLE IF NOT EXISTS public.leaky PARTITION OF public.p FOR VALUES FROM (0) TO (10);",
    "ALTER TABLE ONLY public.p ATTACH PARTITION public.leaky FOR VALUES FROM (0) TO (10);",
    "ALTER TABLE public.p DETACH PARTITION public.leaky;",
    "ALTER TABLE ONLY public.p DETACH PARTITION public.leaky CONCURRENTLY;",
    "ALTER TABLE ONLY (public.p) ATTACH PARTITION public.leaky FOR VALUES FROM (0) TO (10);",
    "ALTER TABLE current_db.public.p DETACH PARTITION public.leaky;",
  ])("rejects unmodeled partition ancestry changes: %s", (sql) => {
    expect(tables(sql).some((table) => table.startsWith("(unsupported relation lifecycle"))).toBe(true);
  });
  it("accepts a granted partitioned parent without child lifecycle changes", () => {
    expect(tables("CREATE TABLE public.p(id int) PARTITION BY RANGE(id); GRANT SELECT ON public.p TO authenticated;")).toEqual([]);
  });
  it("does not read SELECT aliases as partition creation", () => {
    expect(tables("CREATE TABLE public.leaky(partition int); GRANT SELECT ON public.leaky TO authenticated; SELECT partition of FROM public.leaky;")).toEqual([]);
  });
  it.each([
    'public.U&"parent"',
    'U&"public".parent',
    'U&"parent"',
    'public.U&"pare!006Et" UESCAPE \'!\'',
    'public.U&"pare!006Et"UESCAPE\'!\'',
    'public.U&"pare!006Et" UESCAPE E\'!\'',
    'U&"public"UESCAPE\'!\'.parent',
    'ONLY(public.parent)',
  ])("rejects encoded or adjacent ONLY partition targets: %s", (target) => {
    const sql = "CREATE TABLE public.parent(id int) PARTITION BY LIST(id); CREATE TABLE public.child(id int); GRANT SELECT ON public.child TO authenticated; ALTER TABLE " + target + " ATTACH PARTITION public.child FOR VALUES IN (1); DROP TABLE public.parent; CREATE TABLE IF NOT EXISTS public.child(id int);";
    expect(tables(sql).some((table) => table.startsWith("(unsupported relation lifecycle"))).toBe(true);
  });
  it("does not read an ALTER column/type pair as partition attachment", () => {
    expect(tables("CREATE DOMAIN partition AS integer;" + CREATE + "GRANT SELECT ON public.leaky TO authenticated; ALTER TABLE public.leaky ADD COLUMN detach partition;")).toEqual([]);
  });
  it("does not read unsupported syntax from quoted aliases or prose", () => {
    expect(tables('SELECT 1 AS "IMPORT FOREIGN SCHEMA public"; SELECT \'PARTITION OF public.p\';')).toEqual([]);
  });
});

describe("quoted-name adjacency and complete SQL keyword tokens", () => {
  it.each([
    'CREATE TABLE"leaky"(id int);',
    'CREATE TABLE"public"."leaky"(id int);',
    'CREATE TABLE IF NOT EXISTS"leaky"(id int);',
    'CREATE FOREIGN TABLE"public"."leaky"(id int) SERVER remote;',
  ])("tracks adjacent quoted CREATE targets: %s", (sql) => { expect(tables(sql)).toEqual(["leaky"]); });
  it.each(['SELECT 1 INTO"leaky";', 'SELECT 1 INTO TABLE"leaky";', 'SELECT 1 INTO UNLOGGED"leaky";'])("tracks adjacent quoted SELECT targets: %s", (sql) => {
    expect(tables(sql)).toEqual(["leaky"]);
  });
  it.each(['CREATE TEMP TABLE"leaky"(id int);', 'CREATE TEMP TABLE IF NOT EXISTS"leaky"(id int);', 'SELECT 1 INTO TEMP"leaky";'])("retains adjacent quoted temporary shadows: %s", (temporary) => {
    expect(tables(CREATE + temporary + "GRANT SELECT ON leaky TO authenticated;")).toEqual(["leaky"]);
  });
  it.each(['CREATE TEMP VIEW"leaky" AS SELECT 1 AS id;', 'CREATE TEMP SEQUENCE"leaky";'])("rejects adjacent quoted unsupported shadows: %s", (temporary) => {
    expect(tables(CREATE + temporary + "GRANT SELECT ON leaky TO authenticated;").some((table) => table.startsWith("(unsupported temporary relation"))).toBe(true);
  });
  it.each(['DROP TABLE"public"."leaky";', 'DROP TABLE IF EXISTS"public"."leaky";'])("clears ACLs after adjacent quoted DROP: %s", (drop) => {
    expect(tables(CREATE + "GRANT SELECT ON public.leaky TO authenticated;" + drop + "CREATE TABLE IF NOT EXISTS public.leaky(id int);")).toEqual(["leaky"]);
  });
  it.each(['ALTER TABLE"public"."leaky"RENAME TO"renamed";', 'ALTER TABLE IF EXISTS"public"."leaky" RENAME TO"renamed";'])("tracks adjacent quoted rename lifecycle: %s", (rename) => {
    expect(tables(CREATE + "GRANT SELECT ON public.leaky TO authenticated;" + rename + "CREATE TABLE IF NOT EXISTS public.leaky(id int);")).toEqual(["leaky"]);
  });
  it("tracks an adjacent quoted schema move before recreation", () => {
    expect(tables(CREATE + 'GRANT SELECT ON public.leaky TO authenticated; ALTER TABLE public."leaky"SET SCHEMA"private"; CREATE TABLE IF NOT EXISTS public.leaky(id int);')).toEqual(["leaky"]);
  });
  it.each([
    'GRANT SELECT ON"public"."leaky"TO"authenticated";',
    'GRANT SELECT ON TABLE"public"."leaky"TO authenticated;',
    'REVOKE ALL ON"public"."leaky"FROM"authenticated";',
  ])("accepts adjacent quoted ACL names: %s", (acl) => { expect(tables(CREATE + acl)).toEqual([]); });
  it.each(["p$into", "éinto"])("does not read an INTO suffix inside alias %s", (alias) => {
    expect(tables('CREATE TABLE public."into"(id int); SELECT 1 AS ' + alias + ' INTO public.leaky; GRANT SELECT ON public."into" TO authenticated;')).toEqual(["leaky"]);
  });
  it.each(["temp$leaky", "temporaryé"])("does not read a TEMP prefix inside target %s", (name) => {
    expect(tables("SELECT 1 INTO " + name + ";")).toEqual([name]);
  });
  it.each(['ALTER TABLE"public".parent', 'ALTER TABLE ONLY"public".parent'])("rejects unsupported partition targets with quoted adjacency: %s", (head) => {
    expect(tables(head + " ATTACH PARTITION public.child FOR VALUES IN (1);").some((table) => table.startsWith("(unsupported relation lifecycle"))).toBe(true);
  });
  it.each([
    'DROP TABLE public.U&"leaky";',
    'ALTER TABLE public.U&"leaky" RENAME TO other;',
    'ALTER TABLE public.leaky SET SCHEMA U&"private";',
  ])("rejects Unicode-escaped table lifecycle identifiers: %s", (ddl) => {
    expect(tables(CREATE + "GRANT SELECT ON public.leaky TO authenticated;" + ddl + "CREATE TABLE IF NOT EXISTS public.leaky(id int);").some((table) => table.startsWith("(unreadable table lifecycle identifier"))).toBe(true);
  });
  it("keeps existing ACLs on an adjacent quoted conditional CREATE", () => {
    expect(tables(CREATE + 'GRANT SELECT ON public.leaky TO authenticated; CREATE TABLE IF NOT EXISTS"public"."leaky"(id int);')).toEqual([]);
  });
});

describe("complete lifecycle expressions and EXPLAIN execution", () => {
  const granted = CREATE + "GRANT SELECT ON public.leaky TO authenticated;";
  const recreate = "CREATE TABLE IF NOT EXISTS public.leaky(id int);";
  it.each(["ONLY (public.leaky)", "ONLY(public.leaky)", 'ONLY"public"."leaky"', "public.leaky *", "public.leaky*", 'ONLY("public"."leaky")'])("tracks renamed relation expression %s", (relation) => {
    expect(tables(granted + "ALTER TABLE " + relation + " RENAME TO archived;" + recreate)).toEqual(["leaky"]);
  });
  it.each(["ONLY (public.leaky)", "ONLY(public.leaky)", 'ONLY"public"."leaky"', "public.leaky *", "public.leaky*", 'ONLY("public"."leaky")'])("tracks schema-moved relation expression %s", (relation) => {
    expect(tables(granted + "ALTER TABLE " + relation + " SET SCHEMA private;" + recreate)).toEqual(["leaky"]);
  });
  it.each(['ONLY(public.leaky)RENAME TO"archived";', 'public.leaky*RENAME TO"archived";'])("handles adjacent lifecycle tokens: %s", (action) => {
    expect(tables(granted + "ALTER TABLE " + action + recreate)).toEqual(["leaky"]);
  });
  it.each(["ALTER TABLE ONLY(postgres.public.leaky) RENAME TO archived;", "ALTER TABLE postgres.public.leaky* SET SCHEMA private;"])("rejects unmodeled catalog-qualified lifecycle: %s", (action) => {
    expect(tables(granted + action + recreate).some((table) => table.startsWith("(unreadable catalog-qualified lifecycle"))).toBe(true);
  });
  it("rejects an unparsed catalog-qualified DROP target", () => {
    expect(tables(granted + "DROP TABLE postgres.public.leaky;" + recreate).some((table) => table.startsWith("(unreadable DROP TABLE target"))).toBe(true);
  });
  const planned = "CREATE TEMP TABLE leaky AS SELECT 1 AS id; DROP TABLE leaky;" + recreate;
  it.each(["EXPLAIN ", "EXPLAIN VERBOSE ", "EXPLAIN (ANALYZE FALSE) ", "EXPLAIN(ANALYZE OFF) ", "EXPLAIN (ANALYZE 0, FORMAT JSON) ", "EXPLAIN (ANALYZE 'false') ", "EXPLAIN (COSTS OFF) ", "EXPLAIN /* reason */ (ANALYZE /* bool */ FALSE) "])("does not invent a planned temporary shadow: %s", (explain) => {
    expect(tables(granted + explain + planned)).toEqual(["leaky"]);
  });
  it.each(["EXPLAIN ANALYZE ", "EXPLAIN ANALYSE ", "EXPLAIN (ANALYZE) ", "EXPLAIN (ANALYZE TRUE) ", "EXPLAIN (ANALYZE ON) ", "EXPLAIN (ANALYZE 1, FORMAT JSON) ", "EXPLAIN (ANALYZE 'true') "])("retains an executed temporary shadow: %s", (explain) => {
    expect(tables(granted + explain + planned)).toEqual([]);
  });
  it("tracks a persistent CTAS under EXPLAIN ANALYZE", () => {
    expect(tables("EXPLAIN ANALYZE CREATE TABLE public.leaky AS SELECT 1 AS id;")).toEqual(["leaky"]);
  });
  it("ignores a persistent CTAS under EXPLAIN without ANALYZE", () => {
    expect(tables("EXPLAIN CREATE TABLE public.leaky AS SELECT 1 AS id;")).toEqual([]);
  });
  it.each([
    "DO $$ BEGIN EXECUTE 'EXPLAIN CREATE TEMP TABLE leaky AS SELECT 1 AS id'; END $$;",
    "DO $$ BEGIN EXECUTE $cmd$EXPLAIN CREATE TEMP TABLE leaky AS SELECT 1 AS id$cmd$; END $$;",
  ])("honors a planned literal command: %s", (explain) => {
    expect(tables(granted + explain + "DROP TABLE leaky;" + recreate)).toEqual(["leaky"]);
  });
  it("skips semicolons and fake DDL inside a planned dollar string", () => {
    expect(tables(granted + "EXPLAIN CREATE TEMP TABLE leaky AS SELECT $$; CREATE TEMP TABLE leaky AS SELECT 1;$$ AS id; DROP TABLE leaky;" + recreate)).toEqual(["leaky"]);
  });
  it("skips escaped quotes and fake DDL inside a planned E string", () => {
    const explain = String.raw`EXPLAIN CREATE TEMP TABLE leaky AS SELECT E'\'; CREATE TEMP TABLE leaky AS SELECT 1;' AS id;`;
    expect(tables(granted + explain + "DROP TABLE leaky;" + recreate)).toEqual(["leaky"]);
  });
  it.each(["EXPLAIN (ANALYZE dynamic) ", "EXPLAIN (ANALYZE E'false') ", "EXPLAIN (ANALYZE TRUE, ANALYZE FALSE) "])("fails closed for unreadable execution options: %s", (explain) => {
    expect(tables(granted + explain + planned).some((table) => table.startsWith("(unreadable EXPLAIN options"))).toBe(true);
  });
  it.each(["SELECT 1 AS explain INTO public.leaky;", "SELECT s.begin explain INTO public.leaky FROM public.s s;", "SELECT CASE WHEN true THEN explain ELSE 1 END INTO public.leaky FROM public.s;"])("does not confuse EXPLAIN identifiers with commands: %s", (sql) => {
    expect(tables(sql)).toEqual(["leaky"]);
  });
  it("does not mask a routine named explain", () => {
    expect(tables("CREATE FUNCTION public.explain() RETURNS void LANGUAGE plpgsql AS $$ BEGIN CREATE TABLE public.leaky(id int); END $$;")).toEqual(["leaky"]);
  });
  it.each(["DROP OWNED BY acl_cleanup;", "DROP/* reason */OWNED BY acl_cleanup CASCADE;", "DO $$ BEGIN DROP OWNED BY acl_cleanup; END $$;"])("rejects unsupported ownership cleanup: %s", (drop) => {
    expect(tables(granted + "ALTER TABLE public.leaky OWNER TO acl_cleanup;" + drop + recreate).some((table) => table.includes("unsupported DROP OWNED"))).toBe(true);
  });
  it("rejects unsupported ownership cleanup in a literal EXECUTE", () => {
    expect(tables(granted + "DO $$ BEGIN EXECUTE 'DROP OWNED BY acl_cleanup'; END $$;" + recreate).some((table) => table.startsWith("(unreadable nested EXECUTE"))).toBe(true);
  });
  it("does not read DROP OWNED from SELECT identifiers", () => {
    expect(tables(granted + "SELECT s.drop owned FROM public.s s;")).toEqual([]);
  });
  it("keeps keyword-prefixed variable assignments out of command handling", () => {
    expect(tables("DO $$ DECLARE execute$var int; BEGIN execute$var := 1; END $$;")).toEqual([]);
  });
});
