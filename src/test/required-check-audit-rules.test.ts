/**
 * Tests for the post-merge required-status-check audit.
 *
 * The regression case is not synthetic: it replays the real check-run payload
 * from the head of PR #769, the merge that shipped a red `Full test suite
 * (shard 26/32)` onto the deploy branch behind an admin bypass.
 *
 * Safety:
 *  - Pure module. No network, no clock, no randomness.
 *  - Read-only: the audit reports, it never mutates a ruleset or a merge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUDIT_VERDICT,
  CHECK_STATUS,
  PR_RESOLUTION,
  auditRequiredChecks,
  diffPinnedAgainstRuleset,
  formatAuditReport,
  normalizeObservedChecks,
} from "../../scripts/lib/requiredCheckAuditRules.mjs";

const ROOT = resolve(__dirname, "../..");
const PINNED = JSON.parse(
  readFileSync(resolve(ROOT, "config/required-status-checks.json"), "utf8"),
);
const PR_769 = JSON.parse(
  readFileSync(resolve(ROOT, "src/test/fixtures/pr-769-check-runs.json"), "utf8"),
);

const MERGED = { kind: PR_RESOLUTION.PULL_REQUEST, number: 1, headSha: "abc", mergedBy: "x" };

/** Every pinned context green, so a test can then flip exactly one thing. */
function allGreen(contexts: string[]) {
  return contexts.map((name, i) => ({
    name,
    status: "completed",
    conclusion: "success",
    id: 1000 + i,
    started_at: "2026-08-07T01:00:00Z",
    completed_at: "2026-08-07T01:30:00Z",
  }));
}

const EVERY_PINNED = [...PINNED.required, ...PINNED.mustBeGreen];

describe("config/required-status-checks.json", () => {
  it("pins the 35 contexts of ruleset 20421416 and targets the deploy branch", () => {
    expect(PINNED.rulesetId).toBe(20421416);
    expect(PINNED.branch).toBe("verdant-grow-diary");
    expect(PINNED.required).toHaveLength(35);
    expect(PINNED.strictRequiredStatusChecksPolicy).toBe(true);
    // 32 sharded full-suite contexts plus three named gates.
    expect(PINNED.required.filter((c: string) => c.startsWith("Full test suite"))).toHaveLength(32);
    expect(PINNED.required).toContain("Lint, typecheck, test, build");
    expect(PINNED.required).toContain("test:legal-seo");
  });

  it("keeps mustBeGreen disjoint from required (a context has one provenance)", () => {
    const required = new Set(PINNED.required);
    for (const context of PINNED.mustBeGreen) expect(required.has(context)).toBe(false);
  });

  it("lists test:security-regression as a coverage hole, not a ruleset gate", () => {
    // The workflow's own header calls it "the required PR gate". It is not in
    // the ruleset, so nothing enforces it — that is the whole point of the list.
    expect(PINNED.mustBeGreen).toContain("test:security-regression");
    expect(PINNED.required).not.toContain("test:security-regression");
  });
});

