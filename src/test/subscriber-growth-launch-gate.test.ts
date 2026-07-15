import { describe, expect, it } from "vitest";

import {
  buildSubscriberGrowthReleaseReceipt,
  evaluateSubscriberGrowthLaunchGate,
  formatSubscriberGrowthLaunchGate,
} from "../../scripts/releases/subscriber-growth-launch-gate-rules.mjs";
import {
  buildChangedE2eCommandArgs,
  buildTargetedTestCommandArgs,
  formattableChangedFiles,
  parseGitPorcelainPaths,
  parseSubscriberGrowthGateArgs,
  parseVitestTotals,
  runnableChangedE2e,
} from "../../scripts/releases/run-subscriber-growth-launch-gate.mjs";

const commands = [
  "targeted_tests",
  "changed_e2e",
  "subscriber_interest_rls",
  "migration_contract",
  "typecheck",
  "build",
  "lint",
  "format",
  "diff_integrity",
].map((id) => ({
  id,
  status: "PASS",
  exitCode: 0,
  durationMs: 1,
  ...(id === "targeted_tests"
    ? { testsPassed: 321, testsFailed: 0, testsSkipped: 0, testsTotal: 321 }
    : {}),
  ...(id === "changed_e2e" ? { specFiles: 2 } : {}),
  ...(id === "migration_contract" ? { migrationsPassed: 4, migrationsTotal: 4 } : {}),
}));

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
  changedE2eFiles: 2,
  changedFormattableFiles: 95,
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
  it("uses controlled worker counts without relaxing per-test timeouts", () => {
    expect(buildTargetedTestCommandArgs(["src/test/a.test.ts", "src/test/b.test.ts"])).toEqual([
      "vitest",
      "run",
      "src/test/a.test.ts",
      "src/test/b.test.ts",
      "--reporter=dot",
      "--maxWorkers=1",
    ]);
  });

  it("discovers and runs every changed Playwright spec in the mocked project", () => {
    const files = [
      "e2e/auth-route-protection.spec.ts",
      "e2e/auth-route-protection-mobile.spec.ts",
      "e2e/helpers/auth.ts",
      "src/test/auth.test.ts",
    ];
    expect(runnableChangedE2e(files)).toEqual(files.slice(0, 2));
    expect(buildChangedE2eCommandArgs(files.slice(0, 2))).toEqual([
      "playwright",
      "test",
      ...files.slice(0, 2),
      "--project=chromium-mocked",
      "--reporter=line",
      "--workers=1",
    ]);
  });

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

    const missingE2eCount = evaluateSubscriberGrowthLaunchGate({
      source: { ...source, changedE2eFiles: undefined },
      commands,
      localParity,
      liveRequired: false,
    });
    expect(missingE2eCount.problems).toContain("changed_e2e did not pass");

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

  it("records a missing local DB runtime but requires it for live verification", () => {
    const skippedCommands = commands.map((command) =>
      command.id === "subscriber_interest_rls"
        ? {
            ...command,
            status: "SKIP",
            exitCode: null,
            reason: "missing_local_supabase_env",
          }
        : command,
    );
    expect(
      evaluateSubscriberGrowthLaunchGate({
        source,
        commands: skippedCommands,
        localParity,
        liveRequired: false,
      }),
    ).toMatchObject({ status: "LOCAL_READY", localReady: true });
    expect(
      evaluateSubscriberGrowthLaunchGate({
        source,
        commands: skippedCommands,
        localParity,
        liveParity,
        liveRequired: true,
      }).problems,
    ).toContain("subscriber_interest_rls did not pass");
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

  it("rejects reduced migration totals even when the command reports PASS", () => {
    const result = evaluateSubscriberGrowthLaunchGate({
      source,
      commands: commands.map((command) =>
        command.id === "migration_contract"
          ? { ...command, migrationsPassed: 3, migrationsTotal: 3 }
          : command,
      ),
      localParity,
      liveRequired: false,
    });
    expect(result.status).toBe("HOLD");
    expect(result.problems).toContain("migration_contract did not pass");
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
    expect(
      parseGitPorcelainPaths(" M supabase/functions/mcp/index.ts\r\n?? docs/release note.md\r\n"),
    ).toEqual(["supabase/functions/mcp/index.ts", "docs/release note.md"]);
  });

  it("format-checks the complete base-relative release diff instead of only the tip commit", () => {
    const releaseDiff = [
      "src/lib/subscriberGrowthSprintRules.ts",
      "docs/releases/subscriber-growth-launch-runbook.md",
      "supabase/migrations/20260714190000_restore_public_lead_insert_only.sql",
      "dist/assets/index.js",
    ];

    expect(formattableChangedFiles(releaseDiff)).toEqual([
      "src/lib/subscriberGrowthSprintRules.ts",
      "docs/releases/subscriber-growth-launch-runbook.md",
      "dist/assets/index.js",
    ]);
    expect(
      formatSubscriberGrowthLaunchGate({
        ...buildSubscriberGrowthReleaseReceipt({
          generatedAt: "2026-07-15T00:00:00.000Z",
          source,
          commands,
          localParity,
          liveRequired: false,
        }),
      }),
    ).toContain("Format scope: 95 changed files");
  });
});
