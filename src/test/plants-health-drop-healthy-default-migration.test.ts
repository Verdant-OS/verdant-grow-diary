/**
 * QA #1989: a new migration drops the plants.health default of 'healthy'.
 * Existing rows are not rewritten. The earlier 20260924120000 file stays as-is.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20261015161000_plants_health_drop_healthy_default.sql";
const PRIOR_MIGRATION = "20260924120000";

function executableSql(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("plants.health drop healthy default", () => {
  // @source-scan-justified: a SQL migration has no resolvable value in vitest.
  const sql = executableSql(MIGRATION);

  it("drops NOT NULL and the column default, and does not backfill existing rows", () => {
    expect(sql).toMatch(/ALTER TABLE public\.plants ALTER COLUMN health DROP NOT NULL;/);
    expect(sql).toMatch(/ALTER TABLE public\.plants ALTER COLUMN health DROP DEFAULT;/);
    expect(sql).not.toMatch(/SET DEFAULT 'healthy'/);
    expect(sql).not.toMatch(/UPDATE\s+public\.plants/i);
  });

  it("documents both unassessed representations, NULL and the explicit 'unknown', in the column comment", () => {
    const comment = sql.match(/COMMENT ON COLUMN public\.plants\.health IS\s*'((?:[^']|'')*)';/);
    expect(comment).not.toBeNull();
    const text = comment![1];
    expect(text).toMatch(/healthy \| watch \| issue/);
    expect(text).toMatch(/\bNULL\b/);
    expect(text).toMatch(/\bunknown\b/);
    expect(text).not.toMatch(/NULL means not assessed\./);
    expect(text).toMatch(/There is no default\./);
    expect(text).toMatch(/Never derived from sensors or AI\./);
  });

  it("requires 20260924120000 to be delivered first and does not advertise the reverse order", () => {
    const raw = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
    const thisVersion = MIGRATION.split("/").pop()!.slice(0, 14);
    expect(PRIOR_MIGRATION < thisVersion).toBe(true);
    expect(raw).not.toMatch(/either side/i);
    expect(raw).toMatch(/Deliver 20260924120000 first/);
    expect(raw).toMatch(/reverse\n-- order is not supported/);
    expect(sql).toMatch(
      /plants_health_drop_healthy_default requires 20260924120000 to be delivered first/,
    );
    expect(sql).toMatch(/health_column\.attnotnull/);
    expect(sql).toMatch(/'''unknown''::text/);
    expect(sql).toMatch(/validate_fn\.prosrc LIKE '%''unknown''%'/);
    expect(sql.indexOf("requires 20260924120000")).toBeLessThan(sql.indexOf("DROP NOT NULL"));
    expect(sql.indexOf("requires 20260924120000")).toBeLessThan(sql.indexOf("DROP DEFAULT"));
  });
});
