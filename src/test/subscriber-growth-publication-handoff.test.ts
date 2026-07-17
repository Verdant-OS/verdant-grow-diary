import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HANDOFF = readFileSync(
  resolve(process.cwd(), "docs/releases/subscriber-growth-publication-handoff.md"),
  "utf8",
);
const LAUNCH_RUNBOOK = readFileSync(
  resolve(process.cwd(), "docs/releases/subscriber-growth-launch-runbook.md"),
  "utf8",
);
const GAMIFICATION_TIER_REFERENCE = ["profiles", "tier"].join(".");

const MIGRATIONS = [
  "20260714190000_restore_public_lead_insert_only.sql",
  "20260714193000_subscriber_growth_operator_snapshot.sql",
  "20260714231627_signup_acquisition_attribution.sql",
  "20260715002000_signup_to_paid_operator_snapshot.sql",
  "20260717010000_paid_return_cohort_measurement.sql",
] as const;

describe("subscriber growth publication handoff", () => {
  it("pins the complete ordered database contract and linked dry run in both release docs", () => {
    for (const document of [HANDOFF, LAUNCH_RUNBOOK]) {
      expect(document).toContain("migration list --linked");
      expect(document).toContain("db push --linked --dry-run");

      let previous = -1;
      for (const migration of MIGRATIONS) {
        const index = document.indexOf(migration);
        expect(index).toBeGreaterThan(previous);
        previous = index;
      }
    }
  });

  it("requires local and identified live gates without implying authorization", () => {
    expect(HANDOFF).toContain("release:subscriber-growth:gate:local");
    expect(HANDOFF).toContain("release:subscriber-growth:gate --");
    expect(HANDOFF).toContain("--base-ref=<release-base-commit>");
    expect(HANDOFF).toContain("--release-head=<release-head-commit>");
    expect(LAUNCH_RUNBOOK).toContain("--base-ref=<release-base-commit>");
    expect(LAUNCH_RUNBOOK).toContain("--release-head=<release-head-commit>");
    expect(HANDOFF).toContain("<release-head-commit>");
    expect(LAUNCH_RUNBOOK).toContain("git checkout --detach <release-head-commit>");
    expect(LAUNCH_RUNBOOK).toMatch(/first parent is `<release-base-commit>`/i);
    expect(LAUNCH_RUNBOOK).toMatch(/zero-file diff[\s\S]*HOLD/i);
    expect(HANDOFF).toContain("LIVE_VERIFIED");
    expect(HANDOFF).toMatch(/authorizes nothing/i);
    expect(HANDOFF).toMatch(/evidence only.*not deployment authorization/i);
    expect(LAUNCH_RUNBOOK).toContain("launch-gate.v2.json");
    expect(LAUNCH_RUNBOOK).toMatch(/v1 receipt[\s\S]*cannot support a `LIVE_VERIFIED`/i);
  });

  it("documents the exact reviewed-function deployment boundary and manual outreach fence", () => {
    expect(HANDOFF).toContain("`ai-doctor-review`");
    expect(HANDOFF).toMatch(/do not\s+redeploy unrelated functions/i);
    expect(HANDOFF).toMatch(/source parity alone does not prove[\s\S]*deployed/i);
    expect(HANDOFF).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(LAUNCH_RUNBOOK).toContain("`ai-doctor-review`");
    expect(LAUNCH_RUNBOOK).toMatch(/Do not deploy unrelated Edge Functions/i);
    expect(HANDOFF).not.toMatch(/no changed Supabase Edge Function sources/i);
    expect(HANDOFF).not.toMatch(/Do \*\*not\*\* deploy an Edge Function/i);
    expect(HANDOFF).toMatch(/no automatic outreach/i);
    expect(HANDOFF).toMatch(/Log outreach manually after it is actually sent/i);
  });

  it("requires authenticated, secret-safe backend verification before live verification", () => {
    for (const document of [HANDOFF, LAUNCH_RUNBOOK]) {
      expect(document).toMatch(/authenticated[\s\S]*Supabase/i);
      expect(document).toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
    expect(LAUNCH_RUNBOOK).toMatch(/It never prints or stores secret values/i);
    expect(HANDOFF).toMatch(/It never logs secret\s+values/i);
    expect(LAUNCH_RUNBOOK).toMatch(/downloaded remote `ai-doctor-review` source/i);
    expect(LAUNCH_RUNBOOK).toMatch(/Downloaded source exists only in a temporary directory/i);
    expect(HANDOFF).toMatch(/downloaded function source parity plus recorder markers/i);
    expect(HANDOFF).toMatch(/does not\s+validate or expose the secret value/i);
  });

  it("keeps subscriber truth and rollback fail-closed", () => {
    expect(HANDOFF).toMatch(/only active, in-period rows from the server-written billing/i);
    expect(HANDOFF).toContain("incumbent `billing_subscriptions`");
    expect(HANDOFF).toContain("live-environment `subscriptions`");
    expect(HANDOFF).toMatch(/deduplicates users across both/i);
    expect(HANDOFF).toMatch(
      /Do not claim progress\s+toward 101 from account, lead, click, or activity counts/i,
    );
    expect(HANDOFF).toMatch(/forward migration/i);
    expect(HANDOFF).toMatch(/rollback invalidates the prior live receipt/i);
    expect(HANDOFF).not.toContain(GAMIFICATION_TIER_REFERENCE);
  });
});
