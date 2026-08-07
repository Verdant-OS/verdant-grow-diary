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
  normalizeMustBeGreen,
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

const MUST_BE_GREEN: string[] = normalizeMustBeGreen(PINNED.mustBeGreen).map(
  (e: { context: string }) => e.context,
);
const EVERY_PINNED = [...PINNED.required, ...MUST_BE_GREEN];

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
    for (const context of MUST_BE_GREEN) expect(required.has(context)).toBe(false);
  });

  it("lists test:security-regression as a coverage hole, not a ruleset gate", () => {
    // The workflow's own header calls it "the required PR gate". It is not in
    // the ruleset, so nothing enforces it — that is the whole point of the list.
    expect(MUST_BE_GREEN).toContain("test:security-regression");
    expect(PINNED.required).not.toContain("test:security-regression");
  });

  it("marks test:security-regression alwaysRuns — it has no path filter (Codex, PR #818)", () => {
    const entry = normalizeMustBeGreen(PINNED.mustBeGreen).find(
      (e: { context: string }) => e.context === "test:security-regression",
    );
    expect(entry?.alwaysRuns).toBe(true);
  });
});

describe("normalizeMustBeGreen", () => {
  it("reads a bare string as the conservative alwaysRuns: false", () => {
    expect(normalizeMustBeGreen(["a"])).toEqual([{ context: "a", alwaysRuns: false }]);
  });

  it("honours an explicit declaration object", () => {
    expect(normalizeMustBeGreen([{ context: "a", alwaysRuns: true }])).toEqual([
      { context: "a", alwaysRuns: true },
    ]);
    expect(normalizeMustBeGreen([{ context: "b", alwaysRuns: false }])).toEqual([
      { context: "b", alwaysRuns: false },
    ]);
  });

  it("drops junk without throwing", () => {
    expect(normalizeMustBeGreen(null)).toEqual([]);
    expect(normalizeMustBeGreen([null, "", "  ", { context: "" }, {}])).toEqual([]);
  });

  it("treats a truthy-but-not-true alwaysRuns as false (no accidental opt-in)", () => {
    expect(normalizeMustBeGreen([{ context: "a", alwaysRuns: "yes" }])).toEqual([
      { context: "a", alwaysRuns: false },
    ]);
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

  it("fails when an alwaysRuns must-be-green context never reported (Codex, PR #818)", () => {
    // test:security-regression has no path filter. If it is renamed, disabled,
    // or fails to schedule, MISSING is the silent-gate failure its own workflow
    // header documents — not "did not apply".
    const runs = allGreen(EVERY_PINNED).filter((r) => r.name !== "test:security-regression");
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const finding = result.failingFindings.find((f) => f.context === "test:security-regression");
    expect(finding?.status).toBe(CHECK_STATUS.MISSING);
    expect(finding?.provenance).toBe("mustBeGreen");
  });

  it("fails when an alwaysRuns must-be-green context was skipped", () => {
    const runs = allGreen(EVERY_PINNED);
    runs.find((r) => r.name === "test:security-regression")!.conclusion = "skipped";
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const finding = result.failingFindings.find((f) => f.context === "test:security-regression");
    expect(finding?.status).toBe(CHECK_STATUS.NOT_MEASURED);
  });

  it("does NOT fail when a CONDITIONAL must-be-green context did not run", () => {
    // Path-filtered and opt-in workflows legitimately do not run. Failing on
    // absent for these would fire every merge and get the job switched off.
    const pinned = { ...PINNED, mustBeGreen: [{ context: "opt-in-lane", alwaysRuns: false }] };
    const result = auditRequiredChecks({
      pinned,
      checkRuns: allGreen(PINNED.required),
      prResolution: MERGED,
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    const finding = result.findings.find((f) => f.context === "opt-in-lane");
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

  it("fails a skipped required context — unmeasured is not proof (Codex, PR #818)", () => {
    // A skipped required check did not run. AGENTS.md is explicit that an
    // unmeasured verification is never a pass, and tolerating it here while the
    // weaker mustBeGreen list rejected it was incoherent. Measured first: zero
    // skipped required contexts across the last 20 merges, so this is free.
    const runs = allGreen(EVERY_PINNED);
    runs.find((r) => r.name === "test:legal-seo")!.conclusion = "skipped";
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const finding = result.failingFindings.find((f) => f.context === "test:legal-seo");
    expect(finding?.status).toBe(CHECK_STATUS.NOT_MEASURED);
    expect(finding?.reason).toContain("proves nothing");
  });

  it("fails when a red check run is contradicted by a green commit status (Codex, PR #818)", () => {
    // GitHub treats both sources as independently required. Folding them into
    // one slot let the newer green status overwrite direct evidence of failure.
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: [
        ...allGreen(EVERY_PINNED).filter((r) => r.name !== "test:legal-seo"),
        {
          name: "test:legal-seo",
          status: "completed",
          conclusion: "failure",
          id: 1,
          completed_at: "2026-08-07T01:00:00Z",
        },
      ],
      commitStatuses: [
        {
          context: "test:legal-seo",
          state: "success",
          id: 2,
          created_at: "2026-08-07T02:00:00Z",
          updated_at: "2026-08-07T02:00:00Z",
        },
      ],
      prResolution: MERGED,
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const finding = result.failingFindings.find((f) => f.context === "test:legal-seo");
    expect(finding?.status).toBe(CHECK_STATUS.FAIL);
    expect(finding?.source).toBe("check_run");
  });

  it("does not let a PR-head rerun hide a red merge-group result (Codex, PR #818)", () => {
    // Queued merge: the merge-group run on the LANDED sha failed at 01:30, a
    // same-named rerun on the PR HEAD succeeded at 01:40 — both before the
    // merge. Keying only on (source, context) let the later head success win
    // on recency and bury the red that actually gated.
    const observed = normalizeObservedChecks({
      checkRuns: [
        {
          name: "Full test suite (shard 1/32)",
          head_sha: "landed",
          status: "completed",
          conclusion: "failure",
          id: 1,
          completed_at: "2026-08-07T01:30:00Z",
        },
        {
          name: "Full test suite (shard 1/32)",
          head_sha: "prhead",
          status: "completed",
          conclusion: "success",
          id: 2,
          completed_at: "2026-08-07T01:40:00Z",
        },
      ],
      mergedAt: "2026-08-07T01:42:45Z",
    });
    expect(observed.get("Full test suite (shard 1/32)")?.status).toBe(CHECK_STATUS.FAIL);
    expect(observed.get("Full test suite (shard 1/32)")?.sha).toBe("landed");
  });

  it("still passes when the same context is green on both SHAs", () => {
    const observed = normalizeObservedChecks({
      checkRuns: [
        {
          name: "x",
          head_sha: "landed",
          status: "completed",
          conclusion: "success",
          id: 1,
          completed_at: "2026-08-07T01:30:00Z",
        },
        {
          name: "x",
          head_sha: "prhead",
          status: "completed",
          conclusion: "success",
          id: 2,
          completed_at: "2026-08-07T01:40:00Z",
        },
      ],
      mergedAt: "2026-08-07T01:42:45Z",
    });
    expect(observed.get("x")?.status).toBe(CHECK_STATUS.PASS);
  });

  it("still passes when both sources agree the context is green", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      commitStatuses: [
        {
          context: "test:legal-seo",
          state: "success",
          id: 2,
          created_at: "2026-08-07T02:00:00Z",
          updated_at: "2026-08-07T02:00:00Z",
        },
      ],
      prResolution: MERGED,
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
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

  it("fails when strict_required_status_checks_policy is turned off (Codex, PR #818)", () => {
    // Context names can match exactly while `strict` flips off, which admits
    // checks proven against a stale base. Names alone would report PASS.
    const drift = diffPinnedAgainstRuleset(["a"], ["a"], { pinnedStrict: true, liveStrict: false });
    expect(drift.status).toBe("FAIL");
    expect(drift.strictPolicy).toEqual({ pinned: true, live: false, changed: true });
  });

  it("passes when the strict policy still matches", () => {
    const drift = diffPinnedAgainstRuleset(["a"], ["a"], { pinnedStrict: true, liveStrict: true });
    expect(drift.status).toBe("PASS");
    expect(drift.strictPolicy?.changed).toBe(false);
  });

  it("does not invent a strict-policy verdict when either side is unknown", () => {
    const drift = diffPinnedAgainstRuleset(["a"], ["a"], { pinnedStrict: true });
    expect(drift.status).toBe("PASS");
    expect(drift.strictPolicy).toBeNull();
  });

  it("treats a deleted ruleset as verified FAIL, not BLOCKED (Codex, PR #818)", () => {
    // A 404 is a verified answer, not an inability to verify: the pinned
    // ruleset does not exist, so nothing enforces the 35 contexts. BLOCKED is
    // advisory and would let an otherwise-green run report PASS beside it.
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
      rulesetDrift: {
        status: "FAIL",
        addedToRuleset: [],
        removedFromRuleset: [],
        strictPolicy: null,
        reason:
          "ruleset 20421416 does not exist (404) — the pinned required contexts are not enforced by anything",
      },
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const blocker = result.blockers.find((b) => b.code === "ruleset_drift");
    expect(blocker?.message).toContain("does not exist (404)");
  });

  it("names the strict-policy change in the blocker message", () => {
    const result = auditRequiredChecks({
      pinned: PINNED,
      checkRuns: allGreen(EVERY_PINNED),
      prResolution: MERGED,
      rulesetDrift: {
        status: "FAIL",
        addedToRuleset: [],
        removedFromRuleset: [],
        strictPolicy: { pinned: true, live: false, changed: true },
      },
    });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    const blocker = result.blockers.find((b) => b.code === "ruleset_drift");
    expect(blocker?.message).toContain("stale base");
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
    // Only a CONDITIONAL must-be-green entry can be skipped and still pass —
    // required and alwaysRuns entries both fail on NOT_MEASURED now. That case
    // is exactly where the summary must not overclaim.
    const pinned = { ...PINNED, mustBeGreen: [{ context: "opt-in-lane", alwaysRuns: false }] };
    const result = auditRequiredChecks({
      pinned,
      checkRuns: [
        ...allGreen(PINNED.required),
        { name: "opt-in-lane", status: "completed", conclusion: "skipped", id: 9001 },
      ],
      prResolution: MERGED,
    });
    const report = formatAuditReport(result, { sha: "abc", prNumber: 1 });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    expect(report).not.toContain("Every pinned context ran and went green");
    expect(report).toContain("No pinned context blocked this merge");
    expect(report).toContain("1 skipped");
  });

  it("does not claim everything went green when a conditional must-be-green never reported", () => {
    const pinned = { ...PINNED, mustBeGreen: [{ context: "opt-in-lane", alwaysRuns: false }] };
    const result = auditRequiredChecks({
      pinned,
      checkRuns: allGreen(PINNED.required),
      prResolution: MERGED,
    });
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

  it("never calls a failing skipped context 'surfaced, not failed' (Codex, PR #818)", () => {
    // Since skipped became a failure for required contexts, an unconditional
    // "surfaced, not failed" heading contradicted both the verdict and the
    // failing-contexts table directly above it.
    const runs = allGreen(EVERY_PINNED);
    runs.find((r) => r.name === "test:legal-seo")!.conclusion = "skipped";
    const result = auditRequiredChecks({ pinned: PINNED, checkRuns: runs, prResolution: MERGED });
    const report = formatAuditReport(result, { sha: "abc", prNumber: 1 });
    expect(result.verdict).toBe(AUDIT_VERDICT.FAIL);
    expect(report).toContain("| `test:legal-seo` | required | NOT_MEASURED |");
    expect(report).not.toContain("surfaced, not failed");
  });

  it("still shows the heading for a genuinely non-failing skipped context", () => {
    const pinned = { ...PINNED, mustBeGreen: [{ context: "opt-in-lane", alwaysRuns: false }] };
    const result = auditRequiredChecks({
      pinned,
      checkRuns: [
        ...allGreen(PINNED.required),
        { name: "opt-in-lane", status: "completed", conclusion: "skipped", id: 9002 },
      ],
      prResolution: MERGED,
    });
    const report = formatAuditReport(result, { sha: "abc", prNumber: 1 });
    expect(result.verdict).toBe(AUDIT_VERDICT.PASS);
    expect(report).toContain("surfaced, not failed");
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