describe("normalizeObservedChecks", () => {
  it("unions check runs and legacy commit statuses", () => {
    const observed = normalizeObservedChecks({
      checkRuns: [{ name: "a", status: "completed", conclusion: "success", id: 1 }],
      commitStatuses: [{ context: "b", state: "success", id: 2 }],
    });
    expect(observed.get("a")?.status).toBe(CHECK_STATUS.PASS);
    expect(observed.get("b")?.status).toBe(CHECK_STATUS.PASS);
    expect(observed.get("b")?.source).toBe("commit_status");
  });

  it("keeps the newest observation of a re-run context, with a stable tie-break", () => {
    const observed = normalizeObservedChecks({
      checkRuns: [
        {
          name: "a",
          status: "completed",
          conclusion: "failure",
          id: 1,
          completed_at: "2026-08-07T01:00:00Z",
        },
        {
          name: "a",
          status: "completed",
          conclusion: "success",
          id: 2,
          completed_at: "2026-08-07T02:00:00Z",
        },
      ],
    });
    expect(observed.get("a")?.status).toBe(CHECK_STATUS.PASS);

    // Identical timestamps must not resolve randomly — highest id wins.
    const tied = normalizeObservedChecks({
      checkRuns: [
        {
          name: "a",
          status: "completed",
          conclusion: "failure",
          id: 7,
          completed_at: "2026-08-07T01:00:00Z",
        },
        {
          name: "a",
          status: "completed",
          conclusion: "success",
          id: 9,
          completed_at: "2026-08-07T01:00:00Z",
        },
      ],
    });
    expect(tied.get("a")?.status).toBe(CHECK_STATUS.PASS);
  });

  it("treats neutral as pass and skipped as NOT_MEASURED, matching GitHub's own gate", () => {
    const observed = normalizeObservedChecks({
      checkRuns: [
        { name: "n", status: "completed", conclusion: "neutral", id: 1 },
        { name: "s", status: "completed", conclusion: "skipped", id: 2 },
      ],
    });
    expect(observed.get("n")?.status).toBe(CHECK_STATUS.PASS);
    expect(observed.get("s")?.status).toBe(CHECK_STATUS.NOT_MEASURED);
  });

  it("counts an unfinished run as failing — it merged before the check finished", () => {
    const observed = normalizeObservedChecks({
      checkRuns: [{ name: "a", status: "in_progress", conclusion: null, id: 1 }],
    });
    expect(observed.get("a")?.status).toBe(CHECK_STATUS.FAIL);
    expect(observed.get("a")?.incomplete).toBe(true);
  });

  it("survives null, undefined and nameless junk without throwing", () => {
    expect(normalizeObservedChecks().size).toBe(0);
    expect(normalizeObservedChecks({ checkRuns: null, commitStatuses: null } as never).size).toBe(
      0,
    );
    expect(
      normalizeObservedChecks({
        checkRuns: [null, { name: "" }, { name: "   " }] as never,
        commitStatuses: [null, { context: null }] as never,
      }).size,
    ).toBe(0);
  });
});

describe("auditRequiredChecks — happy path", () => {
  it("passes when every pinned context ran green on a merged PR head", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    expect(result.failingFindings).toHaveLength(0);
    expect(result.counts.required).toBe(35);
  });

  it("is deterministic — identical evidence yields an identical report", () => {
    const args = { pinned: PINNED, checkRuns: allGreen(EVERY_PINNED), prResolution: MERGED };
    expect(JSON.stringify(auditRequiredChecks(args))).toBe(
      JSON.stringify(auditRequiredChecks(args)),
    );
  });

  it("orders findings stably regardless of the order checks arrive in", () => {
    const forward = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
    });
    const reversed = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED).reverse(),
      prResolution: MERGED,
    });
    expect(forward.findings.map((f) => f.context)).toEqual(reversed.findings.map((f) => f.context));
  });
});

describe("auditRequiredChecks — the failures it exists to catch", () => {
  it("fails when a required context is red (the bypass case)", () => {
    const runs = allGreen(EVERY_PINNED);
    const shard = runs.find((r) => r.name === "Full test suite (shard 26/32)")!;
    shard.conclusion = "failure";
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    expect(result.failingFindings.map((f) => f.context)).toEqual(["Full test suite (shard 26/32)"]);
    expect(result.failingFindings[0].provenance).toBe("required");
  });

  it("fails when a required context never reported at all", () => {
    const runs = allGreen(EVERY_PINNED).filter((r) => r.name !== "test:legal-seo");
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const finding = result.failingFindings.find((f) => f.context === "test:legal-seo");
    expect(finding?.status).toBe(CHECK_STATUS.MISSING);
  });

  it("fails when a must-be-green context is red even though nothing gates it", () => {
    const runs = allGreen(EVERY_PINNED);
    runs.find((r) => r.name === "test:security-regression")!.conclusion = "failure";
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    expect(result.failingFindings[0].provenance).toBe("mustBeGreen");
  });

  it("does NOT fail when a must-be-green context simply did not run", () => {
    // security-db-local is opt-in; path-filtered workflows behave the same way.
    // Failing on absent here would fire on every run and get the job disabled.
    const runs = allGreen(EVERY_PINNED).filter((r) => r.name !== "test:security-regression");
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    const finding = result.findings.find((f) => f.context === "test:security-regression");
    expect(finding?.status).toBe(CHECK_STATUS.MISSING);
    expect(finding?.failing).toBe(false);
  });

  it("fails a direct push with no pull request — nothing was ever verified", () => {
    // Lovable pushes straight to the deploy branch; three commits touching the
    // file that started this work are literally titled "Changes". With no PR,
    // required checks never ran on any head, and silence must not read as pass.
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: { kind: PR_RESOLUTION.NO_PULL_REQUEST },
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    expect(result.blockers.map((b) => b.code)).toContain("no_pull_request");
  });

  it("fails a merge that landed while a required check was still running", () => {
    const runs = allGreen(EVERY_PINNED);
    const shard = runs.find((r) => r.name === "Full test suite (shard 1/32)")!;
    shard.status = "in_progress";
    shard.conclusion = null as never;
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    expect(result.failingFindings[0].reason).toContain("still");
  });

  it("tolerates a skipped required context but never calls it PASS", () => {
    const runs = allGreen(EVERY_PINNED);
    runs.find((r) => r.name === "test:legal-seo")!.conclusion = "skipped";
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    const finding = result.findings.find((f) => f.context === "test:legal-seo");
    expect(finding?.status).toBe(CHECK_STATUS.NOT_MEASURED);
  });
});

