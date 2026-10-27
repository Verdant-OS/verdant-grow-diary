import { describe, expect, it } from "vitest";
import {
  SERVED_BUILD_DEPLOY_REF,
  SERVED_BUILD_EXIT_CODES,
  SERVED_BUILD_PREVIOUS_UNREADABLE_HINT,
  evaluateServedBuild,
  formatRecordedBaselineSummary,
  formatRecordedBaselineWarning,
  formatServedBuildSummary,
  missingCheckpointNeedsWarning,
  runServedBuildCheck,
} from "../../scripts/check-served-build-monotonic.mjs";

const NEW = "a".repeat(40);
const OLD = "b".repeat(40);

function decide(overrides: Partial<Parameters<typeof evaluateServedBuild>[0]>) {
  return evaluateServedBuild({
    servedSha: NEW,
    previousSha: OLD,
    servedOnDeployBranch: true,
    previousIsAncestorOfServed: true,
    ...overrides,
  });
}

describe("served build compare cases", () => {
  it("first run with no checkpoint records the served build", () => {
    expect(
      evaluateServedBuild({
        servedSha: NEW,
        previousSha: null,
        servedOnDeployBranch: true,
        previousIsAncestorOfServed: false,
        initialize: false,
      }),
    ).toEqual({ status: "PASS", reason: "baseline_recorded" });
  });

  it("same build passes and does not treat it as a rollback", () => {
    expect(
      evaluateServedBuild({
        servedSha: NEW,
        previousSha: NEW,
        servedOnDeployBranch: true,
        previousIsAncestorOfServed: false,
      }),
    ).toEqual({ status: "PASS", reason: "unchanged" });
  });

  it("newer build passes when the previous checkpoint is an ancestor", () => {
    expect(
      evaluateServedBuild({
        servedSha: NEW,
        previousSha: OLD,
        servedOnDeployBranch: true,
        previousIsAncestorOfServed: true,
      }),
    ).toEqual({ status: "PASS", reason: "moved_forward" });
  });

  it("older build fails when the served commit is not a descendant of the checkpoint", () => {
    expect(
      evaluateServedBuild({
        servedSha: OLD,
        previousSha: NEW,
        servedOnDeployBranch: true,
        previousIsAncestorOfServed: false,
      }),
    ).toEqual({ status: "FAIL", reason: "moved_backward_or_diverged" });
  });
});

describe("evaluateServedBuild", () => {
  it("BLOCKS when the served SHA is unreadable", () => {
    for (const servedSha of [null, undefined, "", "abc", "A".repeat(40), `${NEW}0`]) {
      expect(decide({ servedSha })).toEqual({ status: "BLOCKED", reason: "served_unreadable" });
    }
  });

  it("FAILS when the served SHA is not on the deploy branch, even with no previous", () => {
    expect(decide({ servedOnDeployBranch: false })).toEqual({
      status: "FAIL",
      reason: "served_not_on_deploy_branch",
    });
    expect(decide({ servedOnDeployBranch: false, previousSha: null })).toEqual({
      status: "FAIL",
      reason: "served_not_on_deploy_branch",
    });
  });

  it("seeds a baseline on a missing previous checkpoint, including a scheduled run", () => {
    for (const previousSha of [null, undefined, ""]) {
      expect(decide({ previousSha, previousIsAncestorOfServed: false })).toEqual({
        status: "PASS",
        reason: "baseline_recorded",
      });
      expect(decide({ previousSha, previousIsAncestorOfServed: false, initialize: false })).toEqual(
        { status: "PASS", reason: "baseline_recorded" },
      );
    }
  });

  it("PASSES an explicitly initialized run with no previous as a recorded baseline", () => {
    for (const previousSha of [null, undefined, ""]) {
      expect(decide({ previousSha, previousIsAncestorOfServed: false, initialize: true })).toEqual({
        status: "PASS",
        reason: "baseline_recorded",
      });
    }
  });

  it("still compares against an existing previous when initialize is set", () => {
    expect(decide({ initialize: true, previousIsAncestorOfServed: false })).toEqual({
      status: "FAIL",
      reason: "moved_backward_or_diverged",
    });
    expect(decide({ initialize: true })).toEqual({ status: "PASS", reason: "moved_forward" });
    expect(decide({ previousSha: "not-a-sha" })).toEqual({
      status: "BLOCKED",
      reason: "previous_unreadable",
    });
    expect(decide({ initialize: true, previousSha: "not-a-sha" })).toEqual({
      status: "PASS",
      reason: "baseline_recorded",
    });
  });

  it("PASSES an unchanged served SHA", () => {
    expect(decide({ previousSha: NEW, previousIsAncestorOfServed: false })).toEqual({
      status: "PASS",
      reason: "unchanged",
    });
  });

  it("PASSES when production moved forward", () => {
    expect(decide({})).toEqual({ status: "PASS", reason: "moved_forward" });
  });

  it("FAILS when production served an older or diverged commit (incident #2123)", () => {
    expect(decide({ previousIsAncestorOfServed: false })).toEqual({
      status: "FAIL",
      reason: "moved_backward_or_diverged",
    });
  });

  it("BLOCKS on a recorded previous value that is not a commit SHA", () => {
    expect(decide({ previousSha: "not-a-sha" })).toEqual({
      status: "BLOCKED",
      reason: "previous_unreadable",
    });
  });

  it("is deterministic for identical input", () => {
    const input = {
      servedSha: NEW,
      previousSha: OLD,
      servedOnDeployBranch: true,
      previousIsAncestorOfServed: false,
    };
    expect(evaluateServedBuild(input)).toEqual(evaluateServedBuild(input));
  });
});

