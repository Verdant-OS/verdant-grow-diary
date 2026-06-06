/**
 * One-Tent Proof Record export rules.
 *
 * Pure helpers for assembling, redacting, serializing, and naming a
 * downloadable Proof Record that captures one manual end-to-end loop:
 *   grow → tent → plant → manual reading → snapshot → alert →
 *   Action Queue → completion → follow-up diary entry → timeline proof.
 *
 * Safe-by-Design:
 *  - No I/O, no React, no DOM, no Supabase, no Edge Functions.
 *  - No fetch, no rpc, no functions.invoke, no service_role.
 *  - No sensor / alert / Action Queue writes — review only.
 *  - Never fabricates data. Missing fields stay missing.
 *  - Strips internal/private fields: user_id, tokens, service role keys,
 *    bridge tokens, auth headers.
 *  - Source labels are preserved verbatim (manual/live/csv/demo/stale/invalid).
 */

export const ONE_TENT_PROOF_RECORD_KIND = "verdant.one-tent-proof-record" as const;
export const ONE_TENT_PROOF_RECORD_VERSION = 1 as const;

export type ProofSourceLabel =
  | "manual"
  | "live"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

const ALLOWED_SOURCE_LABELS: ReadonlyArray<ProofSourceLabel> = [
  "manual",
  "live",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
];

export function isProofSourceLabel(v: unknown): v is ProofSourceLabel {
  return typeof v === "string" && (ALLOWED_SOURCE_LABELS as readonly string[]).includes(v);
}

/** Fields that must never appear in an exported proof record. */
export const REDACTED_FIELD_NAMES: ReadonlyArray<string> = [
  "user_id",
  "userId",
  "owner_id",
  "ownerId",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "service_role",
  "serviceRole",
  "service_role_key",
  "serviceRoleKey",
  "bridge_token",
  "bridgeToken",
  "auth_header",
  "authHeader",
  "authorization",
  "Authorization",
  "apiKey",
  "api_key",
];

const REDACTED_SET = new Set(REDACTED_FIELD_NAMES.map((s) => s.toLowerCase()));

export interface ProofReadingInput {
  metric?: string;
  value?: number | string;
  unit?: string;
  capturedAt?: string;
  /** Source label as rendered in the UI (manual/live/csv/demo/stale/invalid). */
  sourceLabel?: ProofSourceLabel;
  routeObserved?: string;
}

export interface ProofTargetInput {
  metric?: string;
  originalValue?: number | string;
  temporaryValue?: number | string;
  restored?: boolean;
}

export interface ProofAlertInput {
  id?: string;
  metric?: string;
  severity?: string;
  createdAt?: string;
}

export interface ProofActionInput {
  id?: string;
  status?: string;
  completionResult?: string;
  completedAt?: string;
}

export interface ProofFollowupInput {
  diaryEntryId?: string;
  timelineChipVisible?: boolean;
  actionDetailLinkVisible?: boolean;
}

export interface ProofScopeInput {
  growId?: string;
  growName?: string;
  tentId?: string;
  tentName?: string;
  plantId?: string;
  plantName?: string;
  stage?: string;
}

export interface ProofRecordInput {
  scope?: ProofScopeInput;
  reading?: ProofReadingInput;
  snapshotRoute?: string;
  target?: ProofTargetInput;
  alert?: ProofAlertInput;
  action?: ProofActionInput;
  followup?: ProofFollowupInput;
  uxFrictionNotes?: string;
  /** ISO 8601 timestamp when the record was assembled. */
  assembledAt?: string;
  /** Extra unstructured operator notes. */
  notes?: string;
}