describe("auditRequiredChecks — PR #769 regression (real evidence)", () => {
  const AT_FINAL_STATE = {
    kind: PR_RESOLUTION.PULL_REQUEST,
    number: PR_769.pullRequest,
    headSha: PR_769.headSha,
  };
  const AT_MERGE = { ...AT_FINAL_STATE, mergedAt: PR_769.mergedAt };

  it("reading final state alone, flags the red shard and the ungated security gate", () => {
    // What the audit sees with no merge timestamp: the right outcome, but it
    // credits results that only landed after the merge.
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: PR_769.checkRuns,
      prResolution: AT_FINAL_STATE,
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const failing = result.failingFindings.map((f) => f.context);
    expect(failing).toContain("Full test suite (shard 26/32)");
    expect(failing).toContain("test:security-regression");
    expect(result.failingFindings).toHaveLength(2);
  });

  it("read as of the merge, shows the truth: nothing had finished (Copilot, PR #818)", () => {
    // #769 merged at 01:42:45Z. Only 3 of 89 runs had completed by then, all
    // neutral or skipped, and shard 26 did not start until 01:46:15Z. This
    // merge was not "shipped despite one red shard" — no required check had
    // finished at all, and the red was recorded minutes later.
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: PR_769.checkRuns,
      prResolution: AT_MERGE,
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);

    const requiredFailures = result.failingFindings.filter((f) => f.provenance === "required");
    expect(requiredFailures).toHaveLength(35);

    const shard26 = requiredFailures.find((f) => f.context === "Full test suite (shard 26/32)");
    expect(shard26?.lateForMerge).toBe(true);
    expect(shard26?.reason).toContain("had not finished when the merge landed");

    // A shard that eventually went green is still a failure — it gated nothing.
    const shard1 = requiredFailures.find((f) => f.context === "Full test suite (shard 1/32)");
    expect(shard1?.lateForMerge).toBe(true);
    expect(shard1?.observed).toBe("success");

    expect(result.counts.lateForMerge).toBeGreaterThanOrEqual(35);
  });

  it("does not let a post-merge re-run launder a pre-merge red", () => {
    const observed = normalizeObservedChecks({
      checkRuns: [
        {
          name: "Full test suite (shard 1/32)",
          status: "completed",
          conclusion: "failure",
          id: 1,
          started_at: "2026-08-07T01:00:00Z",
          completed_at: "2026-08-07T01:30:00Z",
        },
        {
          name: "Full test suite (shard 1/32)",
          status: "completed",
          conclusion: "success",
          id: 2,
          started_at: "2026-08-07T02:00:00Z",
          completed_at: "2026-08-07T02:30:00Z",
        },
      ],
      mergedAt: "2026-08-07T01:42:45Z",
    });
    // Newer, but irrelevant: the merge shipped on the red result.
    expect(observed.get("Full test suite (shard 1/32)")?.status).toBe(CHECK_STATUS.FAIL);
    expect(observed.get("Full test suite (shard 1/32)")?.observed).toBe("failure");
  });

  it("still passes a merge whose checks genuinely finished first", () => {
    // The guard must not turn every merge red. A normal merge-queue merge has
    // every required context complete before it lands.
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: { ...MERGED, mergedAt: "2026-08-07T02:00:00Z" },
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    expect(result.counts.lateForMerge).toBe(0);
  });
});

