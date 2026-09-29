export const PERFORMANCE_ORIGIN = "https://verdantgrowdiary.com";
export const PERFORMANCE_OPERATIONS = [
  "dashboard-ready",
  "timeline-ready",
  "sensors-ready",
  "quicklog-save-confirmed",
] as const;
export type PerformanceOperation = (typeof PERFORMANCE_OPERATIONS)[number];
export interface PublicDeploymentIdentity {
  origin: string;
  commit: string;
  dirty: false;
}
export interface PerformanceContext {
  operation: PerformanceOperation;
  origin: string;
  expectedSha: string;
  fixtureVerified: boolean;
  accountVerified?: boolean;
}
export interface PerformanceSample extends PerformanceContext {
  before: PublicDeploymentIdentity | null;
  after: PublicDeploymentIdentity | null;
  startedMs: number | null;
  finishedMs: number | null;
  confirmed: boolean | null;
}
export interface PerformanceReceipt {
  operation: PerformanceOperation | null;
  status: "PASS" | "FAIL" | "BLOCKED" | "NOT_MEASURED";
  reason: string;
  origin: string | null;
  expectedSha: string | null;
  observedSha: string | null;
  elapsedMs: number | null;
  metric: "navigation-to-control-ready" | "save-click-to-confirmation" | null;
  performanceBudgetVerdict: "NOT_MEASURED";
  verification: "owned-active-fixture" | "fixture-account-read-only" | null;
}
const isSha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const isOperation = (value: unknown): value is PerformanceOperation =>
  PERFORMANCE_OPERATIONS.some((item) => item === value);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;

export function readPublicDeploymentIdentity(
  value: unknown,
  responseUrl: string,
  status: number,
): PublicDeploymentIdentity | null {
  const body = record(value);
  if (responseUrl !== PERFORMANCE_ORIGIN + "/version.json" || status !== 200) return null;
  if (!body || !isSha(body.commit) || body.dirty !== false) return null;
  return { origin: PERFORMANCE_ORIGIN, commit: body.commit, dirty: false };
}

export function performanceContextIssue(value: unknown): string | null {
  const context = record(value);
  if (!context || !isOperation(context.operation)) return "operation_missing";
  if (context.origin !== PERFORMANCE_ORIGIN) return "production_origin_required";
  if (!isSha(context.expectedSha)) return "expected_sha_required";
  if (
    context.fixtureVerified !== true &&
    (context.operation === "quicklog-save-confirmed" || context.accountVerified !== true)
  )
    return "owned_active_fixture_required";
  return null;
}

export function buildPerformanceReceipt(value: unknown): PerformanceReceipt {
  const sample = record(value);
  const operation = sample && isOperation(sample.operation) ? sample.operation : null;
  const before = record(sample?.before);
  const after = record(sample?.after);
  const receipt: PerformanceReceipt = {
    operation,
    status: "BLOCKED",
    reason: performanceContextIssue(value) ?? "deployment_identity_missing",
    origin: sample?.origin === PERFORMANCE_ORIGIN ? PERFORMANCE_ORIGIN : null,
    expectedSha: isSha(sample?.expectedSha) ? sample.expectedSha : null,
    observedSha: isSha(after?.commit) ? after.commit : null,
    elapsedMs: null,
    metric: operation
      ? operation === "quicklog-save-confirmed"
        ? "save-click-to-confirmation"
        : "navigation-to-control-ready"
      : null,
    performanceBudgetVerdict: "NOT_MEASURED",
    verification:
      sample?.fixtureVerified === true
        ? "owned-active-fixture"
        : operation !== "quicklog-save-confirmed" && sample?.accountVerified === true
          ? "fixture-account-read-only"
          : null,
  };
  if (performanceContextIssue(value)) return receipt;
  if (
    !before ||
    !after ||
    before.origin !== PERFORMANCE_ORIGIN ||
    after.origin !== PERFORMANCE_ORIGIN ||
    before.dirty !== false ||
    after.dirty !== false ||
    !isSha(before.commit) ||
    !isSha(after.commit)
  )
    return receipt;
  if (before.commit !== sample?.expectedSha || after.commit !== sample?.expectedSha)
    return { ...receipt, reason: "deployment_changed_or_mismatched" };
  const start = sample?.startedMs;
  const finish = sample?.finishedMs;
  if (
    typeof start !== "number" ||
    typeof finish !== "number" ||
    !Number.isFinite(start) ||
    !Number.isFinite(finish) ||
    start < 0 ||
    finish < start ||
    !Number.isFinite(finish - start)
  )
    return { ...receipt, status: "NOT_MEASURED", reason: "invalid_monotonic_clock" };
  if (sample?.confirmed !== true)
    return {
      ...receipt,
      status: sample?.confirmed === false ? "FAIL" : "NOT_MEASURED",
      reason: sample?.confirmed === false ? "operation_not_confirmed" : "operation_not_run",
    };
  return { ...receipt, status: "PASS", reason: "measurement_recorded", elapsedMs: finish - start };
}
