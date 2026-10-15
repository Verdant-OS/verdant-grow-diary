/**
 * QA #1989: a new migration drops the plants.health default of 'healthy'.
 * Existing rows are not rewritten. The earlier 20260924120000 file stays as-is.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20261015161000_plants_health_drop_healthy_default.sql";

function executableSql(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("plants.health drop healthy default", () => {
  // @source-scan-justified: a SQL migration has no resolvable value in vitest.
  const sql = executableSql(MIGRATION);

  it("drops the column default and does not backfill existing rows", () => {
    expect(sql).toMatch(/ALTER TABLE public\.plants ALTER COLUMN health DROP DEFAULT;/);
    expect(sql).not.toMatch(/SET DEFAULT 'healthy'/);
    expect(sql).not.toMatch(/UPDATE\s+public\.plants/i);
  });
});
