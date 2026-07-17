import { SUBSCRIBER_GROWTH_MIGRATION_CONTRACT } from "./subscriber-growth-migration-contract.mjs";

export const SUBSCRIBER_GROWTH_RECEIPT_VERSION = 2;
export const SUBSCRIBER_GROWTH_SUPABASE_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
export const SUBSCRIBER_GROWTH_RECORDED_FUNCTION_NAME = "ai-doctor-review";

export const SUBSCRIBER_GROWTH_RELEASE_STATUSES = Object.freeze({
  hold: "HOLD",
  localReady: "LOCAL_READY",
  liveVerified: "LIVE_VERIFIED",
});

export const SUBSCRIBER_GROWTH_REQUIRED_COMMAND_IDS = Object.freeze([
  "targeted_tests",
  "changed_e2e",
  "subscriber_interest_rls",
  "migration_contract",
  "typecheck",
  "build",
  "lint",
  "format",
  "diff_integrity",
]);

const EXPECTED_ROUTE_COUNT = 4;
const EXPECTED_CAPABILITY_COUNT = 5;
export const SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT =
  SUBSCRIBER_GROWTH_MIGRATION_CONTRACT.length;

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function migrationContractPassed(
  command,
  expectedMigrationCount = SUBSCRIBER_GROWTH_EXPECTED_MIGRATION_COUNT,
) {
  return (
    Number.isInteger(expectedMigrationCount) &&
    expectedMigrationCount > 0 &&
    command?.migrationsTotal === expectedMigrationCount &&
    command?.migrationsPassed === expectedMigrationCount
  );
}

export function summarizeSubscriberGrowthBackendRemoteVerification(backendRemoteVerification) {
  const record = isRecord(backendRemoteVerification) ? backendRemoteVerification : null;
  const projectLinked = record?.projectLinked === true;
  const migrationsVerified = record?.migrationsVerified === true;
  const completionRecorderSecretVerified = record?.completionRecorderSecretVerified === true;
  const temporaryArtifactsRemoved = record?.temporaryArtifactsRemoved === true;
  const functionSourceVerified = record?.functionSourceVerified === true;
  return {
    attempted: record !== null,
    projectLinked,
    migrationsVerified,
    completionRecorderSecretVerified,
    temporaryArtifactsRemoved,
    functionSourceVerified,
    verified:
      record?.kind === "authenticated_supabase_remote_check" &&
      record?.verified === true &&
      projectLinked &&
      migrationsVerified &&
      completionRecorderSecretVerified &&
      temporaryArtifactsRemoved &&
      functionSourceVerified,
  };
}

function commandPassed(command, source, liveRequired) {
  if (command?.id === "subscriber_interest_rls" && command?.status === "SKIP") {
    return liveRequired === false && command.reason === "missing_local_supabase_env";
  }
  if (command?.status !== "PASS" || command?.exitCode !== 0) return false;
  if (command.id === "changed_e2e") {
    return (
      Number.isInteger(source?.changedE2eFiles) &&
      source.changedE2eFiles >= 0 &&
      command.specFiles === source.changedE2eFiles
    );
  }
  if (command.id === "migration_contract") {
    return migrationContractPassed(command);
  }
  if (command.id !== "targeted_tests") return true;
  return (
    finiteNonNegative(command.testsTotal) > 0 &&
    command.testsPassed === command.testsTotal &&
    command.testsFailed === 0 &&
    command.testsSkipped === 0
  );
}

function parityPassed(parity, requireDeploymentId) {
  if (!parity || parity.ok !== true) return false;
  if (parity.routesTotal !== EXPECTED_ROUTE_COUNT || parity.routesPassed !== EXPECTED_ROUTE_COUNT) {
    return false;
  }
  if (
    parity.capabilitiesTotal !== EXPECTED_CAPABILITY_COUNT ||
    parity.capabilitiesPassed !== EXPECTED_CAPABILITY_COUNT
  ) {
    return false;
  }
  return (
    !requireDeploymentId ||
    (typeof parity.deploymentId === "string" && parity.deploymentId.trim().length > 0)
  );
}

