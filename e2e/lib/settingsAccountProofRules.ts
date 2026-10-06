import { CURRENT_AGREEMENT_LIST } from "../../src/constants/agreements";
import { computeAgreementGaps, type AcceptanceRow } from "../../src/lib/agreementConsent";
import {
  QUICKLOG_SMOKE_ACCOUNT_EMAIL,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
} from "./productionQuickLogFixtureRules";
import { PERFORMANCE_ORIGIN, type PublicDeploymentIdentity } from "./signedInPerformanceRules";

export const SETTINGS_PROOF_CHECKS = {
  "browser-preferences": ["start-screen-reload", "temperature-reload", "temperature-reset-reload"],
  "account-readback": [
    "own-profile-read",
    "marketing-ui-matches",
    "current-agreements-read",
    "current-agreements-ui",
  ],
  "analytics-refusal": [
    "initial-unset",
    "decline-stored",
    "refusal-reload",
    "no-analytics-requests",
  ],
} as const;
export type SettingsProofOperation = keyof typeof SETTINGS_PROOF_CHECKS;
export type SettingsProofCheck = (typeof SETTINGS_PROOF_CHECKS)[SettingsProofOperation][number];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Transient identity from the app's normal validated user response. Never a token read. */
export function settingsFixtureUserId(value: unknown): string | null {
  const user = record(value);
  return user?.email === QUICKLOG_SMOKE_ACCOUNT_EMAIL &&
    typeof user.id === "string" &&
    uuid.test(user.id)
    ? user.id
    : null;
}

export function isOwnSettingsRead(
  method: unknown,
  target: unknown,
  owner: unknown,
  table: "profiles" | "user_agreement_acceptances",
): boolean {
  if (
    method !== "GET" ||
    typeof owner !== "string" ||
    !uuid.test(owner) ||
    typeof target !== "string"
  )
    return false;
  try {
    const url = new URL(target);
    return (
      url.origin === QUICKLOG_SMOKE_BACKEND_ORIGIN &&
      url.pathname === "/rest/v1/" + table &&
      !url.hash &&
      url.searchParams.getAll("user_id").length === 1 &&
      url.searchParams.get("user_id") === "eq." + owner &&
      url.searchParams.getAll("select").length === 1 &&
      url.searchParams.get("select") ===
        (table === "profiles"
          ? "marketing_opt_in"
          : "agreement_type,version,effective_date,accepted_at")
    );
  } catch {
    return false;
  }
}

export function readMarketingPreference(value: unknown, status: unknown): boolean | null {
  const row = record(value);
  return status === 200 && typeof row?.marketing_opt_in === "boolean" ? row.marketing_opt_in : null;
}

/** Missing/invalid history cannot become a successful current-agreement read. */
export function hasCurrentSettingsAgreements(value: unknown, status: unknown): boolean {
  if (status !== 200 || !Array.isArray(value) || value.length === 0) return false;
  const rows: AcceptanceRow[] = [];
  for (const item of value) {
    const row = record(item);
    if (
      !row ||
      (row.agreement_type !== "terms" && row.agreement_type !== "privacy") ||
      typeof row.version !== "string" ||
      typeof row.effective_date !== "string" ||
      typeof row.accepted_at !== "string" ||
      !Number.isFinite(Date.parse(row.accepted_at))
    )
      return false;
    rows.push({ agreement_type: row.agreement_type, version: row.version });
  }
  return computeAgreementGaps(rows, CURRENT_AGREEMENT_LIST).length === 0;
}

export interface SettingsProofSample {
  operation: SettingsProofOperation;
  expectedSha: string;
  accountVerified: boolean;
  before: PublicDeploymentIdentity | null;
  after: PublicDeploymentIdentity | null;
  checks: Partial<Record<SettingsProofCheck, boolean>>;
  barrierPassed: boolean;
  blockedWrites: number;
  applicationErrors: number;
  elapsedMs: number | null;
}

/** Receipts are a finite projection, never a dump of account responses or errors. */
export function buildSettingsProofReceipt(value: unknown) {
  const sample = record(value);
  const operation =
    typeof sample?.operation === "string" && Object.hasOwn(SETTINGS_PROOF_CHECKS, sample.operation)
      ? (sample.operation as SettingsProofOperation)
      : null;
  const checks = record(sample?.checks);
  const expectedSha =
    typeof sample?.expectedSha === "string" && /^[0-9a-f]{40}$/.test(sample.expectedSha)
      ? sample.expectedSha
      : null;
  const before = record(sample?.before);
  const after = record(sample?.after);
  const receipt = {
    operation,
    status: "BLOCKED" as "PASS" | "FAIL" | "BLOCKED" | "NOT_MEASURED",
    reason: "precondition_unproved",
    expectedSha,
    observedSha:
      typeof after?.commit === "string" && /^[0-9a-f]{40}$/.test(after.commit)
        ? after.commit
        : null,
    passedChecks: operation
      ? SETTINGS_PROOF_CHECKS[operation].filter((check) => checks?.[check] === true)
      : [],
    elapsedMs: null as number | null,
    scope: "fixture-account-read-only-and-disposable-browser-storage" as const,
    backendMutationAcceptance: "NOT_MEASURED" as const,
  };
  if (!operation || !expectedSha || sample?.accountVerified !== true) return receipt;
  if (
    !before ||
    !after ||
    before.origin !== PERFORMANCE_ORIGIN ||
    after.origin !== PERFORMANCE_ORIGIN ||
    before.dirty !== false ||
    after.dirty !== false ||
    before.commit !== expectedSha ||
    after.commit !== expectedSha
  )
    return { ...receipt, reason: "deployment_unproved_or_changed" };
  if (sample.barrierPassed !== true || sample.blockedWrites !== 0)
    return { ...receipt, reason: "read_only_barrier_failed" };
  if (
    typeof sample.applicationErrors !== "number" ||
    !Number.isInteger(sample.applicationErrors) ||
    sample.applicationErrors < 0
  )
    return { ...receipt, reason: "application_error_observation_missing" };
  if (sample.applicationErrors > 0)
    return { ...receipt, status: "FAIL" as const, reason: "application_runtime_error" };
  if (receipt.passedChecks.length !== SETTINGS_PROOF_CHECKS[operation].length)
    return { ...receipt, status: "FAIL" as const, reason: "required_check_missing" };
  if (
    typeof sample.elapsedMs !== "number" ||
    !Number.isFinite(sample.elapsedMs) ||
    sample.elapsedMs < 0
  )
    return { ...receipt, status: "NOT_MEASURED" as const, reason: "invalid_elapsed_clock" };
  return {
    ...receipt,
    status: "PASS" as const,
    reason: "checks_confirmed",
    elapsedMs: sample.elapsedMs,
  };
}
