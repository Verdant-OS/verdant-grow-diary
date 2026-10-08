import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import {
  actionsFixtureUserId,
  buildActionsReadonlyReceipt,
  chooseOwnedActionsGrow,
  isActionsGrowRead,
  isScopedActionsRead,
  readScopedActions,
  ACTIONS_READONLY_CHECKS,
  type ActionsReadonlySample,
} from "../../e2e/lib/actionsReadonlyProofRules";
import {
  QUICKLOG_SMOKE_ACCOUNT_EMAIL,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
} from "../../e2e/lib/productionQuickLogFixtureRules";
import { PERFORMANCE_ORIGIN } from "../../e2e/lib/signedInPerformanceRules";

const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const grow = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const other = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const id = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const sha = "a".repeat(40);
const identity = { origin: PERFORMANCE_ORIGIN, commit: sha, dirty: false as const };
const growUrl =
  QUICKLOG_SMOKE_BACKEND_ORIGIN +
  "/rest/v1/grows?select=*&is_archived=eq.false&order=created_at.desc";
const queueUrl =
  QUICKLOG_SMOKE_BACKEND_ORIGIN +
  "/rest/v1/action_queue?select=id,grow_id,tent_id,plant_id,source,action_type,target_metric,target_device,suggested_change,reason,risk_level,status,created_at&grow_id=eq." +
  grow +
  "&order=created_at.desc&limit=100";
const growRow = { id: grow, user_id: owner, is_archived: false };
const row = {
  id,
  grow_id: grow,
  status: "pending_approval",
  action_type: "Review evidence",
  created_at: "2026-09-01T00:00:00Z",
  reason: "private fixture reason",
  target_device: "private device",
};
const sample: ActionsReadonlySample = {
  expectedSha: sha,
  accountVerified: true,
  before: identity,
  after: identity,
  checks: Object.fromEntries(ACTIONS_READONLY_CHECKS.map((check) => [check, true])),
  initialCount: 0,
  refreshedCount: 0,
  barrierPassed: true,
  blockedWrites: 0,
  applicationErrors: 0,
  elapsedMs: 10,
};

