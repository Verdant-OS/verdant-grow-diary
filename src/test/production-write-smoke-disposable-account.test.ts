/**
 * Grower bug item 20: test tents and grows had accumulated in a real grower
 * account. The production Quick Log write smoke was pinned to the owner's own
 * account; docs/production-only-verification-runbook.md:8 requires a disposable
 * test account and never the owner's accounts. These pin the refusal.
 */
import { describe, expect, it } from "vitest";
import {
  PERSONAL_ACCOUNT_EMAILS,
  resolveProductionWriteAccount,
  validateProductionFixtureTarget,
  validateProductionQuickLogEnv,
  type ProductionFixtureEvidence,
} from "../../e2e/lib/productionQuickLogFixtureRules";

const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const plantId = "11111111-1111-4111-8111-111111111111";
const tentId = "33333333-3333-4333-8333-333333333333";
const growId = "44444444-4444-4444-8444-444444444444";
const fixtureAccount = "e2e-fixture@verdant-test.invalid";
const baseEnv = {
  E2E_FIXTURE_MODE: "true",
  E2E_GROW_1_PLANT_URL: `https://verdantgrowdiary.com/plants/${plantId}`,
  E2E_FIXTURE_EXPECTED_GROW_NAME: "QA Test Grow",
  E2E_FIXTURE_EXPECTED_TENT_NAME: "E2E Test Tent",
  E2E_FIXTURE_EXPECTED_PLANT_NAME: "E2E Test Plant",
};
const target = { plantId, tentId, growId };
const names = { grow: "QA Test Grow", tent: "E2E Test Tent", plant: "E2E Test Plant" };

function evidence(email: string): ProductionFixtureEvidence {
  return {
    identity: { id: owner, email },
    invalidated: false,
    plants: [
      {
        id: plantId,
        user_id: owner,
        name: names.plant,
        is_archived: false,
        tent_id: tentId,
        grow_id: growId,
      },
    ],
    tents: [{ id: tentId, user_id: owner, name: names.tent, is_archived: false, grow_id: growId }],
    grows: [{ id: growId, user_id: owner, name: names.grow, is_archived: false }],
  };
}

describe("production write smoke account (item 20)", () => {
  it("requires a disposable account to be configured", () => {
    const result = validateProductionQuickLogEnv(baseEnv);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("disposable_account_required");
  });

  it.each(PERSONAL_ACCOUNT_EMAILS)("refuses the owner's personal account %s", (email) => {
    for (const hint of [email, email.toUpperCase(), `  ${email} `]) {
      const result = validateProductionQuickLogEnv({
        ...baseEnv,
        E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: hint,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("personal_account_refused");
    }
    expect(resolveProductionWriteAccount(email)).toBeNull();
  });

  it("refuses a malformed account", () => {
    const result = validateProductionQuickLogEnv({
      ...baseEnv,
      E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: "not-an-email",
    });
    expect(result.errors).toContain("disposable_account_invalid");
  });

  it("accepts a disposable account and carries it to the ownership check", () => {
    const result = validateProductionQuickLogEnv({
      ...baseEnv,
      E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: ` ${fixtureAccount.toUpperCase()} `,
    });
    expect(result).toMatchObject({ ok: true, errors: [] });
    expect(
      validateProductionFixtureTarget(evidence(fixtureAccount), target, result.expected),
    ).toEqual({ ok: true, errors: [] });
  });

  it("refuses to write when the signed-in server account is the owner's, even with a disposable account configured", () => {
    const { expected } = validateProductionQuickLogEnv({
      ...baseEnv,
      E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: fixtureAccount,
    });
    for (const email of PERSONAL_ACCOUNT_EMAILS) {
      expect(validateProductionFixtureTarget(evidence(email), target, expected).errors).toContain(
        "approved_server_account_required",
      );
    }
  });

  it("refuses the ownership check when no account was configured", () => {
    expect(
      validateProductionFixtureTarget(evidence(fixtureAccount), target, names).errors,
    ).toContain("approved_server_account_required");
  });
});
