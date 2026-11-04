/**
 * Migration 20261101180000 stays in history unchanged (AGENTS.md section 5)
 * after the PR #2702 Stripe lane was retired (#2811). It must stay known to
 * the money firewall and must never become a required production apply.
 * Kept from the retired stripe-test-mode-migration test (review 5760749999 P2-1).
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KNOWN_MONEY_MIGRATIONS,
  REQUIRED_MONEY_MIGRATIONS,
} from "../../scripts/required-money-migrations.mjs";

const MIGRATION = "20261101180000_stripe_test_mode_subscription_sink.sql";

describe("retired Stripe test-mode migration firewall", () => {
  it("is known to the money firewall and is not a required production apply", () => {
    expect(KNOWN_MONEY_MIGRATIONS.has(MIGRATION)).toBe(true);
    expect(REQUIRED_MONEY_MIGRATIONS).not.toContain(MIGRATION);
  });

  it("stays in migration history", () => {
    expect(existsSync(`supabase/migrations/${MIGRATION}`)).toBe(true);
  });
});
