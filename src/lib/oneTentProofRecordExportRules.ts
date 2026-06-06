/**
 * One-Tent Proof Record export rules.
 *
 * Pure helpers for assembling, redacting, serializing, and naming a
 * downloadable Operator Self-Report covering one manual end-to-end loop:
 *   grow → tent → plant → Quick Log → Timeline → Sensor Snapshot →
 *   AI Doctor → Alert → Approval-Required Action Queue → follow-up.
 *
 * Safe-by-Design:
 *  - No I/O, no React, no DOM, no Supabase, no Edge Functions.
 *  - No fetch, no rpc, no functions.invoke, no service_role.
 *  - No sensor / alert / Action Queue writes — review only.
 *  - Never fabricates data. Missing fields stay missing (null).
 *  - Strips internal/private fields: user_id, tokens, service role keys,
 *    bridge tokens, auth headers.
 *  - Source labels are preserved verbatim from ALLOWED_SOURCE_LABELS.
 *  - The exported record self-identifies as `unverified: true` via the
 *    computed `integrity` block — partners must never mistake a self-report
 *    for verified loop traversal.
 */
import { APP_ROUTES } from "@/lib/appRouteManifest";

export const ONE_TENT_PROOF_RECORD_KIND = "verdant.one-tent-proof-record" as const;
export const ONE_TENT_PROOF_RECORD_VERSION = 2 as const;

export type ProofSourceLabel =
  | "manual"
  | "live"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

export const ALLOWED_SOURCE_LABELS: ReadonlyArray<ProofSourceLabel> = [
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
  sourceLabel?: ProofSourceLabel;
  routeObserved?: string;
}

export interface ProofTargetInput {
  metric?: string;
  originalValue?: number | string;
  temporaryValue?: number | string;
  restored?: boolean;
  restoredAt?: string;
  restoreDiaryEntryId?: string;
}

export interface ProofAlertInput {
  id?: string;
  metric?: string;
  severity?: string;
  createdAt?: string;
}

export interface ProofApprovalGateInput {
  requiredObserved?: boolean;
  approvedAt?: string;
}