describe("fixture-owned Actions read boundary", () => {
  it("requires the actual approved normal account identity", () => {
    expect(actionsFixtureUserId({ id: owner, email: QUICKLOG_SMOKE_ACCOUNT_EMAIL })).toBe(owner);
    expect(actionsFixtureUserId({ id: owner, email: "matt@verdantgrowdiary.com" })).toBeNull();
  });
  it.each([null, undefined, [], {}, { id: "bad", email: QUICKLOG_SMOKE_ACCOUNT_EMAIL }])(
    "rejects unproved identity %j",
    (value) => expect(actionsFixtureUserId(value)).toBeNull(),
  );
  it("chooses an owned active grow deterministically without changing input", () => {
    const input = [{ ...growRow, id: other }, growRow];
    expect(chooseOwnedActionsGrow(input, 200, owner)).toBe(grow);
    expect(chooseOwnedActionsGrow([...input].reverse(), 200, owner)).toBe(grow);
    expect(input[0].id).toBe(other);
  });
  it.each([
    null,
    undefined,
    {},
    [],
    [null],
    [{}],
    [{ ...growRow, user_id: other }],
    [{ ...growRow, is_archived: true }],
    [growRow, growRow],
    [growRow, { ...growRow, id: other, user_id: other }],
  ])("rejects missing/foreign/archived/duplicate ownership %j", (value) =>
    expect(chooseOwnedActionsGrow(value, 200, owner)).toBeNull(),
  );
  it.each([401, 403, 500, null])("never infers scope from failed grow read %s", (status) =>
    expect(chooseOwnedActionsGrow([growRow], status, owner)).toBeNull(),
  );
  it("accepts only exact normal read queries", () => {
    expect(isActionsGrowRead("GET", growUrl)).toBe(true);
    expect(isScopedActionsRead("GET", queueUrl, grow)).toBe(true);
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", null])(
    "rejects mutation or unknown method %s",
    (method) => {
      expect(isActionsGrowRead(method, growUrl)).toBe(false);
      expect(isScopedActionsRead(method, queueUrl, grow)).toBe(false);
    },
  );
  it.each([
    null,
    "bad",
    queueUrl + "&grow_id=eq." + grow,
    queueUrl + "&id=eq." + id,
    queueUrl + "#hash",
    queueUrl.replace(grow, other),
    queueUrl.replace("limit=100", "limit=1000"),
    queueUrl.replace(QUICKLOG_SMOKE_BACKEND_ORIGIN, "https://example.invalid"),
  ])("rejects unrelated/ambiguous queue query %j", (target) =>
    expect(isScopedActionsRead("GET", target, grow)).toBe(false),
  );
  it.each([
    growUrl + "&select=*",
    growUrl + "&user_id=eq." + owner,
    growUrl.replace("eq.false", "eq.true"),
    growUrl + "#hash",
  ])("rejects non-canonical grow query %s", (target) =>
    expect(isActionsGrowRead("GET", target)).toBe(false),
  );
});

describe("actual successful Actions row projection", () => {
  it("distinguishes successful empty from absent/error read", () => {
    expect(readScopedActions([], 200, grow)).toEqual([]);
    expect(readScopedActions(null, 200, grow)).toBeNull();
    expect(readScopedActions([], 500, grow)).toBeNull();
  });
  it("preserves real row identity/status/title without private content", () => {
    const expected = [{ id, status: "pending_approval", title: "Review evidence" }];
    expect(readScopedActions([row], 200, grow)).toEqual(expected);
    expect(readScopedActions([row], 200, grow)).toEqual(expected);
    expect(JSON.stringify(readScopedActions([row], 200, grow))).not.toContain("private");
  });
  it.each(["pending_approval", "simulated", "approved", "rejected", "completed", "cancelled"])(
    "accepts observed canonical status %s",
    (status) => expect(readScopedActions([{ ...row, status }], 200, grow)?.[0].status).toBe(status),
  );
  it.each([
    null,
    undefined,
    {},
    [null],
    [{}],
    [{ ...row, id: "bad" }],
    [{ ...row, grow_id: other }],
    [{ ...row, status: "automatic" }],
    [{ ...row, action_type: "" }],
    [{ ...row, action_type: null }],
    [{ ...row, created_at: "bad" }],
    [row, row],
    Array(101).fill(row),
  ])("does not guess malformed/unscoped/duplicate rows %j", (value) =>
    expect(readScopedActions(value, 200, grow)).toBeNull(),
  );
  it.each([401, 404, 500, null])("rejects error status %s even with plausible rows", (status) =>
    expect(readScopedActions([row], status, grow)).toBeNull(),
  );
});

describe("sanitized Actions receipt acceptance", () => {
  it("confirms actual successful empty and refresh with limited scope", () => {
    const receipt = buildActionsReadonlyReceipt(sample);
    expect(receipt.status).toBe("PASS");
    expect(receipt.readState).toBe("successful-empty");
    expect(receipt.refreshedReadState).toBe("successful-empty");
    expect(receipt.transitionAcceptance).toBe("NOT_MEASURED");
    expect(receipt.deviceAcceptance).toBe("NOT_MEASURED");
    expect(receipt.backendSecurityAcceptance).toBe("NOT_MEASURED");
  });
  it("reports actual changed refresh count instead of fabricating stability", () => {
    expect(
      buildActionsReadonlyReceipt({ ...sample, initialCount: 2, refreshedCount: 1 }),
    ).toMatchObject({
      status: "PASS",
      initialCount: 2,
      refreshedCount: 1,
      readState: "successful-rows",
      refreshedReadState: "successful-rows",
    });
  });
  it.each([
    null,
    undefined,
    {},
    [],
    { ...sample, accountVerified: false },
    { ...sample, expectedSha: "bad" },
    { ...sample, initialCount: null },
    { ...sample, refreshedCount: null },
    { ...sample, initialCount: -1 },
    { ...sample, refreshedCount: 101 },
    { ...sample, initialCount: 0.5 },
  ])("blocks missing acceptance inputs %j", (value) =>
    expect(buildActionsReadonlyReceipt(value).status).toBe("BLOCKED"),
  );
  it.each([
    { ...identity, commit: "b".repeat(40) },
    { ...identity, dirty: true },
    { ...identity, origin: "https://example.invalid" },
    null,
  ])("blocks changed/unproved deployment %j", (after) =>
    expect(buildActionsReadonlyReceipt({ ...sample, after }).status).toBe("BLOCKED"),
  );
  it.each([{ barrierPassed: false }, { blockedWrites: 1 }, { blockedWrites: null }])(
    "never waives barrier failure %j",
    (patch) => expect(buildActionsReadonlyReceipt({ ...sample, ...patch }).status).toBe("BLOCKED"),
  );
  it.each(ACTIONS_READONLY_CHECKS)("requires actual check %s", (check) => {
    const receipt = buildActionsReadonlyReceipt({
      ...sample,
      checks: { ...sample.checks, [check]: false },
    });
    expect(receipt.status).toBe(check === "owned-active-grow" ? "BLOCKED" : "FAIL");
  });
  it.each([null, -1, NaN, Infinity])("does not invent elapsed time %s", (elapsedMs) =>
    expect(buildActionsReadonlyReceipt({ ...sample, elapsedMs }).status).toBe("NOT_MEASURED"),
  );
  it("requires zero observed runtime errors", () => {
    expect(buildActionsReadonlyReceipt({ ...sample, applicationErrors: 1 }).status).toBe("FAIL");
    expect(buildActionsReadonlyReceipt({ ...sample, applicationErrors: null }).status).toBe(
      "BLOCKED",
    );
  });
  it("is deterministic and never reflects ids or private payloads", () => {
    const input = { ...sample, id, owner, grow, raw_payload: "Bearer secret", reason: row.reason };
    expect(buildActionsReadonlyReceipt(input)).toEqual(buildActionsReadonlyReceipt(input));
    const json = JSON.stringify(buildActionsReadonlyReceipt(input));
    for (const value of [id, owner, grow, "Bearer", "secret", row.reason])
      expect(json).not.toContain(value);
  });
});

describe("resolved Actions proof workflow", () => {
  it("uses exact normal fixture setup, zero retries and sanitized artifact only", () => {
    const workflow = load(readFileSync(".github/workflows/actions-readonly-proof.yml", "utf8")) as {
      permissions: Record<string, string>;
      jobs: Record<
        string,
        {
          env: Record<string, string>;
          steps: Array<{
            name: string;
            run?: string;
            uses?: string;
            with?: Record<string, unknown>;
          }>;
        }
      >;
    };
    expect(workflow.permissions).toEqual({ contents: "read" });
    const job = workflow.jobs["actions-readonly-proof"];
    expect(job.env.E2E_MEASURE_ACTIONS_READONLY).toBe("true");
    expect(job.env.PLAYWRIGHT_RETRIES).toBe("0");
    const browser = job.steps.find((s) => s.name === "Measure fixture-owned Actions on production");
    expect(browser?.run).toBe(
      "bunx playwright test e2e/actions-readonly-proof.spec.ts --project=chromium-authed --workers=1 --retries=0 --reporter=list",
    );
    const upload = job.steps.find((s) => s.name === "Upload sanitized Actions receipt only");
    expect(upload?.with?.path).toBe("test-results/**/actions-readonly-proof.json");
    expect(job.steps.some((s) => /apply|preflight|migration/i.test(s.run ?? ""))).toBe(false);
  });
});

describe("Actions proof workflow on the deploy branch", () => {
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
  const workflow = load(readFileSync(".github/workflows/actions-readonly-proof.yml", "utf8")) as {
    jobs: Record<string, Job>;
  };
  const job = workflow.jobs["actions-readonly-proof"];
  const safety = workflow.jobs["actions-readonly-proof-safety-regressions"];
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
      "Measure fixture-owned Actions on production",
    ]);
  });

  it("measures after deploy pushes that change the measured product", () => {
    const triggers = load(readFileSync(".github/workflows/actions-readonly-proof.yml", "utf8")) as {
      on: { push: { branches: string[]; paths: string[] } };
    };
    expect(triggers.on.push.branches).toEqual(["verdant-grow-diary"]);
    for (const input of ["src/**", "public/**", "vite.config.ts", "package.json", "bun.lock"])
      expect(triggers.on.push.paths).toContain(input);
    expect(triggers.on.push.paths).toContain(".github/workflows/actions-readonly-proof.yml");
    // The probe's runner dependencies: login setup, shared helpers, config, SHA wait.
    for (const input of ["e2e/**", "playwright.config.ts", "scripts/wait-for-deployed-sha.mjs"])
      expect(triggers.on.push.paths).toContain(input);
  });

  it("pins the checked-out deploy SHA and waits for it to be live before measuring", () => {
    expect(job.steps[index("Checkout proof source")].with?.ref).toBe("${{ github.sha }}");
    const pin = job.steps[index("Pin current deploy SHA")].run ?? "";
    expect(pin).toContain('expected_sha="$(git rev-parse HEAD)"');
    expect(pin).toContain('[ "$expected_sha" = "$GITHUB_SHA" ]');
    expect(pin).not.toContain("git fetch");
    const wait = index("Wait for the pinned SHA to be live");
    expect(wait).toBeGreaterThan(index("Pin current deploy SHA"));
    expect(wait).toBeLessThan(index("Measure fixture-owned Actions on production"));
    expect(job.steps[wait].run).toBe("node scripts/wait-for-deployed-sha.mjs");
    // The wait is bounded at 20 minutes by default; the job must outlast it.
    expect(job["timeout-minutes"]).toBeGreaterThanOrEqual(40);
  });
});
