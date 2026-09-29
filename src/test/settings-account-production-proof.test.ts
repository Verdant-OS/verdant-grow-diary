import { describe, expect, it } from "vitest";
import {
  buildSettingsProofReceipt,
  hasCurrentSettingsAgreements,
  isOwnSettingsRead,
  readMarketingPreference,
  settingsFixtureUserId,
  SETTINGS_PROOF_CHECKS,
  type SettingsProofSample,
} from "../../e2e/lib/settingsAccountProofRules";
import { CURRENT_AGREEMENT_LIST } from "@/constants/agreements";
import {
  QUICKLOG_SMOKE_ACCOUNT_EMAIL,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
} from "../../e2e/lib/productionQuickLogFixtureRules";
import { PERFORMANCE_ORIGIN } from "../../e2e/lib/signedInPerformanceRules";

const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const sha = "a".repeat(40);
const identity = { origin: PERFORMANCE_ORIGIN, commit: sha, dirty: false as const };
const sample: SettingsProofSample = {
  operation: "browser-preferences",
  expectedSha: sha,
  accountVerified: true,
  before: identity,
  after: identity,
  checks: {
    "start-screen-reload": true,
    "temperature-reload": true,
    "temperature-reset-reload": true,
  },
  barrierPassed: true,
  blockedWrites: 0,
  applicationErrors: 0,
  elapsedMs: 10,
};
const target =
  QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/profiles?select=marketing_opt_in&user_id=eq." + owner;
const agreements = CURRENT_AGREEMENT_LIST.map((a) => ({
  agreement_type: a.type,
  version: a.version,
  effective_date: a.effectiveDate,
  accepted_at: "2026-09-01T00:00:00Z",
}));

describe("production settings proof inputs", () => {
  it("accepts only the approved fixture identity", () => {
    expect(settingsFixtureUserId({ id: owner, email: QUICKLOG_SMOKE_ACCOUNT_EMAIL })).toBe(owner);
    expect(settingsFixtureUserId({ id: owner, email: "matt@verdantgrowdiary.com" })).toBeNull();
  });
  it.each([null, undefined, [], {}, { id: "bad", email: QUICKLOG_SMOKE_ACCOUNT_EMAIL }])(
    "rejects unproved identity %j",
    (value) => {
      expect(settingsFixtureUserId(value)).toBeNull();
    },
  );
  it("accepts the own narrow profile read", () =>
    expect(isOwnSettingsRead("GET", target, owner, "profiles")).toBe(true));
  it.each(["POST", "PATCH", "DELETE", null])("never accepts mutation method %s", (method) =>
    expect(isOwnSettingsRead(method, target, owner, "profiles")).toBe(false),
  );
  it.each([
    null,
    "bad",
    target.replace(owner, "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"),
    target + "&user_id=eq." + owner,
    target.replace("select=marketing_opt_in", "select=*"),
    target.replace("https://knkwiiywfkbqznbxwqfh.supabase.co", "https://example.invalid"),
    target + "#fragment",
  ])("rejects unrelated or ambiguous read %j", (url) =>
    expect(isOwnSettingsRead("GET", url, owner, "profiles")).toBe(false),
  );
  it.each([true, false])("retains actual boolean preference %s", (value) =>
    expect(readMarketingPreference({ marketing_opt_in: value }, 200)).toBe(value),
  );
  it.each([null, undefined, {}, [], { marketing_opt_in: null }, { marketing_opt_in: "false" }])(
    "does not invent missing preference %j",
    (value) => expect(readMarketingPreference(value, 200)).toBeNull(),
  );
  it("rejects an error response even with a plausible payload", () =>
    expect(readMarketingPreference({ marketing_opt_in: true }, 500)).toBeNull());
  it("requires actual current agreement history", () => {
    expect(hasCurrentSettingsAgreements(agreements, 200)).toBe(true);
    expect(hasCurrentSettingsAgreements(agreements, 500)).toBe(false);
    expect(hasCurrentSettingsAgreements(agreements.slice(0, 1), 200)).toBe(false);
    expect(
      hasCurrentSettingsAgreements(
        agreements.map((a) => ({ ...a, version: "old" })),
        200,
      ),
    ).toBe(false);
    expect(
      hasCurrentSettingsAgreements([{ ...agreements[0], accepted_at: "bad" }, agreements[1]], 200),
    ).toBe(false);
  });
  it.each([null, undefined, {}, [], [null], [{}]])(
    "rejects unresolved or malformed agreement history %j",
    (value) => expect(hasCurrentSettingsAgreements(value, 200)).toBe(false),
  );
});

