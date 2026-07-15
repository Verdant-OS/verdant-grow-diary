import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HANDOFF = readFileSync(
  resolve(process.cwd(), "docs/releases/subscriber-growth-publication-handoff.md"),
  "utf8",
);

const MIGRATIONS = [
  "20260714190000_restore_public_lead_insert_only.sql",
  "20260714193000_subscriber_growth_operator_snapshot.sql",
  "20260714231627_signup_acquisition_attribution.sql",
  "20260715002000_signup_to_paid_operator_snapshot.sql",
] as const;

describe("subscriber growth publication handoff", () => {
  it("pins the complete ordered database contract and linked dry run", () => {
    expect(HANDOFF).toContain("migration list --linked");
    expect(HANDOFF).toContain("db push --linked --dry-run");

    let previous = -1;
    for (const migration of MIGRATIONS) {
      const index = HANDOFF.indexOf(migration);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it("requires local and identified live gates without implying authorization", () => {
    expect(HANDOFF).toContain("release:subscriber-growth:gate:local");
    expect(HANDOFF).toContain("release:subscriber-growth:gate`");
    expect(HANDOFF).toContain("LIVE_VERIFIED");
    expect(HANDOFF).toMatch(/authorizes nothing/i);
    expect(HANDOFF).toMatch(/evidence only.*not deployment authorization/i);
  });

  it("documents the exact no-function deployment boundary and manual outreach fence", () => {
    expect(HANDOFF).toMatch(/no changed Supabase Edge Function sources/i);
    expect(HANDOFF).toMatch(/Do \*\*not\*\* deploy an Edge Function/i);
    expect(HANDOFF).toMatch(/no automatic outreach/i);
    expect(HANDOFF).toMatch(/Log outreach manually after it is actually sent/i);
  });

  it("keeps subscriber truth and rollback fail-closed", () => {
    expect(HANDOFF).toMatch(/only active rows in `billing_subscriptions` count/i);
    expect(HANDOFF).toMatch(
      /Do not claim progress\s+toward 101 from account, lead, click, or activity counts/i,
    );
    expect(HANDOFF).toMatch(/forward migration/i);
    expect(HANDOFF).toMatch(/rollback invalidates the prior live receipt/i);
    expect(HANDOFF).not.toContain("profiles.tier");
  });
});
