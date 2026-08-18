export const SOLO_FOUNDER_POLICY = Object.freeze({
  deliveryMode: "solo_founder_self_review_v1",
  founderUserId: 72639960,
  founderLogin: "cheekhimself",
  environmentName: "verdant-production-solo-founder",
  branchName: "verdant-grow-diary",
  acknowledgement: "I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN",
  minimumReviewSeconds: 900,
  maximumReviewSeconds: 86400,
});

function reject() {
  throw new Error("solo_founder_authorization_rejected");
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const observed = Object.keys(value).sort();
  return observed.length === keys.length && observed.every((key, index) => key === keys[index]);
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function githubLogin(value) {
  return (
    typeof value === "string" &&
    /^(?:[A-Za-z0-9]|[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9]))$/.test(value)
  );
}

function sha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function identity(value, id, login) {
  return (
    exactKeys(value, ["id", "login"]) &&
    safeInteger(value.id) &&
    githubLogin(value.login) &&
    value.id === id &&
    value.login === login
  );
}

function repository(value, id, fullName) {
  return (
    exactKeys(value, ["full_name", "id"]) &&
    safeInteger(value.id) &&
    typeof value.full_name === "string" &&
    value.id === id &&
    value.full_name === fullName
  );
}

function expectedContract(expected) {
  const keys = [
    "acknowledgement",
    "actorId",
    "actorLogin",
    "repositoryFullName",
    "repositoryId",
    "runAttempt",
    "runId",
    "sha",
    "triggeringActorId",
    "triggeringActorLogin",
    "workflowPath",
  ];
  return (
    exactKeys(expected, keys) &&
    safeInteger(expected.repositoryId) &&
    typeof expected.repositoryFullName === "string" &&
    safeInteger(expected.runId) &&
    expected.runAttempt === 1 &&
    sha(expected.sha) &&
    safeInteger(expected.actorId) &&
    githubLogin(expected.actorLogin) &&
    safeInteger(expected.triggeringActorId) &&
    githubLogin(expected.triggeringActorLogin) &&
    typeof expected.workflowPath === "string" &&
    /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(expected.workflowPath) &&
    expected.acknowledgement === SOLO_FOUNDER_POLICY.acknowledgement &&
    expected.actorId === SOLO_FOUNDER_POLICY.founderUserId &&
    expected.actorLogin === SOLO_FOUNDER_POLICY.founderLogin &&
    expected.triggeringActorId === SOLO_FOUNDER_POLICY.founderUserId &&
    expected.triggeringActorLogin === SOLO_FOUNDER_POLICY.founderLogin &&
    expected.repositoryFullName === "Verdant-OS/verdant-grow-diary"
  );
}

function validCurrentRun(currentRun, expected) {
  return (
    exactKeys(currentRun, [
      "actor",
      "event",
      "head_branch",
      "head_repository",
      "head_sha",
      "id",
      "path",
      "repository",
      "run_attempt",
      "triggering_actor",
    ]) &&
    safeInteger(currentRun.id) &&
    currentRun.id === expected.runId &&
    currentRun.run_attempt === 1 &&
    currentRun.event === "workflow_dispatch" &&
    (currentRun.path === expected.workflowPath ||
      currentRun.path === `${expected.workflowPath}@${SOLO_FOUNDER_POLICY.branchName}`)
  );
}

function validRun(currentRun, expected) {
  if (!validCurrentRun(currentRun, expected)) return false;
  return (
    currentRun.path === expected.workflowPath ||
    currentRun.path === `${expected.workflowPath}@${SOLO_FOUNDER_POLICY.branchName}`
  ) &&
    currentRun.head_branch === SOLO_FOUNDER_POLICY.branchName &&
    currentRun.head_sha === expected.sha &&
    repository(currentRun.repository, expected.repositoryId, expected.repositoryFullName) &&
    repository(currentRun.head_repository, expected.repositoryId, expected.repositoryFullName) &&
    identity(currentRun.actor, expected.actorId, expected.actorLogin) &&
    identity(
      currentRun.triggering_actor,
      expected.triggeringActorId,
      expected.triggeringActorLogin,
    );
}

