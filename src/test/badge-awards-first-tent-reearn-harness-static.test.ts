import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const HARNESS = readProjectFile("supabase/tests/badge_awards_first_tent_reearn.sql");
const MIGRATION = readProjectFile(
  "supabase/migrations/20261027235500_badge_awards_tent_setup_harvest.sql",
);

describe("First Tent re-earn pgTAP harness (Cut 001 AC6)", () => {
  it("is a rollback-only local database harness", () => {
    expect(HARNESS).toContain("BEGIN;");
    expect(HARNESS).toContain("ROLLBACK;");
    expect(HARNESS).toContain("Local or disposable database only");
    expect(HARNESS).not.toContain("COMMIT;");
  });

  it("pins delete → hidden → restored with the same award row and evidence follow", () => {
    expect(HARNESS).toContain("badge_awards_evaluate_owner('first_tent')");
    expect(HARNESS).toContain("status' = 'qualified'");
    expect(HARNESS).toContain("status' = 'hidden'");
    expect(HARNESS).toContain("status' = 'unchanged'");
    expect(HARNESS).toContain("status' = 'restored'");
    expect(HARNESS).toContain("earning again reuses the award row");
    expect(HARNESS).toContain("first_recognized_at keeps the original earn time");
    expect(HARNESS).toContain("evidence points at the new tent");
    expect(HARNESS).toContain("a swap between evaluations keeps First Tent");
    expect(HARNESS).toContain("one First Tent row per account");
  });

  it("matches the migration evaluator contract for restore and evidence refresh", () => {
    expect(MIGRATION).toContain("'restored'");
    expect(MIGRATION).toContain("restored_at = clock_timestamp()");
    expect(MIGRATION).toContain(
      "The account's earliest tent, not the earliest tent that has a photo.",
    );
    expect(MIGRATION).toContain("evidence_changed_at = clock_timestamp()");
  });
});
