import { describe, expect, it } from "vitest";

import {
  buildSubscriberGrowthReleaseReceipt,
  evaluateSubscriberGrowthLaunchGate,
  founderCounterPassed,
  formatSubscriberGrowthLaunchGate,
  migrationContractPassed,
  SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT,
  SUBSCRIBER_GROWTH_RECEIPT_VERSION,
} from "../../scripts/releases/subscriber-growth-launch-gate-rules.mjs";
import { SUBSCRIBER_GROWTH_MIGRATION_CONTRACT } from "../../scripts/releases/subscriber-growth-migration-contract.mjs";
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
  ...(id === "migration_contract"
    ? {
        migrationsPassed: SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT,
        migrationsTotal: SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT,
      }
    : {}),
}));

const source = {
  repositoryVerified: true,
  remote: "https://github.com/Verdant-OS/verdant-grow-diary.git",
  branch: "codex/subscriber-growth-maneuver",
  detachedHead: true,
  releaseTargetRef: "origin/verdant-grow-diary",
  headMergedToTarget: true,
  head: "a".repeat(40),
  releaseHead: "a".repeat(40),
  releaseHeadMatches: true,
  liveOrigin: "https://verdantgrowdiary.com",
  liveOriginVerified: true,
  baseRef: "origin/verdant-grow-diary",
  baseCommit: "b".repeat(40),
  baseAncestor: true,
  baseIsHeadParent: true,
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

const founderCounter = {
  kind: "public_founder_counter_live_check",
  attempted: true,
  ok: true,
  optionsStatus: 200,
  postStatus: 200,
  corsVerified: true,
  payloadVerified: true,
  remaining: 42,
  total: 75,
  error: null,
  errors: [],
};

const liveParity = {
  ...localParity,
  deploymentId: "deployment-123",
  founderCounter,
};

const backendRemoteVerification = {
  kind: "authenticated_supabase_remote_check",
  projectLinked: true,
  migrationsVerified: true,
  completionRecorderSecretVerified: true,
  temporaryArtifactsRemoved: true,
  functionSourceVerified: true,
  verified: true,
};

describe("subscriber growth launch gate", () => {
  it("derives its required migration count from the source contract", () => {
    expect(SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT).toBe(
      SUBSCRIBER_GROWTH_MIGRATION_CONTRACT.length,
    );
  });

  it("uses receipt schema v3 so v2 evidence cannot stand in for the Founder live guard", () => {
    expect(SUBSCRIBER_GROWTH_RECEIPT_VERSION).toBe(3);
  });

  it("fails closed instead of accepting an empty migration contract as 0/0", () => {
    expect(migrationContractPassed({ migrationsPassed: 0, migrationsTotal: 0 }, 0)).toBe(false);
  });

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
          ? {
              ...command,
              migrationsPassed: SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT - 1,
              migrationsTotal: SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT - 1,
            }
          : command,
      ),
      localParity,
      liveRequired: false,
    });
    expect(result.status).toBe("HOLD");
    expect(result.problems).toContain("migration_contract did not pass");
  });

  it("requires identified live-deployment parity and authenticated backend verification before LIVE_VERIFIED", () => {
    const missingIdentity = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity,
      liveParity: { ...liveParity, deploymentId: null },
      backendRemoteVerification,
      liveRequired: true,
    });
    expect(missingIdentity.status).toBe("HOLD");

    const missingBackendEvidence = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity,
      liveParity,
      liveRequired: true,
    });
    expect(missingBackendEvidence.status).toBe("HOLD");
    expect(missingBackendEvidence.problems).toContain(
      "paid-return backend is not verified by an authenticated Supabase remote check",
    );

    const verified = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity,
      liveParity,
      backendRemoteVerification,
      liveRequired: true,
    });
    expect(verified).toMatchObject({
      status: "LIVE_VERIFIED",
      localReady: true,
      liveVerified: true,
      problems: [],
    });
  });

  it("requires complete bounded Founder counter evidence before LIVE_VERIFIED", () => {
    expect(founderCounterPassed(founderCounter)).toBe(true);

    const missing = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity,
      liveParity: { ...localParity, deploymentId: "deployment-123" },
      backendRemoteVerification,
      liveRequired: true,
    });
    expect(missing.status).toBe("HOLD");
    expect(missing.problems).toContain("public Founder counter is not verified in production");

    for (const invalidEvidence of [
      { ...founderCounter, ok: false },
      { ...founderCounter, corsVerified: false },
      { ...founderCounter, payloadVerified: false },
      { ...founderCounter, remaining: -1 },
      { ...founderCounter, remaining: 76 },
      { ...founderCounter, total: 100 },
      { ...founderCounter, errors: ["unexpected"] },
    ]) {
      expect(founderCounterPassed(invalidEvidence)).toBe(false);
      expect(
        evaluateSubscriberGrowthLaunchGate({
          source,
          commands,
          localParity,
          liveParity: { ...liveParity, founderCounter: invalidEvidence },
          backendRemoteVerification,
          liveRequired: true,
        }).status,
      ).toBe("HOLD");
    }
  });

  it("requires the full gate base to be the canonical release commit's first parent", () => {
    const result = evaluateSubscriberGrowthLaunchGate({
      source: { ...source, baseIsHeadParent: false },
      commands,
      localParity,
      liveParity,
      backendRemoteVerification,
      liveRequired: true,
    });

    expect(result.status).toBe("HOLD");
    expect(result.problems).toContain(
      "full gate base must be the canonical release commit's first parent",
    );
  });

  it("requires a detached release commit already merged to the expected target in full mode", () => {
    const result = evaluateSubscriberGrowthLaunchGate({
      source: { ...source, detachedHead: false, headMergedToTarget: false },
      commands,
      localParity,
      liveParity,
      backendRemoteVerification,
      liveRequired: true,
    });

    expect(result.status).toBe("HOLD");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "full gate must run from a detached canonical release commit",
        "full gate release head is not confirmed on the expected remote target",
      ]),
    );
  });

  it("requires the declared immutable release commit and canonical production origin in full mode", () => {
    const result = evaluateSubscriberGrowthLaunchGate({
      source: { ...source, releaseHeadMatches: false, liveOriginVerified: false },
      commands,
      localParity,
      liveParity,
      backendRemoteVerification,
      liveRequired: true,
    });

    expect(result.status).toBe("HOLD");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "full gate release head does not match the required immutable commit",
        "full gate live parity origin is not the canonical production origin",
      ]),
    );
  });

  it("never turns a receipt into deployment authorization or subscriber-goal proof", () => {
    const receipt = buildSubscriberGrowthReleaseReceipt({
      generatedAt: "2026-07-15T00:00:00.000Z",
      source,
      commands,
      localParity,
      liveParity,
      backendRemoteVerification,
      liveRequired: true,
    });

    expect(receipt.status).toBe("LIVE_VERIFIED");
    expect(receipt.releaseAuthorized).toBe(false);
    expect(receipt.subscriberGoalVerified).toBe(false);
    expect(receipt.backendRemoteVerification).toMatchObject({
      attempted: true,
      verified: true,
      completionRecorderSecretVerified: true,
    });
    expect(receipt.decision.note).toContain("never authorizes");
    expect(formatSubscriberGrowthLaunchGate(receipt)).toContain("Authorization: NONE");
    expect(formatSubscriberGrowthLaunchGate(receipt)).toContain("Subscriber goal verified: NO");
    expect(formatSubscriberGrowthLaunchGate(receipt)).toContain("Founder counter: verified");
  });

  it("parses CLI boundaries and exact Vitest totals deterministically", () => {
    expect(
      parseSubscriberGrowthGateArgs([
        "--local-only",
        "--base-ref=origin/main",
        "--origin=https://example.test",
        `--release-head=${"b".repeat(40)}`,
        "--port=4199",
      ]),
    ).toMatchObject({
      localOnly: true,
      baseRef: "origin/main",
      liveOrigin: "https://example.test",
      releaseHead: "b".repeat(40),
      port: 4199,
    });
    expect(() => parseSubscriberGrowthGateArgs(["--port=80"])).toThrow("invalid_preview_port");
    expect(() => parseSubscriberGrowthGateArgs(["--surprise"])).toThrow(
      "unknown_argument:--surprise",
    );
    expect(() => parseSubscriberGrowthGateArgs(["--release-head=not-a-commit"])).toThrow(
      "invalid_release_head",
    );
    expect(() => parseSubscriberGrowthGateArgs(["--origin=https://staging.example.test"])).toThrow(
      "invalid_live_origin",
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

  it("fails closed when the authenticated backend verification is missing or incomplete", () => {
    const invalid = evaluateSubscriberGrowthLaunchGate({
      source,
      commands,
      localParity,
      liveParity,
      backendRemoteVerification: { ...backendRemoteVerification, functionSourceVerified: false },
      liveRequired: true,
    });
    expect(invalid.status).toBe("HOLD");
    expect(invalid.backendRemoteVerification).toMatchObject({
      attempted: true,
      functionSourceVerified: false,
      verified: false,
    });
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
