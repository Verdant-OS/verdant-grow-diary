import {
  QUICKLOG_SMOKE_ACCOUNT_EMAIL,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
} from "./productionQuickLogFixtureRules";
import { PERFORMANCE_ORIGIN, type PublicDeploymentIdentity } from "./signedInPerformanceRules";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const queueSelect =
  "id,grow_id,tent_id,plant_id,source,action_type,target_metric,target_device,suggested_change,reason,risk_level,status,created_at";
const statuses = [
  "pending_approval",
  "simulated",
  "approved",
  "rejected",
  "completed",
  "cancelled",
] as const;
export type ReadonlyAction = { id: string; status: (typeof statuses)[number]; title: string };

export const ACTIONS_READONLY_CHECKS = [
  "owned-active-grow",
  "initial-successful-read",
  "initial-ui-readback",
  "approval-required-framing",
  "refresh-successful-read",
  "refresh-ui-readback",
] as const;
export type ActionsReadonlyCheck = (typeof ACTIONS_READONLY_CHECKS)[number];

/** Transient normal app identity only. Never reads or exports a credential. */
export function actionsFixtureUserId(value: unknown): string | null {
  const user = record(value);
  return user?.email === QUICKLOG_SMOKE_ACCOUNT_EMAIL &&
    typeof user.id === "string" &&
    uuid.test(user.id)
    ? user.id
    : null;
}

function exactRead(
  method: unknown,
  target: unknown,
  table: string,
  expected: Record<string, string>,
) {
  if (method !== "GET" || typeof target !== "string") return false;
  try {
    const url = new URL(target);
    return (
      url.origin === QUICKLOG_SMOKE_BACKEND_ORIGIN &&
      url.pathname === "/rest/v1/" + table &&
      !url.hash &&
      [...url.searchParams.keys()].length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([key, value]) =>
          url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === value,
      )
    );
  } catch {
    return false;
  }
}

/** Exact existing GrowsProvider query, authenticated via the unchanged barrier. */
export function isActionsGrowRead(method: unknown, target: unknown): boolean {
  return exactRead(method, target, "grows", {
    select: "*",
    is_archived: "eq.false",
    order: "created_at.desc",
  });
}

/** Every returned grow must positively belong to the fixture. Never drops foreign
 * rows and then labels the surviving subset safe. Id is transient, not a receipt.
 */
export function chooseOwnedActionsGrow(
  value: unknown,
  status: unknown,
  owner: unknown,
): string | null {
  if (
    status !== 200 ||
    typeof owner !== "string" ||
    !uuid.test(owner) ||
    !Array.isArray(value) ||
    value.length === 0
  )
    return null;
  const ids: string[] = [];
  for (const item of value) {
    const row = record(item);
    if (
      !row ||
      typeof row.id !== "string" ||
      !uuid.test(row.id) ||
      row.user_id !== owner ||
      row.is_archived !== false ||
      ids.includes(row.id)
    )
      return null;
    ids.push(row.id);
  }
  return ids.sort()[0] ?? null;
}

export function isScopedActionsRead(method: unknown, target: unknown, growId: unknown): boolean {
  return (
    typeof growId === "string" &&
    uuid.test(growId) &&
    exactRead(method, target, "action_queue", {
      select: queueSelect,
      grow_id: "eq." + growId,
      order: "created_at.desc",
      limit: "100",
    })
  );
}

/** Successful empty is distinct from HTTP failure, null or invalid rows.
 * Raw reasons, device fields and suggested changes never enter this projection.
 */
export function readScopedActions(
  value: unknown,
  status: unknown,
  growId: unknown,
): ReadonlyAction[] | null {
  if (
    status !== 200 ||
    typeof growId !== "string" ||
    !uuid.test(growId) ||
    !Array.isArray(value) ||
    value.length > 100
  )
    return null;
  const rows: ReadonlyAction[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const row = record(item);
    if (
      !row ||
      typeof row.id !== "string" ||
      !uuid.test(row.id) ||
      ids.has(row.id) ||
      row.grow_id !== growId ||
      !statuses.some((s) => s === row.status) ||
      typeof row.action_type !== "string" ||
      !row.action_type.trim() ||
      typeof row.created_at !== "string" ||
      !Number.isFinite(Date.parse(row.created_at))
    )
      return null;
    ids.add(row.id);
    rows.push({
      id: row.id,
      status: row.status as ReadonlyAction["status"],
      title: row.action_type,
    });
  }
  return rows;
}

export interface ActionsReadonlySample {
  expectedSha: string;
  accountVerified: boolean;
  before: PublicDeploymentIdentity | null;
  after: PublicDeploymentIdentity | null;
  checks: Partial<Record<ActionsReadonlyCheck, boolean>>;
  initialCount: number | null;
  refreshedCount: number | null;
  barrierPassed: boolean;
  blockedWrites: number;
  applicationErrors: number;
  elapsedMs: number | null;
}

/** Fixed finite receipt. No grow/action/account ids or action content exported. */
export function buildActionsReadonlyReceipt(value: unknown) {
  const sample = record(value),
    checks = record(sample?.checks);
  const expectedSha =
    typeof sample?.expectedSha === "string" && /^[0-9a-f]{40}$/.test(sample.expectedSha)
      ? sample.expectedSha
      : null;
  const before = record(sample?.before),
    after = record(sample?.after);
  const count = (v: unknown): number | null =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : null;
  const initialCount = count(sample?.initialCount),
    refreshedCount = count(sample?.refreshedCount);
  const receipt = {
    status: "BLOCKED" as "PASS" | "FAIL" | "BLOCKED" | "NOT_MEASURED",
    reason: "fixture_scope_unproved",
    expectedSha,
    observedSha:
      typeof after?.commit === "string" && /^[0-9a-f]{40}$/.test(after.commit)
        ? after.commit
        : null,
    passedChecks: ACTIONS_READONLY_CHECKS.filter((check) => checks?.[check] === true),
    initialCount,
    refreshedCount,
    readState:
      initialCount === null
        ? "unproved"
        : initialCount === 0
          ? "successful-empty"
          : "successful-rows",
    refreshedReadState:
      refreshedCount === null
        ? "unproved"
        : refreshedCount === 0
          ? "successful-empty"
          : "successful-rows",
    elapsedMs: null as number | null,
    scope: "fixture-owned-actions-read-and-refresh" as const,
    transitionAcceptance: "NOT_MEASURED" as const,
    deviceAcceptance: "NOT_MEASURED" as const,
    backendSecurityAcceptance: "NOT_MEASURED" as const,
  };
  if (
    !expectedSha ||
    sample?.accountVerified !== true ||
    checks?.["owned-active-grow"] !== true ||
    initialCount === null ||
    refreshedCount === null
  )
    return receipt;
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
    return { ...receipt, reason: "runtime_observation_missing" };
  if (sample.applicationErrors > 0)
    return { ...receipt, status: "FAIL" as const, reason: "application_runtime_error" };
  if (receipt.passedChecks.length !== ACTIONS_READONLY_CHECKS.length)
    return { ...receipt, status: "FAIL" as const, reason: "readback_missing" };
  if (
    typeof sample.elapsedMs !== "number" ||
    !Number.isFinite(sample.elapsedMs) ||
    sample.elapsedMs < 0
  )
    return { ...receipt, status: "NOT_MEASURED" as const, reason: "invalid_elapsed_clock" };
  return {
    ...receipt,
    status: "PASS" as const,
    reason: "read_and_refresh_confirmed",
    elapsedMs: sample.elapsedMs,
  };
}
