import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const currentRun = {
  id: 987654321,
  run_attempt: 1,
  event: "workflow_dispatch",
  path: ".github/workflows/apply-signup-acquisition-forward-repair.yml",
  head_branch: "verdant-grow-diary",
  head_sha: "a".repeat(40),
  repository: { id: 123456789, full_name: "Verdant-OS/verdant-grow-diary" },
  head_repository: { id: 123456789, full_name: "Verdant-OS/verdant-grow-diary" },
  actor: { id: 72639960, login: "cheekhimself" },
  triggering_actor: { id: 72639960, login: "cheekhimself" },
};

const approvals = [
  {
    state: "approved",
    environments: [{ name: "verdant-production-solo-founder" }],
    user: { id: 72639960, login: "cheekhimself" },
  },
];

const environment = {
  name: "verdant-production-solo-founder",
  can_admins_bypass: false,
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
  protection_rules: [
    {
      type: "required_reviewers",
      prevent_self_review: false,
      reviewers: [{ type: "User", reviewer: { id: 72639960, login: "cheekhimself" } }],
    },
    { type: "branch_policy" },
  ],
};

const branchPolicies = {
  total_count: 1,
  branch_policies: [{ name: "verdant-grow-diary", type: "branch" }],
};

const acknowledgement = "I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN";
const expected = {
  repositoryId: 123456789,
  repositoryFullName: "Verdant-OS/verdant-grow-diary",
  runId: 987654321,
  runAttempt: 1,
  sha: "a".repeat(40),
  actorId: 72639960,
  actorLogin: "cheekhimself",
  triggeringActorId: 72639960,
  triggeringActorLogin: "cheekhimself",
  workflowPath: ".github/workflows/apply-signup-acquisition-forward-repair.yml",
  acknowledgement,
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function validInput() {
  return {
    currentRun: clone(currentRun),
    approvals: clone(approvals),
    environment: clone(environment),
    branchPolicies: clone(branchPolicies),
    expected: clone(expected),
  };
}

type RequiredReviewerRule = {
  type: string;
  prevent_self_review: boolean;
  reviewers: Array<{ type: string; reviewer: { id: number; login: string } }>;
};

function requiredReviewerRule(input: ReturnType<typeof validInput>): RequiredReviewerRule {
  const rule = input.environment.protection_rules.find(
    (candidate) => candidate.type === "required_reviewers",
  );
  if (
    !rule ||
    !("reviewers" in rule) ||
    !Array.isArray(rule.reviewers) ||
    typeof rule.prevent_self_review !== "boolean"
  ) {
    throw new Error("required reviewer fixture missing");
  }
  return rule;
}

function soleReviewer(input: ReturnType<typeof validInput>) {
  const reviewer = requiredReviewerRule(input).reviewers[0];
  if (!reviewer) throw new Error("sole reviewer fixture missing");
  return reviewer;
}

function singleBranchPolicy(input: ReturnType<typeof validInput>) {
  const policy = input.branchPolicies.branch_policies[0];
  if (!policy) throw new Error("branch policy fixture missing");
  return policy;
}

function singleApproval(input: ReturnType<typeof validInput>) {
  const approval = input.approvals[0];
  if (!approval) throw new Error("approval fixture missing");
  return approval;
}

async function loadValidator() {
  return import("../../scripts/lib/solo-founder-production-authorization.mjs");
}

async function loadRunner() {
  return import("../../scripts/verify-solo-founder-production-authorization.mjs");
}

describe("solo-founder production authorization", () => {
  it("returns the exact frozen evidence for the sole founder's exact reviewed run", async () => {
    const { SOLO_FOUNDER_POLICY, validateSoloFounderProductionAuthorization } =
      await loadValidator();

    expect(SOLO_FOUNDER_POLICY).toEqual({
      deliveryMode: "solo_founder_self_review_v1",
      founderUserId: 72639960,
      founderLogin: "cheekhimself",
      environmentName: "verdant-production-solo-founder",
      branchName: "verdant-grow-diary",
      acknowledgement,
      minimumReviewSeconds: 900,
      maximumReviewSeconds: 86400,
    });
    expect(Object.isFrozen(SOLO_FOUNDER_POLICY)).toBe(true);

    const evidence = validateSoloFounderProductionAuthorization(validInput());
    expect(evidence).toEqual({
      deliveryMode: "solo_founder_self_review_v1",
      founderUserId: 72639960,
      founderLogin: "cheekhimself",
      environmentName: "verdant-production-solo-founder",
      acknowledgementVerified: true,
      environmentContractVerified: true,
      environmentApprovalVerified: true,
      minimumReviewSeconds: 900,
      maximumReviewSeconds: 86400,
    });
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it("accepts only the committed workflow path or its exact checked-out suffix", async () => {
    const { validateSoloFounderProductionAuthorization } = await loadValidator();
    const input = validInput();
    input.currentRun.path = `${expected.workflowPath}@verdant-grow-diary`;
    expect(validateSoloFounderProductionAuthorization(input)).toMatchObject({
      acknowledgementVerified: true,
    });
  });

  it.each([
    [
      "missing actor",
      (input: ReturnType<typeof validInput>) => (input.currentRun.actor = undefined as never),
    ],
    ["wrong actor", (input: ReturnType<typeof validInput>) => (input.currentRun.actor.id = 1)],
    [
      "missing triggering actor",
      (input: ReturnType<typeof validInput>) =>
        (input.currentRun.triggering_actor = undefined as never),
    ],
    [
      "wrong triggering actor",
      (input: ReturnType<typeof validInput>) => (input.currentRun.triggering_actor.id = 1),
    ],
    [
      "wrong triggering actor login",
      (input: ReturnType<typeof validInput>) => (input.currentRun.triggering_actor.login = "other"),
    ],
    [
      "wrong actor login",
      (input: ReturnType<typeof validInput>) => (input.currentRun.actor.login = "other"),
    ],
    [
      "wrong repository",
      (input: ReturnType<typeof validInput>) => (input.currentRun.repository.id = 1),
    ],
    [
      "wrong repository name",
      (input: ReturnType<typeof validInput>) =>
        (input.currentRun.repository.full_name = "Verdant-OS/other"),
    ],
    [
      "missing head repository",
      (input: ReturnType<typeof validInput>) =>
        (input.currentRun.head_repository = undefined as never),
    ],
    [
      "wrong head repository",
      (input: ReturnType<typeof validInput>) => (input.currentRun.head_repository.id = 1),
    ],
    ["wrong run id", (input: ReturnType<typeof validInput>) => (input.currentRun.id = 1)],
    [
      "wrong SHA",
      (input: ReturnType<typeof validInput>) => (input.currentRun.head_sha = "b".repeat(40)),
    ],
    [
      "wrong branch",
      (input: ReturnType<typeof validInput>) => (input.currentRun.head_branch = "main"),
    ],
    [
      "wrong workflow path",
      (input: ReturnType<typeof validInput>) =>
        (input.currentRun.path = ".github/workflows/other.yml"),
    ],
    ["wrong event", (input: ReturnType<typeof validInput>) => (input.currentRun.event = "push")],
    [
      "wrong acknowledgement",
      (input: ReturnType<typeof validInput>) => (input.expected.acknowledgement = "no"),
    ],
    [
      "whitespace-padded acknowledgement",
      (input: ReturnType<typeof validInput>) =>
        (input.expected.acknowledgement = `${acknowledgement} `),
    ],
    [
      "non-first run attempt",
      (input: ReturnType<typeof validInput>) => (input.currentRun.run_attempt = 2),
    ],
  ])("fails closed for %s", async (_label, mutate) => {
    const { validateSoloFounderProductionAuthorization } = await loadValidator();
    const input = validInput();
    mutate(input);
    expect(() => validateSoloFounderProductionAuthorization(input)).toThrow(
      "solo_founder_authorization_rejected",
    );
  });

  it.each([
    [
      "current run",
      (input: ReturnType<typeof validInput>) => Object.assign(input.currentRun, { extra: true }),
    ],
    [
      "repository",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(input.currentRun.repository, { extra: true }),
    ],
    [
      "head repository",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(input.currentRun.head_repository, { extra: true }),
    ],
    [
      "actor",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(input.currentRun.actor, { extra: true }),
    ],
    [
      "triggering actor",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(input.currentRun.triggering_actor, { extra: true }),
    ],
    [
      "environment",
      (input: ReturnType<typeof validInput>) => Object.assign(input.environment, { extra: true }),
    ],
    [
      "deployment branch policy",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(input.environment.deployment_branch_policy, { extra: true }),
    ],
    [
      "required-reviewer rule",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(requiredReviewerRule(input), { extra: true }),
    ],
    [
      "reviewer wrapper",
      (input: ReturnType<typeof validInput>) => Object.assign(soleReviewer(input), { extra: true }),
    ],
    [
      "reviewer identity",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(soleReviewer(input).reviewer, { extra: true }),
    ],
    [
      "branch policies response",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(input.branchPolicies, { extra: true }),
    ],
    [
      "branch policy",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(singleBranchPolicy(input), { extra: true }),
    ],
    [
      "approval",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(singleApproval(input), { extra: true }),
    ],
    [
      "approval environment",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(singleApproval(input).environments[0]!, { extra: true }),
    ],
    [
      "approval user",
      (input: ReturnType<typeof validInput>) =>
        Object.assign(singleApproval(input).user, { extra: true }),
    ],
    [
      "expected contract",
      (input: ReturnType<typeof validInput>) => Object.assign(input.expected, { extra: true }),
    ],
  ])("rejects extra keys on the trusted %s object", async (_label, mutate) => {
    const { validateSoloFounderProductionAuthorization } = await loadValidator();
    const input = validInput();
    mutate(input);
    expect(() => validateSoloFounderProductionAuthorization(input)).toThrow(
      "solo_founder_authorization_rejected",
    );
  });

  it.each([
    [
      "missing reviewer",
      (input: ReturnType<typeof validInput>) => (requiredReviewerRule(input).reviewers = []),
    ],
    [
      "extra reviewer",
      (input: ReturnType<typeof validInput>) =>
        requiredReviewerRule(input).reviewers.push({
          type: "User",
          reviewer: { id: 2, login: "other" },
        }),
    ],
    [
      "team reviewer",
      (input: ReturnType<typeof validInput>) => (soleReviewer(input).type = "Team"),
    ],
    [
      "self-review prevention",
      (input: ReturnType<typeof validInput>) =>
        (requiredReviewerRule(input).prevent_self_review = true),
    ],
    [
      "admin bypass",
      (input: ReturnType<typeof validInput>) => (input.environment.can_admins_bypass = true),
    ],
    [
      "missing protection rule",
      (input: ReturnType<typeof validInput>) => input.environment.protection_rules.pop(),
    ],
    [
      "extra protection rule",
      (input: ReturnType<typeof validInput>) =>
        input.environment.protection_rules.push({ type: "wait_timer" }),
    ],
    [
      "disabled custom policies",
      (input: ReturnType<typeof validInput>) =>
        (input.environment.deployment_branch_policy.custom_branch_policies = false),
    ],
    [
      "missing branch policy data",
      (input: ReturnType<typeof validInput>) => (input.branchPolicies = undefined as never),
    ],
    [
      "duplicate branch policies",
      (input: ReturnType<typeof validInput>) => {
        input.branchPolicies.branch_policies.push({ name: "verdant-grow-diary", type: "branch" });
        input.branchPolicies.total_count = 2;
      },
    ],
    [
      "wrong branch policy type",
      (input: ReturnType<typeof validInput>) => (singleBranchPolicy(input).type = "tag"),
    ],
    [
      "wrong branch policy name",
      (input: ReturnType<typeof validInput>) => (singleBranchPolicy(input).name = "main"),
    ],
    [
      "mismatched pagination total",
      (input: ReturnType<typeof validInput>) => (input.branchPolicies.total_count = 2),
    ],
    [
      "unsafe pagination total",
      (input: ReturnType<typeof validInput>) => (input.branchPolicies.total_count = 101),
    ],
    ["empty approvals", (input: ReturnType<typeof validInput>) => (input.approvals = [])],
    [
      "duplicate approvals",
      (input: ReturnType<typeof validInput>) => input.approvals.push(clone(approvals[0])),
    ],
    [
      "rejected approval",
      (input: ReturnType<typeof validInput>) => (input.approvals[0].state = "rejected"),
    ],
    [
      "wrong approval user",
      (input: ReturnType<typeof validInput>) => (input.approvals[0].user.id = 1),
    ],
    [
      "wrong approval environment",
      (input: ReturnType<typeof validInput>) => (input.approvals[0].environments[0].name = "other"),
    ],
    [
      "multiple approval environments",
      (input: ReturnType<typeof validInput>) =>
        input.approvals[0].environments.push({ name: "other" }),
    ],
  ])("rejects unsafe environment evidence: %s", async (_label, mutate) => {
    const { validateSoloFounderProductionAuthorization } = await loadValidator();
    const input = validInput();
    mutate(input);
    expect(() => validateSoloFounderProductionAuthorization(input)).toThrow(
      "solo_founder_authorization_rejected",
    );
  });
});

describe("solo-founder production authorization CLI", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  function cliFixture(overrides: Record<string, unknown> = {}) {
    const directory = mkdtempSync(join(tmpdir(), "verdant-solo-founder-auth-"));
    temporaryDirectories.push(directory);
    const writeJson = (name: string, value: unknown) => {
      const path = join(directory, name);
      writeFileSync(path, JSON.stringify(value), "utf8");
      return path;
    };
    const githubEnv = join(directory, "github.env");
    writeFileSync(githubEnv, "", "utf8");
    return {
      directory,
      githubEnv,
      env: {
        CURRENT_RUN_JSON: writeJson("run.json", currentRun),
        CURRENT_RUN_APPROVALS_JSON: writeJson("approvals.json", approvals),
        SOLO_FOUNDER_ENVIRONMENT_JSON: writeJson("environment.json", environment),
        SOLO_FOUNDER_BRANCH_POLICIES_JSON: writeJson("branch-policies.json", branchPolicies),
        SOLO_FOUNDER_ACKNOWLEDGEMENT: acknowledgement,
        GITHUB_REPOSITORY: "Verdant-OS/verdant-grow-diary",
        GITHUB_REPOSITORY_ID: "123456789",
        GITHUB_RUN_ID: "987654321",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_SHA: "a".repeat(40),
        GITHUB_ACTOR_ID: "72639960",
        GITHUB_ACTOR: "cheekhimself",
        GITHUB_TRIGGERING_ACTOR: "cheekhimself",
        SOLO_FOUNDER_EXPECTED_WORKFLOW_PATH: expected.workflowPath,
        GITHUB_ENV: githubEnv,
        ...overrides,
      },
    };
  }

  it("writes only the exact fixed-key authorization evidence after validation", async () => {
    const { runSoloFounderProductionAuthorization } = await loadRunner();
    const fixture = cliFixture();
    const logs: string[] = [];
    expect(
      runSoloFounderProductionAuthorization({
        env: fixture.env,
        logger: {
          log: (line: string) => logs.push(line),
          error: (line: string) => logs.push(line),
        },
      }),
    ).toBe(0);
    expect(readFileSync(fixture.githubEnv, "utf8")).toBe(
      "SOLO_FOUNDER_DELIVERY_MODE=solo_founder_self_review_v1\n" +
        "SOLO_FOUNDER_VERIFIED_USER_ID=72639960\n" +
        "SOLO_FOUNDER_VERIFIED_LOGIN=cheekhimself\n" +
        "SOLO_FOUNDER_VERIFIED_ENVIRONMENT=verdant-production-solo-founder\n" +
        "SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED=true\n" +
        "SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED=true\n" +
        "SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED=true\n" +
        "SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS=900\n" +
        "SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS=86400\n",
    );
    expect(logs).toEqual(["Solo-founder production authorization validated."]);
  });

  it("fails closed without logging or writing attacker-controlled input", async () => {
    const { runSoloFounderProductionAuthorization } = await loadRunner();
    const sentinel = "SECRET_SENTINEL https://user:pass@example.invalid\napproval comment";
    const fixture = cliFixture();
    writeFileSync(
      fixture.env.CURRENT_RUN_APPROVALS_JSON,
      JSON.stringify([{ ...approvals[0], comment: sentinel }]),
      "utf8",
    );
    const logs: string[] = [];
    expect(
      runSoloFounderProductionAuthorization({
        env: fixture.env,
        logger: {
          log: (line: string) => logs.push(line),
          error: (line: string) => logs.push(line),
        },
      }),
    ).toBe(1);
    expect(logs).toEqual(["Solo-founder production authorization failed closed."]);
    expect(readFileSync(fixture.githubEnv, "utf8")).toBe("");
    expect(logs.join("\n")).not.toContain(sentinel);
  });

  it("accepts an exact 65,536-byte JSON input", async () => {
    const { runSoloFounderProductionAuthorization } = await loadRunner();
    const fixture = cliFixture();
    const runJson = JSON.stringify(currentRun);
    const paddedRunJson = `${runJson}${" ".repeat(65_536 - Buffer.byteLength(runJson, "utf8"))}`;
    expect(Buffer.byteLength(paddedRunJson, "utf8")).toBe(65_536);
    writeFileSync(fixture.env.CURRENT_RUN_JSON, paddedRunJson, "utf8");
    expect(
      runSoloFounderProductionAuthorization({
        env: fixture.env,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(0);
  });

  it("rejects a 65,537-byte JSON input without writing evidence", async () => {
    const { runSoloFounderProductionAuthorization } = await loadRunner();
    const fixture = cliFixture();
    const runJson = JSON.stringify(currentRun);
    const paddedRunJson = `${runJson}${" ".repeat(65_537 - Buffer.byteLength(runJson, "utf8"))}`;
    expect(Buffer.byteLength(paddedRunJson, "utf8")).toBe(65_537);
    writeFileSync(fixture.env.CURRENT_RUN_JSON, paddedRunJson, "utf8");
    expect(
      runSoloFounderProductionAuthorization({
        env: fixture.env,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(1);
    expect(readFileSync(fixture.githubEnv, "utf8")).toBe("");
  });

  it.each([
    "CURRENT_RUN_JSON",
    "CURRENT_RUN_APPROVALS_JSON",
    "SOLO_FOUNDER_ENVIRONMENT_JSON",
    "SOLO_FOUNDER_BRANCH_POLICIES_JSON",
  ])("fails closed when required JSON path %s is missing", async (key) => {
    const { runSoloFounderProductionAuthorization } = await loadRunner();
    const fixture = cliFixture();
    Reflect.deleteProperty(fixture.env, key);
    expect(
      runSoloFounderProductionAuthorization({
        env: fixture.env,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(1);
    expect(readFileSync(fixture.githubEnv, "utf8")).toBe("");
  });

  it("fails closed for a non-regular JSON input file", async () => {
    const { runSoloFounderProductionAuthorization } = await loadRunner();
    const fixture = cliFixture({ CURRENT_RUN_JSON: undefined });
    fixture.env.CURRENT_RUN_JSON = fixture.directory;
    expect(
      runSoloFounderProductionAuthorization({
        env: fixture.env,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(1);
    expect(readFileSync(fixture.githubEnv, "utf8")).toBe("");
  });

  it("fails closed for malformed JSON", async () => {
    const { runSoloFounderProductionAuthorization } = await loadRunner();
    const fixture = cliFixture();
    writeFileSync(fixture.env.CURRENT_RUN_JSON, "{", "utf8");
    expect(
      runSoloFounderProductionAuthorization({
        env: fixture.env,
        logger: { log: () => {}, error: () => {} },
      }),
    ).toBe(1);
    expect(readFileSync(fixture.githubEnv, "utf8")).toBe("");
  });
});
