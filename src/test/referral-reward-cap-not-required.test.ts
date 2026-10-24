/**
 * Codex P1 4263480448: REQUIRED_MONEY_MIGRATIONS is what the push-triggered
 * sandbox applied-check probes. The referrer cap migrations stay known
 * (the filename is money-adjacent) and stay off that required list.
 */
import { describe, expect, it } from "vitest";
import {
  KNOWN_MONEY_MIGRATIONS,
  REQUIRED_MONEY_MIGRATIONS,
} from "../../scripts/required-money-migrations.mjs";

const CAP_MIGRATIONS = [
  "20261003020000_referral_referrer_monthly_cap.sql",
  "20261014010000_referral_cap_counts_deleted_referees.sql",
];

describe("referral cap registry", () => {
  it("keeps the cap migrations known without arming the push sandbox probe", () => {
    for (const file of CAP_MIGRATIONS) {
      expect(KNOWN_MONEY_MIGRATIONS.has(file)).toBe(true);
      expect(REQUIRED_MONEY_MIGRATIONS).not.toContain(file);
    }
  });
});
