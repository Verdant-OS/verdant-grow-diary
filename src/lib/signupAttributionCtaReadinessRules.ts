/**
 * Pure rules for marketing attributed-signup CTA readiness.
 *
 * Secret-free CI evaluates the filesystem contract via
 * scripts/assert-signup-attribution-cta-readiness.mjs. A protected live job
 * (optional) confirms the forward-repair ledger row when a DB URL is present.
 *
 * Product rule: attributed marketing CTAs on `/` and `/welcome` may be treated
 * as enabled only when the failure-safe attribution guard migration is present
 * in-repo (so a missing analytics table cannot 500 account creation).
 */

export {
  FAILURE_SAFE_MIGRATION_FILENAME,
  FORWARD_REPAIR_LEDGER_NAMES,
  FORWARD_REPAIR_LEDGER_VERSION,
  FORWARD_REPAIR_MIGRATION_FILENAME,
  FORWARD_REPAIR_MIGRATION_SHA256,
  evaluateSignupAttributionStaticReadiness,
} from "../../scripts/lib/signupAttributionCtaReadiness.mjs";

/**
 * Product flag: attributed marketing signup CTAs are enabled in this build.
 * Locked true only while the failure-safe migration remains in-repo; CI and
 * unit tests fail closed if the guard markers disappear.
 */
export const ATTRIBUTED_MARKETING_SIGNUP_CTA_ENABLED = true as const;

export type SignupAttributionStaticCheckId =
  | "forward_repair_migration_present"
  | "forward_repair_sha256_match"
  | "failure_safe_migration_present"
  | "failure_safe_exception_guard"
  | "failure_safe_raise_log"
  | "readiness_rpc_present"
  | "attributed_cta_flag_enabled";

export type SignupAttributionStaticCheck = {
  id: SignupAttributionStaticCheckId;
  pass: boolean;
  detail: string;
};

export type SignupAttributionStaticReadiness = {
  ready: boolean;
  status: "ready" | "not_ready";
  marketingSignupCtaEnabled: boolean;
  checks: readonly SignupAttributionStaticCheck[];
  failedChecks: readonly SignupAttributionStaticCheckId[];
};

export type SignupAttributionStaticEvidence = {
  forwardRepairPresent: boolean;
  forwardRepairSha256: string | null;
  failureSafePresent: boolean;
  failureSafeSql: string | null;
  attributedCtaFlagEnabled: boolean;
};

/** Parse the operator readiness RPC payload into a typed, PII-free view. */
export type SignupAcquisitionReadinessSnapshot = {
  ok: boolean;
  reason: string | null;
  ready: boolean;
  status: "ready" | "not_ready" | "unavailable";
  generatedAt: string | null;
  checks: Readonly<Record<string, boolean>>;
  failedChecks: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseSignupAcquisitionReadinessSnapshot(
  raw: unknown,
): SignupAcquisitionReadinessSnapshot {
  if (!isRecord(raw)) {
    return {
      ok: false,
      reason: "unknown_response",
      ready: false,
      status: "unavailable",
      generatedAt: null,
      checks: {},
      failedChecks: ["unknown_response"],
    };
  }

  if (raw.ok === false) {
    const reason = typeof raw.reason === "string" ? raw.reason : "unknown_response";
    return {
      ok: false,
      reason,
      ready: false,
      status: "unavailable",
      generatedAt: null,
      checks: {},
      failedChecks: [reason],
    };
  }

  const checksRaw = isRecord(raw.checks) ? raw.checks : {};
  const checks: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(checksRaw)) {
    checks[key] = value === true;
  }

  const failedChecks = Array.isArray(raw.failed_checks)
    ? raw.failed_checks.filter((v): v is string => typeof v === "string")
    : Object.entries(checks)
        .filter(([, pass]) => !pass)
        .map(([id]) => id);

  const ready = raw.ready === true && failedChecks.length === 0;
  return {
    ok: true,
    reason: null,
    ready,
    status: ready ? "ready" : "not_ready",
    generatedAt: typeof raw.generated_at === "string" ? raw.generated_at : null,
    checks,
    failedChecks,
  };
}
