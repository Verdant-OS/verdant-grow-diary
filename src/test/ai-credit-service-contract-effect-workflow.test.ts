import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const WORKFLOW = readFileSync(
  resolve(ROOT, ".github", "workflows", "ai-credit-service-contract-effect.yml"),
  "utf8",
).replace(/\r\n/g, "\n");
const TRIGGERS = WORKFLOW.slice(0, WORKFLOW.indexOf("\npermissions:"));

describe("AI-credit service contract effect workflow trust boundary", () => {
  it("runs as a separate scheduled/manual production monitor after migration presence", () => {
    expect(WORKFLOW).toContain('cron: "0 8 * * *"');
    expect(WORKFLOW).toContain("workflow_dispatch: {}");
    expect(WORKFLOW).toContain("scripts/verify-ai-credit-service-contract-effect.mjs");
    expect(WORKFLOW).not.toContain("scripts/assert-required-money-migrations-applied.mjs");
  });

  it("pins all database access to the deploy branch and production environment", () => {
    expect(WORKFLOW).toContain("if: github.ref == 'refs/heads/verdant-grow-diary'");
    expect(WORKFLOW).toContain("environment: verdant-production");
    expect(WORKFLOW).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(WORKFLOW).not.toContain("SUPABASE_DB_URL_LIVE");
    expect(WORKFLOW).not.toContain("SUPABASE_DB_URL_SANDBOX");
    expect(TRIGGERS).not.toContain("pull_request");
  });

  it("clears ambient libpq fallbacks and bounds the read-only verifier", () => {
    for (const variable of [
      "DATABASE_URL",
      "PGDATABASE",
      "PGHOST",
      "PGPASSWORD",
      "PGPORT",
      "PGSERVICE",
      "PGSERVICEFILE",
      "PGUSER",
    ]) {
      expect(WORKFLOW).toMatch(new RegExp(`\\n\\s+${variable}: ""`));
    }
    expect(WORKFLOW).toContain("timeout-minutes: 5");
    expect(WORKFLOW).toContain('PGCONNECT_TIMEOUT: "15"');
  });

  it("preserves all five statuses through audit, summary, and issue reconciliation", () => {
    for (const status of [
      "migration_applied",
      "contract_effective",
      "definition_drift_detected",
      "sibling_overloads_detected",
      "verification_blocked",
    ]) {
      expect(WORKFLOW.match(new RegExp(status, "g"))?.length ?? 0).toBeGreaterThanOrEqual(4);
    }
    expect(WORKFLOW).toContain("if-no-files-found: error");
    expect(WORKFLOW).toContain("Raw function bodies and connection material are not persisted");
  });

  it("only closes an alert after every independent healthy condition is proven", () => {
    expect(WORKFLOW).toContain("statuses.migration_applied === true");
    expect(WORKFLOW).toContain("statuses.contract_effective === true");
    expect(WORKFLOW).toContain("statuses.definition_drift_detected === false");
    expect(WORKFLOW).toContain("statuses.sibling_overloads_detected === false");
    expect(WORKFLOW).toContain("statuses.verification_blocked === false");
    expect(WORKFLOW).toContain('state: "closed"');
  });
});
