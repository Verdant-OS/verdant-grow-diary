export const SUBSCRIBER_GROWTH_RECEIPT_VERSION = 1;

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
const EXPECTED_MIGRATION_COUNT = 4;

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
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
    return (
      command.migrationsTotal === EXPECTED_MIGRATION_COUNT &&
      command.migrationsPassed === EXPECTED_MIGRATION_COUNT
    );
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
  const sourceProblems = [];
  if (input?.source?.repositoryVerified !== true) {
    sourceProblems.push("repository identity is not verified");
  }
  if (input?.source?.baseAncestor !== true) {
    sourceProblems.push("required base is not an ancestor of HEAD");
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

  const liveRequired = input?.liveRequired !== false;
  const liveParityPass = liveRequired ? parityPassed(input?.liveParity, true) : false;
  const liveProblems = [];
  if (liveRequired && !liveParityPass) {
    liveProblems.push("live growth parity is not verified on an identified deployment");
  }

  let status = SUBSCRIBER_GROWTH_RELEASE_STATUSES.hold;
  if (localReady && !liveRequired) status = SUBSCRIBER_GROWTH_RELEASE_STATUSES.localReady;
  if (localReady && liveParityPass) status = SUBSCRIBER_GROWTH_RELEASE_STATUSES.liveVerified;

  return {
    status,
    localReady,
    liveVerified: status === SUBSCRIBER_GROWTH_RELEASE_STATUSES.liveVerified,
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
    decision: {
      localReady: decision.localReady,
      liveVerified: decision.liveVerified,
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
  for (const problem of receipt.decision.problems) lines.push(`HOLD: ${problem}`);
  lines.push("Authorization: NONE (evidence only)");
  lines.push("Subscriber goal verified: NO");
  return lines.join("\n");
}