describe("finite settings proof receipts", () => {
  it.each(Object.keys(SETTINGS_PROOF_CHECKS))("requires all %s checks", (operation) => {
    const keys = SETTINGS_PROOF_CHECKS[operation as keyof typeof SETTINGS_PROOF_CHECKS];
    const input = { ...sample, operation, checks: Object.fromEntries(keys.map((k) => [k, true])) };
    expect(buildSettingsProofReceipt(input)).toMatchObject({
      status: "PASS",
      elapsedMs: 10,
      backendMutationAcceptance: "NOT_MEASURED",
    });
    expect(
      buildSettingsProofReceipt({ ...input, checks: { ...input.checks, [keys[0]]: false } }),
    ).toMatchObject({ status: "FAIL", elapsedMs: null });
  });
  it.each([
    null,
    undefined,
    [],
    {},
    { ...sample, operation: "account-delete" },
    { ...sample, accountVerified: false },
    { ...sample, expectedSha: "short" },
  ])("blocks unproved context %j", (value) =>
    expect(buildSettingsProofReceipt(value).status).toBe("BLOCKED"),
  );
  it.each([
    { ...sample, before: null },
    { ...sample, after: { ...identity, dirty: true } },
    { ...sample, after: { ...identity, commit: "b".repeat(40) } },
    { ...sample, after: { ...identity, origin: "https://example.invalid" } },
  ])("blocks unproved live identity", (value) =>
    expect(buildSettingsProofReceipt(value).status).toBe("BLOCKED"),
  );
  it.each([
    { ...sample, barrierPassed: false },
    { ...sample, blockedWrites: 1 },
    { ...sample, blockedWrites: NaN },
    { ...sample, blockedWrites: undefined },
  ])("blocks missing or failed transport barrier", (value) =>
    expect(buildSettingsProofReceipt(value).status).toBe("BLOCKED"),
  );
  it.each([null, undefined, -1, NaN, Infinity, "10"])(
    "does not invent elapsed time %j",
    (elapsedMs) =>
      expect(buildSettingsProofReceipt({ ...sample, elapsedMs })).toMatchObject({
        status: "NOT_MEASURED",
        elapsedMs: null,
      }),
  );
  it("is deterministic and never exports arbitrary account fields or error text", () => {
    const input = {
      ...sample,
      email: "private",
      access_token: "private",
      error: "private",
      checks: { ...sample.checks, private: true },
    };
    expect(buildSettingsProofReceipt(input)).toEqual(buildSettingsProofReceipt(input));
    expect(JSON.stringify(buildSettingsProofReceipt(input))).not.toContain("private");
    expect(buildSettingsProofReceipt({ ...sample, elapsedMs: 0 })).toMatchObject({
      status: "PASS",
      elapsedMs: 0,
    });
  });
  it("does not hide a browser application exception behind completed checks", () => {
    expect(buildSettingsProofReceipt({ ...sample, applicationErrors: 1 })).toMatchObject({
      status: "FAIL",
      reason: "application_runtime_error",
      elapsedMs: null,
    });
  });
  it.each([undefined, null, -1, NaN, Infinity, 0.5])(
    "requires an actual runtime error observation %j",
    (applicationErrors) => {
      expect(buildSettingsProofReceipt({ ...sample, applicationErrors }).status).toBe("BLOCKED");
    },
  );
});