export interface ProofRecord {
  kind: typeof ONE_TENT_PROOF_RECORD_KIND;
  version: typeof ONE_TENT_PROOF_RECORD_VERSION;
  reviewOnly: true;
  noLiveDataPromise: string;
  assembledAt: string | null;
  scope: Required<ProofScopeInput>;
  reading: {
    metric: string | null;
    value: number | string | null;
    unit: string | null;
    capturedAt: string | null;
    sourceLabel: ProofSourceLabel | null;
    routeObserved: string | null;
  };
  snapshotRoute: string | null;
  target: {
    metric: string | null;
    originalValue: number | string | null;
    temporaryValue: number | string | null;
    restored: boolean | null;
  };
  alert: {
    id: string | null;
    metric: string | null;
    severity: string | null;
    createdAt: string | null;
  };
  action: {
    id: string | null;
    status: string | null;
    completionResult: string | null;
    completedAt: string | null;
  };
  followup: {
    diaryEntryId: string | null;
    timelineChipVisible: boolean | null;
    actionDetailLinkVisible: boolean | null;
  };
  uxFrictionNotes: string | null;
  notes: string | null;
}

function s(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}
function n(v: unknown): number | string | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const str = s(v);
  return str;
}
function b(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function src(v: unknown): ProofSourceLabel | null {
  return isProofSourceLabel(v) ? v : null;
}

/**
 * Deep-clone JSON-compatible input while dropping any key whose name matches
 * the redacted-field denylist (case-insensitive). Used as a defensive pass
 * over operator-pasted blobs before they enter the record.
 */
export function redactRecordInput<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactRecordInput(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_SET.has(k.toLowerCase())) continue;
      out[k] = redactRecordInput(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Build a canonical ProofRecord from operator-provided inputs.
 *
 * - Missing fields render as `null`, never fabricated.
 * - Source labels are preserved verbatim from the allowed enum.
 * - Redaction is applied to the input shape as a second safety net.
 */
export function buildOneTentProofRecord(input: ProofRecordInput | undefined | null): ProofRecord {
  const safe = redactRecordInput(input ?? {}) as ProofRecordInput;
  const scope = safe.scope ?? {};
  const reading = safe.reading ?? {};
  const target = safe.target ?? {};
  const alert = safe.alert ?? {};
  const action = safe.action ?? {};
  const followup = safe.followup ?? {};
  return {
    kind: ONE_TENT_PROOF_RECORD_KIND,
    version: ONE_TENT_PROOF_RECORD_VERSION,
    reviewOnly: true,
    noLiveDataPromise:
      "Review only. No live data unless explicitly source-labeled 'live'.",
    assembledAt: s(safe.assembledAt),
    scope: {
      growId: s(scope.growId) ?? ("" as string),
      growName: s(scope.growName) ?? ("" as string),
      tentId: s(scope.tentId) ?? ("" as string),
      tentName: s(scope.tentName) ?? ("" as string),
      plantId: s(scope.plantId) ?? ("" as string),
      plantName: s(scope.plantName) ?? ("" as string),
      stage: s(scope.stage) ?? ("" as string),
    },
    reading: {
      metric: s(reading.metric),
      value: n(reading.value),
      unit: s(reading.unit),
      capturedAt: s(reading.capturedAt),
      sourceLabel: src(reading.sourceLabel),
      routeObserved: s(reading.routeObserved),
    },
    snapshotRoute: s(safe.snapshotRoute),
    target: {
      metric: s(target.metric),
      originalValue: n(target.originalValue),
      temporaryValue: n(target.temporaryValue),
      restored: b(target.restored),
    },
    alert: {
      id: s(alert.id),
      metric: s(alert.metric),
      severity: s(alert.severity),
      createdAt: s(alert.createdAt),
    },
    action: {
      id: s(action.id),
      status: s(action.status),
      completionResult: s(action.completionResult),
      completedAt: s(action.completedAt),
    },
    followup: {
      diaryEntryId: s(followup.diaryEntryId),
      timelineChipVisible: b(followup.timelineChipVisible),
      actionDetailLinkVisible: b(followup.actionDetailLinkVisible),
    },
    uxFrictionNotes: s(safe.uxFrictionNotes),
    notes: s(safe.notes),
  };
}

export function serializeProofRecordToJson(record: ProofRecord): string {
  return JSON.stringify(record, null, 2) + "\n";
}

/** YYYYMMDD-HHMMSS in UTC. */
export function formatProofRecordTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

export function buildProofRecordFilename(date: Date): string {
  return `verdant-one-tent-proof-record-${formatProofRecordTimestamp(date)}.json`;
}
