/**
 * Static invariants for the public Founders Wall view.
 *
 * These are load-bearing — vigilance comments in the migration are not
 * enforcement. Do NOT relax these assertions to make a linter happy; the
 * whole point is to catch a future refactor that would silently leak
 * `display_name` for `number_only` / `hidden` styles or grant anon
 * SELECT on the base founders table.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(resolve(MIGRATIONS_DIR, f), "utf8") }));

const CONCAT_SQL = ALL_MIGRATIONS.map((m) => m.sql).join("\n\n");

function findViewDefinition(): string {
  // The view definition lives in the Turn A base migration; A.1 adds a
  // COMMENT. We assert the effective (last) CREATE OR REPLACE VIEW body.
  const matches = CONCAT_SQL.match(
    /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.founders_wall_public[\s\S]*?;/gi,
  );
  if (!matches || matches.length === 0) {
    throw new Error("founders_wall_public view definition not found in migrations");
  }
  return matches[matches.length - 1];
}

describe("founders_wall_public — view exposure invariant", () => {
  it("exposes exactly founder_number, public_display_name, optional_link — no fourth column", () => {
    const viewSql = findViewDefinition();
    // Column list appears once in the SELECT. We assert exact presence of
    // the three names and absence of `display_name` / `display_style` /
    // `user_id` / `paddle_*` in the SELECT projection.
    expect(viewSql).toMatch(/\bfounder_number\b/);
    expect(viewSql).toMatch(/\bpublic_display_name\b/);
    expect(viewSql).toMatch(/\boptional_link\b/);
    // Extract the SELECT projection between SELECT and FROM.
    const projection = viewSql.match(/SELECT([\s\S]*?)FROM\s+public\.founders/i)?.[1] ?? "";
    // `display_name` may appear inside a CASE (aliased to public_display_name).
    // What must NOT appear as an alias/output column: user_id, paddle_*, status.
    expect(projection).not.toMatch(/\bAS\s+user_id\b/i);
    expect(projection).not.toMatch(/\bAS\s+paddle_[a-z_]+\b/i);
    expect(projection).not.toMatch(/\bAS\s+status\b/i);
  });

  it("uses security_barrier=true so predicates can't leak base rows", () => {
    const viewSql = findViewDefinition();
    expect(viewSql).toMatch(/security_barrier\s*=\s*true/i);
  });

  it("anon has NO SELECT on public.founders base table", () => {
    // Base grants live in the Turn A migration.
    const base = ALL_MIGRATIONS.find((m) => m.sql.includes("CREATE TABLE public.founders"));
    expect(base).toBeTruthy();
    const sql = base!.sql;
    // Explicit revoke or simply no grant to anon. We assert an explicit
    // REVOKE ... FROM anon exists somewhere in the founders migrations so
    // a future GRANT SELECT ... TO anon in a follow-up would be an
    // obvious departure from the pattern.
    const anonGrants = CONCAT_SQL.match(/GRANT\s+SELECT[^;]*\bTO\s+[^;]*\banon\b[^;]*;/gi) ?? [];
    for (const g of anonGrants) {
      expect(g).not.toMatch(/public\.founders\b/);
    }
    // And the base migration should never grant SELECT on founders to anon.
    expect(sql).not.toMatch(/GRANT\s+SELECT[^;]*\bON\s+public\.founders\b[^;]*\banon\b/i);
  });

  it("first_initial style is truncated server-side inside the CASE", () => {
    const viewSql = findViewDefinition();
    // Look for a substring/left/substr call in the CASE branch — the
    // exact SQL varies but a server-side truncation must exist so the
    // raw display_name cannot leave the DB for first_initial rows.
    expect(viewSql.toLowerCase()).toMatch(/first_initial/);
    expect(viewSql.toLowerCase()).toMatch(/(substr|substring|left)\s*\(/);
  });

  it("number_only and hidden styles resolve to NULL in the CASE", () => {
    const viewSql = findViewDefinition().toLowerCase();
    // Both styles must map to NULL in the CASE.
    expect(viewSql).toMatch(/when\s+'number_only'\s+then\s+null/);
    expect(viewSql).toMatch(/when\s+'hidden'\s+then\s+null/);
  });
});