describe("formatServedBuildSummary", () => {
  it("prints one line with status, reason and both SHAs", () => {
    expect(
      formatServedBuildSummary(
        { status: "FAIL", reason: "moved_backward_or_diverged" },
        { servedSha: OLD, previousSha: NEW },
      ),
    ).toBe(
      `served-build-monotonic: FAIL (moved_backward_or_diverged) served=${OLD} previous=${NEW}`,
    );
    expect(
      formatServedBuildSummary(
        { status: "BLOCKED", reason: "served_unreadable" },
        { servedSha: null, previousSha: null },
      ),
    ).toBe("served-build-monotonic: BLOCKED (served_unreadable) served=none previous=none");
  });
});

function versionResponse(body: unknown, status = 200) {
  return { status, type: "basic", json: async () => body } as unknown as Response;
}

function harness({
  body = { commit: NEW, dirty: false } as unknown,
  status = 200,
  previous = OLD as string | null,
  ancestry = { [`${NEW}>${SERVED_BUILD_DEPLOY_REF}`]: true, [`${OLD}>${NEW}`]: true } as Record<
    string,
    boolean
  >,
  fetchThrows = false,
} = {}) {
  const writes: string[] = [];
  const lines: string[] = [];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const deps = {
    fetchImpl: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (fetchThrows) throw new Error("network");
      return versionResponse(body, status);
    },
    isAncestor: (ancestor: string, descendant: string) =>
      ancestry[`${ancestor}>${descendant}`] === true,
    readPrevious: () => previous,
    writeServed: (sha: string) => writes.push(sha),
    log: (line: string) => lines.push(line),
  };
  return { deps, writes, lines, requests };
}

