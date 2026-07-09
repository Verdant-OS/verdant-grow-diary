/**
 * Server-side Pheno Tracker entitlement enforcement — static safety scan.
 *
 * Guards the invariants for the server-side Pro gate on pheno writes:
 *   1. A migration adds `has_pheno_tracker_entitlement(uuid)` and RESTRICTIVE
 *      RLS policies on every pheno_* write table.
 *   2. The Edge helper returns a sanitized error and never leaks provider IDs
 *      or service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const PHENO_WRITE_TABLES = [
  "pheno_hunts",
  "pheno_candidate_scores",
  "pheno_keeper_decisions",
  "pheno_keeper_decisions_log",
  "pheno_keepers",
  "pheno_keeper_clones",
  "pheno_crosses",
  "pheno_score_rounds",
  "pheno_sex_observations",
  "pheno_smoke_tests",
  "pheno_lab_results",
  "pheno_reversals",
  "pheno_stress_observations",
];

function readAllMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

describe("pheno tracker server-side entitlement enforcement", () => {
  const migrations = readAllMigrations();

  it("declares the has_pheno_tracker_entitlement SECURITY DEFINER function", () => {
    expect(migrations).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.has_pheno_tracker_entitlement/i,
    );
    expect(migrations).toMatch(/SECURITY DEFINER/);
    expect(migrations).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.has_pheno_tracker_entitlement[^;]*\banon\b/i,
    );
  });

  it("names RESTRICTIVE pro-required policies for every pheno_* write table", () => {
    for (const t of PHENO_WRITE_TABLES) {
      expect(migrations, `${t} insert policy name`).toContain(
        `${t}_pro_required_insert`,
      );
      expect(migrations, `${t} update policy name`).toContain(
        `${t}_pro_required_update`,
      );
      expect(migrations, `${t} delete policy name`).toContain(
        `${t}_pro_required_delete`,
      );
    }
    // Every table is enumerated in the migration DO block.
    expect(migrations).toMatch(/AS RESTRICTIVE FOR INSERT[\s\S]*?has_pheno_tracker_entitlement/);
    expect(migrations).toMatch(/AS RESTRICTIVE FOR UPDATE[\s\S]*?has_pheno_tracker_entitlement/);
    expect(migrations).toMatch(/AS RESTRICTIVE FOR DELETE[\s\S]*?has_pheno_tracker_entitlement/);
  });

  it("edge helper returns sanitized error only", () => {
    const helper = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "functions",
        "_shared",
        "assertPhenoTrackerEntitlement.ts",
      ),
      "utf8",
    );
    expect(helper).toContain("pheno_tracker_pro_required");
    for (const forbidden of [
      "paddle_subscription_id",
      "provider_subscription_id",
      "paddle_customer_id",
      "provider_customer_id",
      "SUPABASE_SERVICE_ROLE_KEY",
      "service_role",
    ]) {
      expect(helper, `helper must not reference ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});
