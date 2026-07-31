/**
 * Redaction-safe observation state for one GSC runner invocation.
 *
 * This deliberately separates API execution from the SEO outcome: a valid
 * 2xx inspection may still reveal a critical search issue, while an HTTP or
 * transport failure means the inspection itself did not complete.
 */
export function createGscRunObservation(overrides = {}) {
  return {
    oauthConfigured: null,
    explicitlySkipped: false,
    tokenRefreshAttempted: false,
    tokenRefreshSucceeded: false,
    inspectionAttempted: 0,
    inspectionSucceeded: 0,
    inspectionFailed: 0,
    runnerFailed: false,
    ...overrides,
  };
}

function count(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function deriveGscStatuses(input = {}) {
  const observed = createGscRunObservation(input);
  const attempted = count(observed.inspectionAttempted);
  const succeeded = count(observed.inspectionSucceeded);
  const failed = count(observed.inspectionFailed);

  let access;
  let execution;
  let tokenRefresh;

  if (observed.explicitlySkipped) {
    access = observed.oauthConfigured === false ? "BLOCKED" : "NOT_APPLICABLE";
    execution = "SKIPPED";
    tokenRefresh = "SKIPPED";
  } else if (observed.oauthConfigured === false) {
    access = "BLOCKED";
    execution = "SKIPPED";
    tokenRefresh = "SKIPPED";
  } else if (observed.tokenRefreshAttempted && !observed.tokenRefreshSucceeded) {
    access = "FAIL";
    execution = "SKIPPED";
    tokenRefresh = "FAIL";
  } else if (attempted > 0) {
    access = succeeded > 0 ? "PASS" : "FAIL";
    execution = failed > 0 || succeeded < attempted || observed.runnerFailed ? "FAIL" : "PASS";
    tokenRefresh = observed.tokenRefreshSucceeded ? "PASS" : "NOT_APPLICABLE";
  } else if (observed.runnerFailed) {
    access = "NOT_APPLICABLE";
    execution = "SKIPPED";
    tokenRefresh = observed.tokenRefreshSucceeded
      ? "PASS"
      : observed.tokenRefreshAttempted
        ? "FAIL"
        : "SKIPPED";
  } else {
    access = "NOT_APPLICABLE";
    execution = "NOT_APPLICABLE";
    tokenRefresh = observed.tokenRefreshSucceeded
      ? "PASS"
      : observed.tokenRefreshAttempted
        ? "FAIL"
        : "NOT_APPLICABLE";
  }

  return {
    access,
    execution,
    tokenRefresh,
    skipped: execution === "SKIPPED",
    inspectionAttempted: attempted,
    inspectionSucceeded: succeeded,
    inspectionFailed: failed,
  };
}