function validEnvironment(environment) {
  if (
    !exactKeys(environment, [
      "can_admins_bypass",
      "deployment_branch_policy",
      "name",
      "protection_rules",
    ]) ||
    environment.name !== SOLO_FOUNDER_POLICY.environmentName ||
    environment.can_admins_bypass !== false ||
    !exactKeys(environment.deployment_branch_policy, [
      "custom_branch_policies",
      "protected_branches",
    ]) ||
    environment.deployment_branch_policy.protected_branches !== false ||
    environment.deployment_branch_policy.custom_branch_policies !== true ||
    !Array.isArray(environment.protection_rules) ||
    environment.protection_rules.length !== 2
  ) {
    return false;
  }

  const requiredReviewers = environment.protection_rules.find(
    (rule) => rule?.type === "required_reviewers",
  );
  const branchPolicy = environment.protection_rules.find((rule) => rule?.type === "branch_policy");
  return (
    Boolean(requiredReviewers) &&
    Boolean(branchPolicy) &&
    exactKeys(requiredReviewers, ["prevent_self_review", "reviewers", "type"]) &&
    requiredReviewers.prevent_self_review === false &&
    Array.isArray(requiredReviewers.reviewers) &&
    requiredReviewers.reviewers.length === 1 &&
    exactKeys(requiredReviewers.reviewers[0], ["reviewer", "type"]) &&
    requiredReviewers.reviewers[0].type === "User" &&
    identity(
      requiredReviewers.reviewers[0].reviewer,
      SOLO_FOUNDER_POLICY.founderUserId,
      SOLO_FOUNDER_POLICY.founderLogin,
    ) &&
    exactKeys(branchPolicy, ["type"])
  );
}

function validBranchPolicies(branchPolicies) {
  return (
    exactKeys(branchPolicies, ["branch_policies", "total_count"]) &&
    safeInteger(branchPolicies.total_count) &&
    branchPolicies.total_count <= 100 &&
    Array.isArray(branchPolicies.branch_policies) &&
    branchPolicies.total_count === branchPolicies.branch_policies.length &&
    branchPolicies.branch_policies.length === 1 &&
    exactKeys(branchPolicies.branch_policies[0], ["name", "type"]) &&
    branchPolicies.branch_policies[0].name === SOLO_FOUNDER_POLICY.branchName &&
    branchPolicies.branch_policies[0].type === "branch"
  );
}

function validApprovals(approvals) {
  return (
    Array.isArray(approvals) &&
    approvals.length === 1 &&
    exactKeys(approvals[0], ["environments", "state", "user"]) &&
    approvals[0].state === "approved" &&
    Array.isArray(approvals[0].environments) &&
    approvals[0].environments.length === 1 &&
    exactKeys(approvals[0].environments[0], ["name"]) &&
    approvals[0].environments[0].name === SOLO_FOUNDER_POLICY.environmentName &&
    identity(
      approvals[0].user,
      SOLO_FOUNDER_POLICY.founderUserId,
      SOLO_FOUNDER_POLICY.founderLogin,
    )
  );
}

export function validateSoloFounderProductionAuthorization({
  currentRun,
  approvals,
  environment,
  branchPolicies,
  expected,
}) {
  if (
    !expectedContract(expected) ||
    !validRun(currentRun, expected) ||
    !validEnvironment(environment) ||
    !validBranchPolicies(branchPolicies) ||
    !validApprovals(approvals)
  ) {
    reject();
  }

  return Object.freeze({
    deliveryMode: SOLO_FOUNDER_POLICY.deliveryMode,
    founderUserId: SOLO_FOUNDER_POLICY.founderUserId,
    founderLogin: SOLO_FOUNDER_POLICY.founderLogin,
    environmentName: SOLO_FOUNDER_POLICY.environmentName,
    acknowledgementVerified: true,
    environmentContractVerified: true,
    environmentApprovalVerified: true,
    minimumReviewSeconds: SOLO_FOUNDER_POLICY.minimumReviewSeconds,
    maximumReviewSeconds: SOLO_FOUNDER_POLICY.maximumReviewSeconds,
  });
}
