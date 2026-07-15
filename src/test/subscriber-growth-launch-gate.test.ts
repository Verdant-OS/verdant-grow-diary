import { describe, expect, it } from "vitest";

import {
  buildSubscriberGrowthReleaseReceipt,
  evaluateSubscriberGrowthLaunchGate,
  formatSubscriberGrowthLaunchGate,
} from "../../scripts/releases/subscriber-growth-launch-gate-rules.mjs";
import {
  parseSubscriberGrowthGateArgs,
  parseVitestTotals,
} from "../../scripts/releases/run-subscriber-growth-launch-gate.mjs";

const commands = ["targeted_tests", "typecheck", "build", "lint", "format", "diff_integrity"].map(
  (id) => ({
    id,
    status: "PASS",
    exitCode: 0,
    durationMs: 1,
    ...(id === "targeted_tests"
      ? { testsPassed: 321, testsFailed: 0, testsSkipped: 0, testsTotal: 321 }
      : {}),
  }),
);

const source = {
  repositoryVerified: true,
  remote: "https://github.com/Verdant-OS/verdant-grow-diary.git",
  branch: "codex/subscriber-growth-maneuver",
  head: "a".repeat(40),
  baseRef: "origin/verdant-grow-diary",
  baseCommit: "b".repeat(40),
  baseAncestor: true,
  worktreeClean: true,
  releaseScopeClean: true,
  dirtyPaths: [],
  ignoredDirtyPaths: [],
  releaseDirtyPaths: [],
  changedFiles: 100,
  changedTestFiles: 55,
};

const localParity = {
  ok: true,
  deploymentId: null,
  routesPassed: 4,
  routesTotal: 4,
  capabilitiesPassed: 5,
  capabilitiesTotal: 5,
};

const liveParity = {
  ...localParity,
  deploymentId: "deployment-123",
};

describe("subscriber growth launch gate", () => {
  it("reports LOCAL_READY only after clean source, all commands, and local production parity pass", () => {
    expect(
      evaluateSubscriberGrowthLaunchGate({
        source,
        commands,
        localParity,
        liveRequired: false,
      }),
    ).toMatchObject({ status: "LOCAL_READY", localReady: true, liveVerified: false, problems: [] });
  });

  it("fails closed for a dirty worktree, failed command, missing changed tests, or partial parity", () => {
    const result = evaluateSubscriberGrowthLaunchGate({
      source: {
        ...source,
        worktreeClean: false,
        releaseScopeClean: false,
        dirtyPaths: ["supabase/functions/example/index.ts"],
        changedTestFiles: 0,
      },
      commands: commands.map((command) =>
        command.id === "typecheck" ? { ...command, status: "FAIL", exitCode: 2 } : command,
      ),
      localParity: { ...localParity, capabilitiesPassed: 4, ok: false },
      liveRequired: false,
    });

    expect(result.status).toBe("HOLD");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "release scope is not clean",
        "no changed targeted tests were discovered",
        "typecheck did not pass",
        "local production preview parity did not pass",
      ]),
    );
  });

  it("records but does not let the known out-of-scope generated MCP file contaminate the frontend gate", () => {
    const result = evaluateSubscriberGrowthLaunchGate({
      source: {
        ...source,
        worktreeClean: false,
        releaseScopeClean: true,
        dirtyPaths: ["supabase/functions/mcp/index.ts"],
        ignoredDirtyPaths: ["supabase/functions/mcp/index.ts"],
      },
      commands,
      localParity,
      liveRequired: false,
    });
    expect(result).toMatchObject({ status: "LOCAL_READY", localReady: true, problems: [] });
  });

  it("rejects incomplete or ambiguous command evidence and empty/skipped test totals", () => {
    const incomplete = evaluateSubscriberGrowthLaunchGate({
      source,
      commands: commands.slice(0, 5),
      localParity,
      liveRequired: false,
    });
    expect(incomplete.status).toBe("HOLD");
    expect(incomplete.problems).toContain("diff_integrity evidence must appear exactly once");

    const ambiguous = evaluateSubscriberGrowthLaunchGate({
      source,
      commands: [...commands, commands[0]],
      localParity,
      liveRequired: false,
    });
    expect(ambiguous.problems).toContain("targeted_tests evidence must appear exactly once");

    for (const targeted of [
      { testsPassed: 0, testsFailed: 0, testsSkipped: 0, testsTotal: 0 },
      { testsPassed: 320, testsFailed: 0, testsSkipped: 1, testsTotal: 321 },
    ]) {
      const result = evaluateSubscriberGrowthLaunchGate({
        source,
        commands: commands.map((command) =>
          command.id === "targeted_tests" ? { ...command, ...targeted } : command,
        ),
        localParity,
        liveRequired: false,
      });
      expect(result.problems).toContain("targeted_tests did not pass");
    }
  });

  it("rejects reduced parity totals even when every reported item passes", () => {
    const result = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity: {
        ...localParity,
        routesPassed: 1,
        routesTotal: 1,
        capabilitiesPassed: 1,
        capabilitiesTotal: 1,
      },
      liveRequired: false,
    });
    expect(result.status).toBe("HOLD");
    expect(result.problems).toContain("local production preview parity did not pass");
  });

  it("requires identified live-deployment parity before reporting LIVE_VERIFIED", () => {
    const missingIdentity = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity,
      liveParity: { ...liveParity, deploymentId: null },
      liveRequired: true,
    });
    expect(missingIdentity.status).toBe("HOLD");

    const verified = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity,
      liveParity,
      liveRequired: true,
    });
    expect(verified).toMatchObject({
      status: "LIVE_VERIFIED",
      localReady: true,
      liveVerified: true,
      problems: [],
    });
  });

  it("never turns a receipt into deployment authorization or subscriber-goal proof", () => {
    const receipt = buildSubscriberGrowthReleaseReceipt({
      generatedAt: "2026-07-15T00:00:00.000Z",
      source,
      commands,
      localParity,
      liveParity,
      liveRequired: true,
    });

    expect(receipt.status).toBe("LIVE_VERIFIED");
    expect(receipt.releaseAuthorized).toBe(false);
    expect(receipt.subscriberGoalVerified).toBe(false);
    expect(receipt.decision.note).toContain("never authorizes");
    expect(formatSubscriberGrowthLaunchGate(receipt)).toContain("Authorization: NONE");
    expect(formatSubscriberGrowthLaunchGate(receipt)).toContain("Subscriber goal verified: NO");
  });

  it("parses CLI boundaries and exact Vitest totals deterministically", () => {
    expect(
      parseSubscriberGrowthGateArgs([
        "--local-only",
        "--base-ref=origin/main",
        "--origin=https://example.test",
        "--port=4199",
      ]),
    ).toMatchObject({
      localOnly: true,
      baseRef: "origin/main",
      liveOrigin: "https://example.test",
      port: 4199,
    });
    expect(() => parseSubscriberGrowthGateArgs(["--port=80"])).toThrow("invalid_preview_port");
    expect(() => parseSubscriberGrowthGateArgs(["--surprise"])).toThrow(
      "unknown_argument:--surprise",
    );
    expect(
      parseVitestTotals(
        "\u001b[2m Tests \u001b[22m \u001b[1m\u001b[32m245 passed\u001b[39m\u001b[22m (245)",
      ),
    ).toEqual({ testsPassed: 245, testsFailed: 0, testsSkipped: 0, testsTotal: 245 });
    expect(parseVitestTotals("Tests 2 failed | 243 passed | 1 skipped (246)")).toEqual({
      testsPassed: 243,
      testsFailed: 2,
      testsSkipped: 1,
      testsTotal: 246,
    });
  });
});