describe("runServedBuildCheck", () => {
  it("reads public version.json without following redirects or caching", async () => {
    const { deps, requests } = harness();
    await runServedBuildCheck(deps);
    expect(requests).toEqual([
      {
        url: "https://verdantgrowdiary.com/version.json",
        init: { redirect: "manual", cache: "no-store" },
      },
    ]);
  });

  it("records the served SHA and exits 0 when production moved forward", async () => {
    const { deps, writes, lines } = harness();
    const outcome = await runServedBuildCheck(deps);
    expect(outcome.status).toBe("PASS");
    expect(outcome.exitCode).toBe(SERVED_BUILD_EXIT_CODES.PASS);
    expect(writes).toEqual([NEW]);
    expect(lines).toEqual([
      `served-build-monotonic: PASS (moved_forward) served=${NEW} previous=${OLD}`,
    ]);
  });

  it("seeds the served SHA with exit 0 on a missing previous (first run)", async () => {
    for (const previous of [null, "", "  \n"]) {
      const { deps, writes, lines } = harness({ previous });
      const outcome = await runServedBuildCheck({ ...deps, workflowRunNumber: 1 });
      expect(outcome).toMatchObject({ status: "PASS", reason: "baseline_recorded" });
      expect(outcome.exitCode).toBe(SERVED_BUILD_EXIT_CODES.PASS);
      expect(writes).toEqual([NEW]);
      expect(lines).toEqual([
        `served-build-monotonic: PASS (baseline_recorded) served=${NEW} previous=none`,
      ]);
    }
  });

  it("warns and names the recorded baseline when the checkpoint is missing after the first run", async () => {
    expect(missingCheckpointNeedsWarning(1)).toBe(false);
    expect(missingCheckpointNeedsWarning(36)).toBe(true);
    expect(missingCheckpointNeedsWarning(null)).toBe(true);
    const warnings: string[] = [];
    const summaries: string[] = [];
    const { deps, writes, lines } = harness({ previous: null });
    const outcome = await runServedBuildCheck({
      ...deps,
      workflowRunNumber: 36,
      warn: (line) => warnings.push(line),
      appendSummary: (markdown) => summaries.push(markdown),
    });
    const notice = { servedSha: NEW, workflowRunNumber: 36, replacedUnreadable: false };
    expect(outcome).toMatchObject({ status: "PASS", reason: "baseline_recorded" });
    expect(outcome.exitCode).toBe(SERVED_BUILD_EXIT_CODES.PASS);
    expect(writes).toEqual([NEW]);
    expect(lines).toEqual([
      `served-build-monotonic: PASS (baseline_recorded) served=${NEW} previous=none`,
    ]);
    expect(warnings).toEqual([formatRecordedBaselineWarning(notice)]);
    expect(warnings[0]).toContain(NEW);
    expect(warnings[0]).toContain("workflow run 36");
    expect(summaries).toEqual([formatRecordedBaselineSummary(notice)]);
    expect(summaries[0]).toContain(`\`${NEW}\``);
  });

  it("records the served SHA when initialize is set and the checkpoint is missing", async () => {
    for (const previous of [null, "", "  \n"]) {
      const { deps, writes } = harness({ previous });
      const outcome = await runServedBuildCheck({ ...deps, initialize: true });
      expect(outcome).toMatchObject({ status: "PASS", reason: "baseline_recorded" });
      expect(outcome.exitCode).toBe(SERVED_BUILD_EXIT_CODES.PASS);
      expect(writes).toEqual([NEW]);
    }
  });

  it("still FAILS a backward move when initialized with a previous present", async () => {
    const { deps, writes } = harness({
      body: { commit: OLD, dirty: false },
      previous: NEW,
      ancestry: { [`${OLD}>${SERVED_BUILD_DEPLOY_REF}`]: true, [`${OLD}>${NEW}`]: true },
    });
    const outcome = await runServedBuildCheck({ ...deps, initialize: true });
    expect(outcome).toMatchObject({ status: "FAIL", reason: "moved_backward_or_diverged" });
    expect(writes).toEqual([]);
  });

  it("trims the recorded previous SHA before comparing", async () => {
    const { deps } = harness({ previous: `${NEW}\n` });
    expect((await runServedBuildCheck(deps)).reason).toBe("unchanged");
  });

  it("FAILS with exit 1 and keeps the old state when production moved backward", async () => {
    const { deps, writes } = harness({
      body: { commit: OLD, dirty: false },
      previous: NEW,
      ancestry: { [`${OLD}>${SERVED_BUILD_DEPLOY_REF}`]: true, [`${OLD}>${NEW}`]: true },
    });
    const outcome = await runServedBuildCheck(deps);
    expect(outcome).toMatchObject({ status: "FAIL", reason: "moved_backward_or_diverged" });
    expect(outcome.exitCode).toBe(SERVED_BUILD_EXIT_CODES.FAIL);
    expect(writes).toEqual([]);
  });

  it("FAILS without writing when the served SHA is not on the deploy branch", async () => {
    const { deps, writes } = harness({ ancestry: {} });
    const outcome = await runServedBuildCheck(deps);
    expect(outcome.reason).toBe("served_not_on_deploy_branch");
    expect(writes).toEqual([]);
  });

  it("BLOCKS an unreadable checkpoint and names the initialize recovery", async () => {
    const { deps, writes, lines } = harness({ previous: "not-a-sha" });
    const outcome = await runServedBuildCheck(deps);
    expect(outcome).toMatchObject({ status: "BLOCKED", reason: "previous_unreadable" });
    expect(outcome.exitCode).toBe(SERVED_BUILD_EXIT_CODES.BLOCKED);
    expect(writes).toEqual([]);
    expect(lines[1]).toBe(SERVED_BUILD_PREVIOUS_UNREADABLE_HINT);
    expect(SERVED_BUILD_PREVIOUS_UNREADABLE_HINT).toContain("initialize=true");
  });

  it("BLOCKS with exit 2 and no write on an unreadable, dirty or failed fetch", async () => {
    for (const options of [
      { status: 302 },
      { body: { commit: NEW, dirty: true } },
      { body: { commit: "nope", dirty: false } },
      { fetchThrows: true },
    ]) {
      const { deps, writes, lines } = harness(options);
      const outcome = await runServedBuildCheck(deps);
      expect(outcome).toMatchObject({ status: "BLOCKED", reason: "served_unreadable" });
      expect(outcome.exitCode).toBe(SERVED_BUILD_EXIT_CODES.BLOCKED);
      expect(writes).toEqual([]);
      expect(lines).toEqual([
        `served-build-monotonic: BLOCKED (served_unreadable) served=none previous=${OLD}`,
      ]);
    }
  });
});
