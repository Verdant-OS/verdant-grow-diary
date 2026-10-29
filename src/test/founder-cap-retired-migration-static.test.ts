import { describe, expect, it } from "vitest";
import {
  KNOWN_MONEY_MIGRATIONS,
  REQUIRED_MONEY_MIGRATIONS,
} from "../../scripts/required-money-migrations.mjs";

// Manifest contract only. The migration's behaviour (grant past 100 seats, no
// Wall seat beyond the cap, cap-skipped events reopened for replay, the counter
// RPC dropped) is proven against a real PostgreSQL replay in
// src/test/founder-refund-grant-concurrency.test.ts, not by matching SQL text.
const MIGRATION = "20261029030000_founder_cap_retired.sql";
const PRIOR_SERIALIZATION = "20260915193000_founder_refund_grant_serialization.sql";

describe("founder cap retired migration (PR B)", () => {
  it("sorts after the refund/grant serialization migration whose cap refusal it replaces", () => {
    expect(MIGRATION.localeCompare(PRIOR_SERIALIZATION)).toBeGreaterThan(0);
    expect(REQUIRED_MONEY_MIGRATIONS.indexOf(MIGRATION)).toBeGreaterThan(
      REQUIRED_MONEY_MIGRATIONS.indexOf(PRIOR_SERIALIZATION),
    );
  });

  it("is deploy-required so the live applied check reports it until the operator applies it", () => {
    expect(REQUIRED_MONEY_MIGRATIONS).toContain(MIGRATION);
    expect(KNOWN_MONEY_MIGRATIONS.has(MIGRATION)).toBe(true);
  });
});