describe("ruleset drift", () => {
  it("reports BLOCKED, never PASS, when no admin token was supplied", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
    });
    expect(result.rulesetDrift.status).toBe("BLOCKED");
    // A blocked drift axis must not itself turn the audit red.
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
  });

  it("fails the run on a VERIFIED drift, not just prints it (Copilot, PR #818)", () => {
    // A context added to the live ruleset but absent from the pin is a context
    // this audit never checks. Reporting PASS beside that is the false-green
    // the job exists to prevent.
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
      rulesetDrift: {
        status: "FAIL",
        addedToRuleset: ["Full test suite (shard 33/32)"],
        removedFromRuleset: [],
      },
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const blocker = result.blockers.find((b) => b.code === "ruleset_drift");
    expect(blocker?.message).toContain("Full test suite (shard 33/32)");
    expect(blocker?.message).toContain("never audited");
  });

  it("keeps a BLOCKED drift advisory — unverified is not the same as wrong", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
      rulesetDrift: { status: "BLOCKED", reason: "no token" },
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    expect(result.blockers).toHaveLength(0);
  });

  it("detects a context quietly dropped from the live ruleset", () => {
    const drift = diffPinnedAgainstRuleset(["a", "b"], ["a"]);
    expect(drift.status).toBe("FAIL");
    expect(drift.removedFromRuleset).toEqual(["b"]);
  });

  it("detects a context added to the ruleset but not pinned", () => {
    const drift = diffPinnedAgainstRuleset(["a"], ["a", "c"]);
    expect(drift.status).toBe("FAIL");
    expect(drift.addedToRuleset).toEqual(["c"]);
  });

  it("passes only when both sides match exactly", () => {
    expect(diffPinnedAgainstRuleset(["b", "a"], ["a", "b"]).status).toBe("PASS");
  });
});

describe("formatAuditReport", () => {
  it("names the failing contexts and the pull request", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: PR_769.checkRuns,
      prResolution: { kind: PR_RESOLUTION.PULL_REQUEST, number: 769, headSha: PR_769.headSha },
    });
    const report = formatAuditReport(result, { sha: PR_769.mergeCommitSha, prNumber: 769 });
    expect(report).toContain("Required-check audit — FAIL");
    expect(report).toContain("Full test suite (shard 26/32)");
    expect(report).toContain("#769");
  });

  it("does not claim everything went green when something was skipped (Copilot, PR #818)", () => {
    const runs = allGreen(EVERY_PINNED);
    runs.find((r) => r.name === "test:legal-seo")!.conclusion = "skipped";
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    const report = formatAuditReport(result, { sha: "abc", prNumber: 1 });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    expect(report).not.toContain("Every pinned context ran and went green");
    expect(report).toContain("No pinned context blocked this merge");
    expect(report).toContain("1 skipped");
  });

  it("does not claim everything went green when a must-be-green never reported", () => {
    const runs = allGreen(EVERY_PINNED).filter((r) => r.name !== "test:security-regression");
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    const report = formatAuditReport(result, { sha: "abc", prNumber: 1 });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    expect(report).toContain("1 never reported");
  });

  it("says 'went green' only when that is literally true", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
    });
    const report = formatAuditReport(result, { sha: "abc", prNumber: 1 });
    expect(report).toContain("Every pinned context ran and went green before this merge landed");
  });

  it("marks an unverified drift axis as unproved in the PASS summary", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
    });
    const report = formatAuditReport(result, { sha: "abc", prNumber: 1 });
    expect(report).toContain("Ruleset drift is BLOCKED, not PASS");
    expect(report).toContain("has not been verified");
  });

  it("calls out a missing pull request in the header, not just the blocker list", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: [],
      prResolution: { kind: PR_RESOLUTION.NO_PULL_REQUEST },
    });
    const report = formatAuditReport(result, { sha: "deadbeef" });
    expect(report).toContain("none — see blockers");
    expect(report).toContain("no_pull_request");
  });
});
