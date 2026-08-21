/**
 * Shared signup-attribution CTA readiness contract (Node-safe).
 * Consumed by assert scripts and mirrored by src/lib for product/tests.
 */

export const FORWARD_REPAIR_MIGRATION_FILENAME =
  "20260813030000_signup_acquisition_forward_repair.sql";

export const FAILURE_SAFE_MIGRATION_FILENAME =
  "20260821150000_signup_acquisition_failure_safe_attribution.sql";

export const FORWARD_REPAIR_MIGRATION_SHA256 =
  "6c002ab676218c32c27e41e7a8e90ff4f452c41d7edb446b0fcb950b93d3deba";

export const FORWARD_REPAIR_LEDGER_VERSION = "20260813030000";

export const FORWARD_REPAIR_LEDGER_NAMES = Object.freeze([
  "signup_acquisition_forward_repair",
  "20260813030000_signup_acquisition_forward_repair",
]);

const FAILURE_SAFE_MARKERS = Object.freeze({
  exceptionGuard: /EXCEPTION\s+WHEN\s+OTHERS\s+THEN/i,
  raiseLog:
    /RAISE\s+LOG[\s\S]{0,120}signup_acquisition_attributions write failed/i,
  readinessRpc:
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.signup_acquisition_readiness_operator_snapshot\s*\(/i,
  attributionInsert: /INSERT\s+INTO\s+public\.signup_acquisition_attributions/i,
});

/**
 * @param {{
 *   forwardRepairPresent: boolean,
 *   forwardRepairSha256: string | null,
 *   failureSafePresent: boolean,
 *   failureSafeSql: string | null,
 *   attributedCtaFlagEnabled: boolean,
 * }} evidence
 */
export function evaluateSignupAttributionStaticReadiness(evidence) {
  const sql = evidence.failureSafeSql ?? "";
  const hasAttributionInsert = FAILURE_SAFE_MARKERS.attributionInsert.test(sql);
  const hasAttributionRaiseLog = FAILURE_SAFE_MARKERS.raiseLog.test(sql);
  const hasException = FAILURE_SAFE_MARKERS.exceptionGuard.test(sql);
  const checks = [
    {
      id: "forward_repair_migration_present",
      pass: evidence.forwardRepairPresent === true,
      detail: evidence.forwardRepairPresent
        ? `${FORWARD_REPAIR_MIGRATION_FILENAME} present`
        : `${FORWARD_REPAIR_MIGRATION_FILENAME} missing`,
    },
    {
      id: "forward_repair_sha256_match",
      pass:
        !!evidence.forwardRepairSha256 &&
        evidence.forwardRepairSha256.toLowerCase() === FORWARD_REPAIR_MIGRATION_SHA256,
      detail: evidence.forwardRepairSha256
        ? `sha256=${evidence.forwardRepairSha256.toLowerCase()}`
        : "sha256 unavailable",
    },
    {
      id: "failure_safe_migration_present",
      pass: evidence.failureSafePresent === true,
      detail: evidence.failureSafePresent
        ? `${FAILURE_SAFE_MIGRATION_FILENAME} present`
        : `${FAILURE_SAFE_MIGRATION_FILENAME} missing`,
    },
    {
      id: "failure_safe_exception_guard",
      pass: hasAttributionInsert && hasException && hasAttributionRaiseLog,
      detail:
        "attribution INSERT must be failure-safe (EXCEPTION WHEN OTHERS + attribution RAISE LOG)",
    },
    {
      id: "failure_safe_raise_log",
      pass: hasAttributionRaiseLog,
      detail: "attribution failure must RAISE LOG (not silent swallow)",
    },
    {
      id: "readiness_rpc_present",
      pass: FAILURE_SAFE_MARKERS.readinessRpc.test(sql),
      detail: "signup_acquisition_readiness_operator_snapshot must be defined",
    },
    {
      id: "attributed_cta_flag_enabled",
      pass: evidence.attributedCtaFlagEnabled === true,
      detail:
        "ATTRIBUTED_MARKETING_SIGNUP_CTA_ENABLED must be true only with the guard present",
    },
  ];

  const failedChecks = checks.filter((c) => !c.pass).map((c) => c.id);
  const ready = failedChecks.length === 0;
  return {
    ready,
    status: ready ? "ready" : "not_ready",
    marketingSignupCtaEnabled: ready && evidence.attributedCtaFlagEnabled === true,
    checks,
    failedChecks,
  };
}