export function evaluateSubscriberGrowthLaunchGate(input) {
  const liveRequired = input?.liveRequired !== false;
  const sourceProblems = [];
  if (input?.source?.repositoryVerified !== true) {
    sourceProblems.push("repository identity is not verified");
  }
  if (input?.source?.baseAncestor !== true) {
    sourceProblems.push("required base is not an ancestor of HEAD");
  }
  if (liveRequired && input?.source?.baseIsHeadParent !== true) {
    sourceProblems.push("full gate base must be the canonical release commit's first parent");
  }
  if (liveRequired && input?.source?.detachedHead !== true) {
    sourceProblems.push("full gate must run from a detached canonical release commit");
  }
  if (liveRequired && input?.source?.headMergedToTarget !== true) {
    sourceProblems.push("full gate release head is not confirmed on the expected remote target");
  }
  if (liveRequired && input?.source?.releaseHeadMatches !== true) {
    sourceProblems.push("full gate release head does not match the required immutable commit");
  }
  if (liveRequired && input?.source?.liveOriginVerified !== true) {
    sourceProblems.push("full gate live parity origin is not the canonical production origin");
  }
  if (input?.source?.releaseScopeClean !== true) {
    sourceProblems.push("release scope is not clean");
  }
  if (finiteNonNegative(input?.source?.changedTestFiles) < 1) {
    sourceProblems.push("no changed targeted tests were discovered");
  }

  const commands = Array.isArray(input?.commands) ? input.commands : [];
  const commandProblems = [];
  for (const id of SUBSCRIBER_GROWTH_REQUIRED_COMMAND_IDS) {
    const matches = commands.filter((command) => command?.id === id);
    if (matches.length !== 1) {
      commandProblems.push(`${id} evidence must appear exactly once`);
    } else if (!commandPassed(matches[0], input?.source, input?.liveRequired !== false)) {
      commandProblems.push(`${id} did not pass`);
    }
  }

  const localParityPass = parityPassed(input?.localParity, false);
  const localProblems = localParityPass ? [] : ["local production preview parity did not pass"];
  const localReady = sourceProblems.length === 0 && commandProblems.length === 0 && localParityPass;

  const liveParityPass = liveRequired ? parityPassed(input?.liveParity, true) : false;
  const backendRemoteVerification = summarizeSubscriberGrowthBackendRemoteVerification(
    input?.backendRemoteVerification,
  );
  const backendRemoteVerificationPass = liveRequired ? backendRemoteVerification.verified : false;
  const liveProblems = [];
  if (liveRequired && !liveParityPass) {
    liveProblems.push("live growth parity is not verified on an identified deployment");
  }
  if (liveRequired && !backendRemoteVerificationPass) {
    liveProblems.push(
      "paid-return backend is not verified by an authenticated Supabase remote check",
    );
  }

  let status = SUBSCRIBER_GROWTH_RELEASE_STATUSES.hold;
  if (localReady && !liveRequired) status = SUBSCRIBER_GROWTH_RELEASE_STATUSES.localReady;
  if (localReady && liveParityPass && backendRemoteVerificationPass) {
    status = SUBSCRIBER_GROWTH_RELEASE_STATUSES.liveVerified;
  }

  return {
    status,
    localReady,
    liveVerified: status === SUBSCRIBER_GROWTH_RELEASE_STATUSES.liveVerified,
    backendRemoteVerification,
    problems: [...sourceProblems, ...commandProblems, ...localProblems, ...liveProblems],
  };
}

export function buildSubscriberGrowthReleaseReceipt(input) {
  const decision = evaluateSubscriberGrowthLaunchGate(input);
  return {
    schemaVersion: SUBSCRIBER_GROWTH_RECEIPT_VERSION,
    kind: "subscriber_growth_launch_gate",
    generatedAt: input.generatedAt,
    status: decision.status,
    releaseAuthorized: false,
    subscriberGoalVerified: false,
    source: input.source,
    commands: input.commands,
    localParity: input.localParity,
    liveParity: input.liveRequired === false ? null : input.liveParity,
    backendRemoteVerification:
      input.liveRequired === false ? null : decision.backendRemoteVerification,
    decision: {
      localReady: decision.localReady,
      liveVerified: decision.liveVerified,
      backendRemoteVerificationVerified: decision.backendRemoteVerification.verified,
      problems: decision.problems,
      note: "Evidence only. This receipt never authorizes a push, deploy, merge, billing mutation, or subscriber-count claim.",
    },
  };
}

export function formatSubscriberGrowthLaunchGate(receipt) {
  const tests = receipt.commands.find((command) => command.id === "targeted_tests");
  const migrations = receipt.commands.find((command) => command.id === "migration_contract");
  const changedE2e = receipt.commands.find((command) => command.id === "changed_e2e");
  const subscriberInterestRls = receipt.commands.find(
    (command) => command.id === "subscriber_interest_rls",
  );
  const lines = [
    `Subscriber growth launch gate: ${receipt.status}`,
    `Commit: ${receipt.source.head}`,
    `Branch: ${receipt.source.branch}`,
    `Changed tests: ${receipt.source.changedTestFiles}`,
    `Format scope: ${receipt.source.changedFormattableFiles ?? 0} changed files`,
    `Ignored generated paths: ${receipt.source.ignoredDirtyPaths?.length ?? 0}`,
    `Targeted tests: ${tests?.testsPassed ?? 0}/${tests?.testsTotal ?? 0}`,
    `Changed Playwright specs: ${changedE2e?.specFiles ?? 0} (${changedE2e?.status ?? "MISSING"})`,
    `Subscriber-interest RLS runtime: ${subscriberInterestRls?.status ?? "MISSING"}`,
    `Migration contract: ${migrations?.migrationsPassed ?? 0}/${migrations?.migrationsTotal ?? 0}`,
    `Local parity: ${receipt.localParity?.capabilitiesPassed ?? 0}/${receipt.localParity?.capabilitiesTotal ?? 0}`,
  ];
  if (receipt.liveParity) {
    lines.push(
      `Live deployment: ${receipt.liveParity.deploymentId ?? "unavailable"}`,
      `Live parity: ${receipt.liveParity.capabilitiesPassed}/${receipt.liveParity.capabilitiesTotal}`,
    );
  } else {
    lines.push("Live parity: skipped by local-only mode");
  }
  if (receipt.backendRemoteVerification) {
    lines.push(
      `Paid-return backend remote verification: ${receipt.backendRemoteVerification.verified ? "verified" : "unverified"}`,
    );
  } else {
    lines.push("Paid-return backend remote verification: skipped by local-only mode");
  }
  for (const problem of receipt.decision.problems) lines.push(`HOLD: ${problem}`);
  lines.push("Authorization: NONE (evidence only)");
  lines.push("Subscriber goal verified: NO");
  return lines.join("\n");
}