export interface ProofActionInput {
  id?: string;
  status?: string;
  completionResult?: string;
  completedAt?: string;
  linkedAlertId?: string;
  approvalGate?: ProofApprovalGateInput;
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

export interface ProofQuickLogInput {
  diaryEntryId?: string;
  actionType?: string;
  photoAttached?: boolean;
}

export interface ProofTimelineInput {
  rowId?: string;
  routeObserved?: string;
  chipVisible?: boolean;
}

export interface ProofAiDoctorInput {
  sessionId?: string;
  confidence?: string;
  riskLevel?: string;
  missingInfoPresent?: boolean;
  doNotDoPresent?: boolean;
}

export interface ProofRecordInput {
  scope?: ProofScopeInput;
  quickLog?: ProofQuickLogInput;
  timeline?: ProofTimelineInput;
  aiDoctor?: ProofAiDoctorInput;
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

export interface ProofIntegrity {
  /** Always true — this surface only produces unverified self-reports. */
  unverified: true;
  /** Required field paths that are still null. Sorted ascending. */
  missingFields: string[];
  /**
   * `true` when every present timestamp pair is in chronological order,
   * `false` when any later step's timestamp predates an earlier step,
   * `null` when no two comparable timestamps are present.
   */
  chronologyValid: boolean | null;
  /**
   * `true` when every provided route string matches an `APP_ROUTES` pattern
   * (with `:param` segments allowed). `false` when any provided route is
   * not registered. `null` when no route strings were provided.
   */
  routesValid: boolean | null;
}

export interface ProofRecord {
  kind: typeof ONE_TENT_PROOF_RECORD_KIND;
  version: typeof ONE_TENT_PROOF_RECORD_VERSION;
  reviewOnly: true;
  noLiveDataPromise: string;
  assembledAt: string | null;
  scope: {
    growId: string | null;
    growName: string | null;
    tentId: string | null;
    tentName: string | null;
    plantId: string | null;
    plantName: string | null;
    stage: string | null;
  };
  quickLog: {
    diaryEntryId: string | null;
    actionType: string | null;
    photoAttached: boolean | null;
  };
  timeline: {
    rowId: string | null;
    routeObserved: string | null;
    chipVisible: boolean | null;
  };
  reading: {
    metric: string | null;
    value: number | string | null;
    unit: string | null;
    capturedAt: string | null;
    sourceLabel: ProofSourceLabel | null;
    routeObserved: string | null;
  };
  snapshotRoute: string | null;
  aiDoctor: {
    sessionId: string | null;
    confidence: string | null;
    riskLevel: string | null;
    missingInfoPresent: boolean | null;
    doNotDoPresent: boolean | null;
  };
  target: {
    metric: string | null;
    originalValue: number | string | null;
    temporaryValue: number | string | null;
    restored: boolean | null;
    restoredAt: string | null;
    restoreDiaryEntryId: string | null;
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
    linkedAlertId: string | null;
    approvalGate: {
      requiredObserved: boolean | null;
      approvedAt: string | null;
    };
  };
  followup: {
    diaryEntryId: string | null;
    timelineChipVisible: boolean | null;
    actionDetailLinkVisible: boolean | null;
  };
  uxFrictionNotes: string | null;
  notes: string | null;
  integrity: ProofIntegrity;
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
 * the redacted-field denylist (case-insensitive).
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

// ---------------------------------------------------------------------------
// Integrity helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Required loop-evidence field paths. Order is irrelevant; the integrity
 * block always reports missing entries sorted ascending for deterministic
 * snapshots.
 */
const REQUIRED_EVIDENCE_PATHS: ReadonlyArray<string> = [
  "action.id",
  "aiDoctor.sessionId",
  "alert.id",
  "followup.diaryEntryId",
  "quickLog.diaryEntryId",
  "reading.sourceLabel",
  "scope.growId",
  "scope.plantId",
  "scope.tentId",
  "timeline.rowId",
];

/** Loop-step evidence fields used by the empty-record gate (subset). */
const LOOP_STEP_EVIDENCE_PATHS: ReadonlyArray<string> = [
  "action.id",
  "aiDoctor.sessionId",
  "alert.id",
  "followup.diaryEntryId",
  "quickLog.diaryEntryId",
  "reading.sourceLabel",
  "timeline.rowId",
];

function getByPath(record: ProofRecord, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = record;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function computeMissingFields(record: ProofRecord): string[] {
  const missing = REQUIRED_EVIDENCE_PATHS.filter(
    (p) => getByPath(record, p) === null,
  );
  return [...missing].sort();
}

/**
 * Compare two ISO timestamps. Returns `0` if either side is missing or
 * unparseable, `-1`/`1`/`0` otherwise (and `0` is treated as "no signal").
 */
function compareIso(a: string | null, c: string | null): number | null {
  if (!a || !c) return null;
  const ta = Date.parse(a);
  const tc = Date.parse(c);
  if (!Number.isFinite(ta) || !Number.isFinite(tc)) return null;
  if (ta === tc) return 0;
  return ta < tc ? -1 : 1;
}

function computeChronologyValid(record: ProofRecord): boolean | null {
  // Ordered timeline of loop timestamps. Any two present, comparable entries
  // must be in non-decreasing order; otherwise chronology is invalid.
  const chain: ReadonlyArray<string | null> = [
    record.reading.capturedAt,
    record.alert.createdAt,
    record.action.approvalGate.approvedAt,
    record.action.completedAt,
    record.target.restoredAt,
  ];

  let comparisons = 0;
  for (let i = 0; i < chain.length; i++) {
    for (let j = i + 1; j < chain.length; j++) {
      const cmp = compareIso(chain[i], chain[j]);
      if (cmp === null) continue;
      comparisons += 1;
      if (cmp > 0) return false;
    }
  }
  return comparisons === 0 ? null : true;
}

/**
 * Build a per-pattern regex from each registered `APP_ROUTES` path.
 * `:param` segments accept any non-`/` value. Query/hash stripped from the
 * candidate href before matching.
 */
function buildRoutePatternMatchers(): RegExp[] {
  return APP_ROUTES.map((r) => {
    const escaped = r.path
      .split("/")
      .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    return new RegExp(`^${escaped}$`);
  });
}

const ROUTE_MATCHERS = buildRoutePatternMatchers();

function isRegisteredRoute(href: string): boolean {
  const base = href.split("?")[0].split("#")[0];
  // Also accept literal pattern strings like "/alerts/:alertId".
  for (const r of APP_ROUTES) {
    if (r.path === base) return true;
  }
  return ROUTE_MATCHERS.some((re) => re.test(base));
}

function computeRoutesValid(record: ProofRecord): boolean | null {
  const provided = [
    record.reading.routeObserved,
    record.snapshotRoute,
    record.timeline.routeObserved,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  if (provided.length === 0) return null;
  return provided.every(isRegisteredRoute);
}

export function computeProofIntegrity(record: ProofRecord): ProofIntegrity {
  return {
    unverified: true,
    missingFields: computeMissingFields(record),
    chronologyValid: computeChronologyValid(record),
    routesValid: computeRoutesValid(record),
  };
}

/**
 * Returns true when the record has the minimum scope + at least one loop
 * step's evidence id. UI uses this to gate the Download button.
 */
export function canExportProofRecord(record: ProofRecord): boolean {
  const hasScope =
    record.scope.growId !== null &&
    record.scope.tentId !== null &&
    record.scope.plantId !== null;
  if (!hasScope) return false;
  return LOOP_STEP_EVIDENCE_PATHS.some(
    (p) => getByPath(record, p) !== null,
  );
}

// ---------------------------------------------------------------------------
// Record assembly
// ---------------------------------------------------------------------------

export function buildOneTentProofRecord(
  input: ProofRecordInput | undefined | null,
): ProofRecord {
  const safe = redactRecordInput(input ?? {}) as ProofRecordInput;
  const scope = safe.scope ?? {};
  const quickLog = safe.quickLog ?? {};
  const timeline = safe.timeline ?? {};
  const reading = safe.reading ?? {};
  const aiDoctor = safe.aiDoctor ?? {};
  const target = safe.target ?? {};
  const alert = safe.alert ?? {};
  const action = safe.action ?? {};
  const approvalGate = action.approvalGate ?? {};
  const followup = safe.followup ?? {};

  const base: Omit<ProofRecord, "integrity"> = {
    kind: ONE_TENT_PROOF_RECORD_KIND,
    version: ONE_TENT_PROOF_RECORD_VERSION,
    reviewOnly: true,
    noLiveDataPromise:
      "Unverified operator self-report. No live data unless explicitly source-labeled 'live'.",
    assembledAt: s(safe.assembledAt),
    scope: {
      growId: s(scope.growId),
      growName: s(scope.growName),
      tentId: s(scope.tentId),
      tentName: s(scope.tentName),
      plantId: s(scope.plantId),
      plantName: s(scope.plantName),
      stage: s(scope.stage),
    },
    quickLog: {
      diaryEntryId: s(quickLog.diaryEntryId),
      actionType: s(quickLog.actionType),
      photoAttached: b(quickLog.photoAttached),
    },
    timeline: {
      rowId: s(timeline.rowId),
      routeObserved: s(timeline.routeObserved),
      chipVisible: b(timeline.chipVisible),
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
    aiDoctor: {
      sessionId: s(aiDoctor.sessionId),
      confidence: s(aiDoctor.confidence),
      riskLevel: s(aiDoctor.riskLevel),
      missingInfoPresent: b(aiDoctor.missingInfoPresent),
      doNotDoPresent: b(aiDoctor.doNotDoPresent),
    },
    target: {
      metric: s(target.metric),
      originalValue: n(target.originalValue),
      temporaryValue: n(target.temporaryValue),
      restored: b(target.restored),
      restoredAt: s(target.restoredAt),
      restoreDiaryEntryId: s(target.restoreDiaryEntryId),
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
      linkedAlertId: s(action.linkedAlertId),
      approvalGate: {
        requiredObserved: b(approvalGate.requiredObserved),
        approvedAt: s(approvalGate.approvedAt),
      },
    },
    followup: {
      diaryEntryId: s(followup.diaryEntryId),
      timelineChipVisible: b(followup.timelineChipVisible),
      actionDetailLinkVisible: b(followup.actionDetailLinkVisible),
    },
    uxFrictionNotes: s(safe.uxFrictionNotes),
    notes: s(safe.notes),
  };

  const full = base as ProofRecord;
  full.integrity = computeProofIntegrity(full);
  return full;
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
