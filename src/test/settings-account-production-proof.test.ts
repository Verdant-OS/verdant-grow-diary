import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
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

describe("Settings proof workflow on the deploy branch", () => {
  type Step = {
    name?: string;
    run?: string;
    env?: Record<string, string>;
    with?: Record<string, unknown>;
  };
  type Job = {
    if?: string;
    "timeout-minutes": number;
    env?: Record<string, string>;
    steps: Step[];
  };
  const workflow = load(
    readFileSync(".github/workflows/settings-account-consent-proof.yml", "utf8"),
  ) as {
    jobs: Record<string, Job>;
  };
  const job = workflow.jobs["settings-account-consent-proof"];
  const safety = workflow.jobs["settings-account-consent-proof-safety-regressions"];
  const index = (name: string) => job.steps.findIndex((step) => step.name === name);
  const usesSecrets = (value: unknown) => JSON.stringify(value ?? {}).includes("secrets.");

  it("runs the credentialed proof only from the protected deploy ref and owner", () => {
    for (const guard of [
      "github.repository == 'Verdant-OS/verdant-grow-diary'",
      "github.ref == 'refs/heads/verdant-grow-diary'",
      "github.actor == 'cheekhimself'",
      "github.triggering_actor == 'cheekhimself'",
      "github.run_attempt == '1'",
      "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
    ])
      expect(job.if).toContain(guard);
    // A branch name is not trust: no pull_request path may reach the login.
    expect(job.if).not.toContain("pull_request");
    expect(job.if).not.toContain("head_ref");
  });

  it("keeps fixture credentials out of PR code and scoped to the login steps", () => {
    expect(safety.if).toBeUndefined();
    expect(usesSecrets(safety)).toBe(false);
    expect(usesSecrets(job.env)).toBe(false);
    expect(job.steps.filter((step) => usesSecrets(step)).map((step) => step.name)).toEqual([
      "Verify production fixture configuration",
      "Measure settings/account/consent on production",
    ]);
  });

  it("measures after deploy pushes that change the measured product", () => {
    const triggers = load(
      readFileSync(".github/workflows/settings-account-consent-proof.yml", "utf8"),
    ) as {
      on: { push: { branches: string[]; paths: string[] } };
    };
    expect(triggers.on.push.branches).toEqual(["verdant-grow-diary"]);
    for (const input of ["src/**", "public/**", "vite.config.ts", "package.json", "bun.lock"])
      expect(triggers.on.push.paths).toContain(input);
    expect(triggers.on.push.paths).toContain(
      ".github/workflows/settings-account-consent-proof.yml",
    );
  });

  it("pins the checked-out deploy SHA and waits for it to be live before measuring", () => {
    expect(job.steps[index("Checkout proof source")].with?.ref).toBe("${{ github.sha }}");
    const pin = job.steps[index("Pin current deploy SHA")].run ?? "";
    expect(pin).toContain('expected_sha="$(git rev-parse HEAD)"');
    expect(pin).toContain('[ "$expected_sha" = "$GITHUB_SHA" ]');
    expect(pin).not.toContain("git fetch");
    const wait = index("Wait for the pinned SHA to be live");
    expect(wait).toBeGreaterThan(index("Pin current deploy SHA"));
    expect(wait).toBeLessThan(index("Measure settings/account/consent on production"));
    expect(job.steps[wait].run).toBe("node scripts/wait-for-deployed-sha.mjs");
    // The wait is bounded at 20 minutes by default; the job must outlast it.
    expect(job["timeout-minutes"]).toBeGreaterThanOrEqual(40);
  });
});
