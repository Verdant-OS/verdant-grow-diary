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

describe("supabase table explicit ACL rule", () => {
  it("the real migrations tree leaves exactly the legacy default-privilege tables", () => {
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((n) => n.endsWith(".sql"))
      .sort()
      .map((name) => ({
        name,
        sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n"),
      }));
    const found = findTablesWithoutExplicitAcl(migrations).map((f: { table: string }) => f.table);
    expect(found).toEqual([...LEGACY_DEFAULT_PRIVILEGE_TABLES]);
  });

  it("keeps the legacy list frozen, sorted and free of duplicates", () => {
    expect(Object.isFrozen(LEGACY_DEFAULT_PRIVILEGE_TABLES)).toBe(true);
    expect([...LEGACY_DEFAULT_PRIVILEGE_TABLES]).toEqual(
      [...new Set(LEGACY_DEFAULT_PRIVILEGE_TABLES)].sort(),
    );
  });

  it("flags a new public table with no grant", () => {
    expect(tables(CREATE)).toEqual(["leaky"]);
  });

  it.each([
    "GRANT SELECT ON public.leaky TO authenticated;",
    "grant select on table leaky to authenticated, service_role;",
    'GRANT SELECT ON TABLE public."leaky" TO authenticated;',
    "GRANT SELECT ON public.other, public.leaky TO authenticated;",
    "GRANT INSERT (id) ON public.leaky TO anon;",
    "REVOKE ALL ON TABLE public.leaky FROM PUBLIC, anon, authenticated, service_role;",
    "REVOKE ALL PRIVILEGES ON public.leaky FROM anon, authenticated;",
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
    ["a grant on another table", "GRANT SELECT ON public.leaky_audit TO authenticated;"],
    ["a function grant", "GRANT EXECUTE ON FUNCTION public.leaky() TO authenticated;"],
    ["a sequence grant", "GRANT USAGE ON SEQUENCE public.leaky TO authenticated;"],
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
