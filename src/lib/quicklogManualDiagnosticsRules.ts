/**
 * quicklogManualDiagnosticsRules — pure classification for the operator
 * Quick Log manual-save diagnostics screen (/diagnostics/quicklog).
 *
 * Server contract this mirrors (verified against the deployed catalog,
 * 2026-08-19): `public.quicklog_save_manual` (wrapper; EXECUTE for
 * authenticated + service_role) delegates to five postgres-only helpers —
 * `quicklog_save_manual_pre_logged_at`, `quicklog_try_parse_logged_at`,
 * `quicklog_try_parse_uuid`, `quicklog_stamp_diary_logged_at`,
 * `quicklog_stamp_grow_event_logged_at`. A successful manual save writes the
 * grow_events spine row plus a diary_entries mirror tagged
 * `details.linked_grow_event_id`, with `entry_at = occurred_at` and the same
 * Captured `logged_at` on both rows and in `details.logged_at`.
 *
 * Pure data + functions. No I/O, no React, no Supabase. Rows that predate
 * the dual-timestamp / unconditional-mirror migrations legitimately miss
 * mirrors or carry backfilled capture stamps, so those states classify as
 * "warn" (historical), never "fail".
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same shape the server's quicklog_try_parse_logged_at accepts. */
const LOGGED_AT_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?([Zz]|[+-][0-9]{2}:[0-9]{2})$/;

export interface QuicklogDiagnosticsEventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  created_at: string;
  /** Absent when the deployed database predates the dual-timestamp columns. */
  logged_at?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
}

export interface QuicklogDiagnosticsDiaryRow {
  id: string;
  entry_at: string;
  logged_at?: string | null;
  grow_id?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  details?: unknown;
}

export interface QuicklogDiagnosticsAuditRow {
  grow_event_id?: string | null;
  status: string;
  reason?: string | null;
  created_at?: string | null;
}

export type QuicklogMirrorLinkKey = "linked_grow_event_id" | "grow_event_id";

/** Strictly read the mirror link from untrusted diary details JSON. */
export function readLinkedGrowEventId(details: unknown): {
  id: string | null;
  key: QuicklogMirrorLinkKey | null;
} {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { id: null, key: null };
  }
  const record = details as Record<string, unknown>;
  for (const key of ["linked_grow_event_id", "grow_event_id"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.length === 36 && UUID_PATTERN.test(value)) {
      return { id: value.toLowerCase(), key };
    }
  }
  return { id: null, key: null };
}

export interface DetailsLoggedAtReading {
  present: boolean;
  parseable: boolean;
  value: string | null;
}

/**
 * Strict calendar/time validation. Date.parse silently normalizes impossible
 * dates (e.g. February 30) that PostgreSQL rejects, so components are
 * round-tripped and compared field by field.
 *
 * The round trip deliberately avoids `Date.UTC`, which remaps years 0–99 to
 * 1900–1999: `Date.UTC(99, 0, 1)` is 1999, so a server-acceptable stamp like
 * `0099-01-01T00:00:00Z` would fail its own round trip and be reported
 * unparseable. `setUTCFullYear` writes the literal year with no coercion.
 * Year 0 is rejected outright — PostgreSQL has no year zero (1 BC → 1 AD).
 */
function hasValidCalendarComponents(raw: string): boolean {
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  const hour = Number(raw.slice(11, 13));
  const minute = Number(raw.slice(14, 16));
  const second = Number(raw.slice(17, 19));
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (year === 0) return false;
  const roundTrip = new Date(0);
  roundTrip.setUTCFullYear(year, month - 1, day);
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  );
}

/** Read details.logged_at with the server parser's acceptance rules. */
export function readDetailsLoggedAt(details: unknown): DetailsLoggedAtReading {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { present: false, parseable: false, value: null };
  }
  const raw = (details as Record<string, unknown>)["logged_at"];
  if (raw === undefined || raw === null) return { present: false, parseable: false, value: null };
  if (typeof raw !== "string" || raw.length > 64 || !LOGGED_AT_PATTERN.test(raw)) {
    return { present: true, parseable: false, value: null };
  }
  if (!hasValidCalendarComponents(raw)) return { present: true, parseable: false, value: null };
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return { present: true, parseable: false, value: null };
  return { present: true, parseable: true, value: raw };
}

/** Instant equality that tolerates timezone formatting differences. */
export function sameInstant(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

export type QuicklogMirrorStatus = "linked" | "linked_legacy_key" | "missing" | "multiple";

export type QuicklogLoggedAtStatus =
  | "parity"
  | "event_only"
  | "mirror_only"
  | "absent"
  | "mismatch"
  | "column_unavailable"
  | "no_mirror";

export type QuicklogDetailsLoggedAtStatus =
  "parity" | "absent" | "unparseable" | "mismatch" | "no_mirror";

export type QuicklogDiagnosticsSeverity = "ok" | "warn" | "fail";

export interface QuicklogManualEntryDiagnostics {
  growEventId: string;
  eventType: string;
  occurredAt: string;
  createdAt: string;
  eventLoggedAt: string | null;
  mirrorStatus: QuicklogMirrorStatus;
  mirrorDiaryEntryId: string | null;
  entryAtMatchesOccurredAt: boolean | null;
  loggedAtStatus: QuicklogLoggedAtStatus;
  detailsLoggedAtStatus: QuicklogDetailsLoggedAtStatus;
  auditStatuses: string[];
  severity: QuicklogDiagnosticsSeverity;
}

export interface BuildManualEntryDiagnosticsInput {
  events: QuicklogDiagnosticsEventRow[];
  diaryEntries: QuicklogDiagnosticsDiaryRow[];
  auditEvents?: QuicklogDiagnosticsAuditRow[];
  /** False when the deployed database has no logged_at columns yet. */
  loggedAtColumnAvailable: boolean;
}

function classifyLoggedAt(
  event: QuicklogDiagnosticsEventRow,
  mirror: QuicklogDiagnosticsDiaryRow | null,
  loggedAtColumnAvailable: boolean,
): QuicklogLoggedAtStatus {
  if (!loggedAtColumnAvailable) return "column_unavailable";
  const eventLoggedAt = event.logged_at ?? null;
  if (!mirror) return "no_mirror";
  const mirrorLoggedAt = mirror.logged_at ?? null;
  if (eventLoggedAt === null && mirrorLoggedAt === null) return "absent";
  if (eventLoggedAt !== null && mirrorLoggedAt === null) return "event_only";
  if (eventLoggedAt === null && mirrorLoggedAt !== null) return "mirror_only";
  return sameInstant(eventLoggedAt, mirrorLoggedAt) ? "parity" : "mismatch";
}

function classifyDetailsLoggedAt(
  event: QuicklogDiagnosticsEventRow,
  mirror: QuicklogDiagnosticsDiaryRow | null,
): QuicklogDetailsLoggedAtStatus {
  if (!mirror) return "no_mirror";
  const reading = readDetailsLoggedAt(mirror.details);
  if (!reading.present) return "absent";
  if (!reading.parseable) return "unparseable";
  const eventLoggedAt = event.logged_at ?? null;
  if (eventLoggedAt === null) return "mismatch";
  return sameInstant(reading.value, eventLoggedAt) ? "parity" : "mismatch";
}

function severityFor(
  mirrorStatus: QuicklogMirrorStatus,
  entryAtMatches: boolean | null,
  loggedAtStatus: QuicklogLoggedAtStatus,
  detailsStatus: QuicklogDetailsLoggedAtStatus,
): QuicklogDiagnosticsSeverity {
  if (
    mirrorStatus === "multiple" ||
    loggedAtStatus === "mismatch" ||
    detailsStatus === "mismatch" ||
    detailsStatus === "unparseable"
  ) {
    return "fail";
  }
  if (
    mirrorStatus === "missing" ||
    mirrorStatus === "linked_legacy_key" ||
    entryAtMatches === false ||
    loggedAtStatus === "event_only" ||
    loggedAtStatus === "mirror_only" ||
    loggedAtStatus === "absent" ||
    loggedAtStatus === "column_unavailable" ||
    detailsStatus === "absent"
  ) {
    return "warn";
  }
  return "ok";
}

/**
 * Classify the latest manual grow events against their diary mirrors.
 * Deterministic: sorted by created_at descending, id ascending on ties.
 */
export function buildQuicklogManualEntryDiagnostics(
  input: BuildManualEntryDiagnosticsInput,
): QuicklogManualEntryDiagnostics[] {
  const mirrorsByEventId = new Map<
    string,
    { row: QuicklogDiagnosticsDiaryRow; key: QuicklogMirrorLinkKey }[]
  >();
  for (const diary of input.diaryEntries) {
    const link = readLinkedGrowEventId(diary.details);
    if (!link.id || !link.key) continue;
    const bucket = mirrorsByEventId.get(link.id) ?? [];
    bucket.push({ row: diary, key: link.key });
    mirrorsByEventId.set(link.id, bucket);
  }

  // The trail renders as a chronological sequence, so order it here rather
  // than trusting caller fetch order. Stable sort: rows without a usable
  // created_at keep their input position.
  const auditByEventId = new Map<string, string[]>();
  const sortedAudits = [...(input.auditEvents ?? [])].sort((left, right) => {
    const leftMs = Date.parse(left.created_at ?? "");
    const rightMs = Date.parse(right.created_at ?? "");
    if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return 0;
    return leftMs - rightMs;
  });
  for (const audit of sortedAudits) {
    const eventId =
      typeof audit.grow_event_id === "string" ? audit.grow_event_id.toLowerCase() : null;
    if (!eventId) continue;
    const bucket = auditByEventId.get(eventId) ?? [];
    bucket.push(audit.status);
    auditByEventId.set(eventId, bucket);
  }

  const rows = input.events.map((event) => {
    const eventKey = event.id.toLowerCase();
    const mirrors = mirrorsByEventId.get(eventKey) ?? [];
    let mirrorStatus: QuicklogMirrorStatus;
    if (mirrors.length === 0) mirrorStatus = "missing";
    else if (mirrors.length > 1) mirrorStatus = "multiple";
    else mirrorStatus = mirrors[0].key === "linked_grow_event_id" ? "linked" : "linked_legacy_key";
    const mirror = mirrors.length === 1 ? mirrors[0].row : null;

    const entryAtMatchesOccurredAt = mirror
      ? sameInstant(mirror.entry_at, event.occurred_at)
      : null;
    const loggedAtStatus = classifyLoggedAt(event, mirror, input.loggedAtColumnAvailable);
    const detailsLoggedAtStatus = classifyDetailsLoggedAt(event, mirror);

    return {
      growEventId: event.id,
      eventType: event.event_type,
      occurredAt: event.occurred_at,
      createdAt: event.created_at,
      eventLoggedAt: event.logged_at ?? null,
      mirrorStatus,
      mirrorDiaryEntryId: mirror?.id ?? null,
      entryAtMatchesOccurredAt,
      loggedAtStatus,
      detailsLoggedAtStatus,
      auditStatuses: auditByEventId.get(eventKey) ?? [],
      severity: severityFor(
        mirrorStatus,
        entryAtMatchesOccurredAt,
        loggedAtStatus,
        detailsLoggedAtStatus,
      ),
    } satisfies QuicklogManualEntryDiagnostics;
  });

  return rows.sort((left, right) => {
    const leftMs = Date.parse(left.createdAt);
    const rightMs = Date.parse(right.createdAt);
    if (leftMs !== rightMs) return rightMs - leftMs;
    return left.growEventId < right.growEventId ? -1 : left.growEventId > right.growEventId ? 1 : 0;
  });
}

export interface QuicklogDiagnosticsSummary {
  total: number;
  ok: number;
  warn: number;
  fail: number;
}

export function summarizeQuicklogManualDiagnostics(
  rows: QuicklogManualEntryDiagnostics[],
): QuicklogDiagnosticsSummary {
  const summary: QuicklogDiagnosticsSummary = { total: rows.length, ok: 0, warn: 0, fail: 0 };
  for (const row of rows) summary[row.severity] += 1;
  return summary;
}

// ---------------------------------------------------------------------------
// ACL probe classification
// ---------------------------------------------------------------------------

/**
 * The five postgres-only helpers, with safe probe arguments. Probing them
 * from a client MUST fail — permission denied (42501) or not exposed via
 * PostgREST (PGRST202) both prove the seal. A successful call is an ACL
 * regression. These probes never write: permission is checked before
 * execution, and the two parse helpers are pure even if reached.
 */
export const QUICKLOG_PRIVATE_HELPER_PROBES = [
  {
    functionName: "quicklog_save_manual_pre_logged_at",
    kind: "delegate",
    args: {
      p_target_type: "diagnostics_probe",
      p_target_id: "00000000-0000-4000-8000-000000000000",
      p_action: "note",
    },
  },
  {
    functionName: "quicklog_try_parse_logged_at",
    kind: "parser",
    args: { p_value: "2026-01-01T00:00:00Z" },
  },
  {
    functionName: "quicklog_try_parse_uuid",
    kind: "parser",
    args: { p_value: "00000000-0000-4000-8000-000000000000" },
  },
  { functionName: "quicklog_stamp_diary_logged_at", kind: "trigger", args: {} },
  { functionName: "quicklog_stamp_grow_event_logged_at", kind: "trigger", args: {} },
] as const;

export type QuicklogPrivateHelperProbe = (typeof QUICKLOG_PRIVATE_HELPER_PROBES)[number];

export type QuicklogAclProbeStatus =
  | "sealed_permission"
  | "sealed_not_exposed"
  | "exposed_regression"
  | "network_error"
  | "unknown_error";

export interface QuicklogProbeOutcome {
  succeeded: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export function classifyQuicklogPrivateProbe(
  outcome: QuicklogProbeOutcome,
): QuicklogAclProbeStatus {
  if (outcome.succeeded) return "exposed_regression";
  const code = outcome.errorCode ?? "";
  const message = outcome.errorMessage ?? "";
  if (code === "42501") return "sealed_permission";
  // 0A000: "trigger functions can only be called as triggers" — the call got
  // past the permission check, so EXECUTE is granted. That is the regression.
  if (code === "0A000") return "exposed_regression";
  // Only function-not-found codes prove non-exposure. PGRST204 is an
  // unknown-column/schema-cache error and must not paint the probe healthy.
  if (code === "PGRST202" || code === "42883") return "sealed_not_exposed";
  if (
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
  ) {
    return "network_error";
  }
  return "unknown_error";
}

/**
 * Wrapper probe: calls `quicklog_save_manual` with an invalid target type so
 * validation rejects it before any grow/diary write. The server records ONE
 * `validation_failed` audit row for the probe — by design; the screen states
 * this next to the button. Expected outcome for a healthy deployment:
 * `{ ok:false, reason:"invalid_target_type" }`.
 */
export const QUICKLOG_WRAPPER_PROBE = {
  functionName: "quicklog_save_manual",
  args: {
    p_target_type: "diagnostics_probe",
    p_target_id: "00000000-0000-4000-8000-000000000000",
    p_action: "note",
  },
} as const;

export type QuicklogWrapperProbeStatus =
  | "reachable_validating"
  | "unavailable"
  | "denied"
  | "unexpected_write"
  | "network_error"
  | "unknown_error";

export interface QuicklogWrapperProbeResult {
  status: QuicklogWrapperProbeStatus;
  reason: string | null;
}

export function classifyQuicklogWrapperProbe(outcome: {
  succeeded: boolean;
  data?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}): QuicklogWrapperProbeResult {
  if (outcome.succeeded) {
    const data = (outcome.data ?? {}) as { ok?: unknown; reason?: unknown };
    if (data.ok === true) {
      // The probe payload cannot validly save; a write means the deployed
      // validation contract drifted. Surface loudly.
      return { status: "unexpected_write", reason: null };
    }
    const reason = typeof data.reason === "string" ? data.reason : null;
    if (data.ok === false && reason === "invalid_target_type") {
      return { status: "reachable_validating", reason };
    }
    // HTTP success alone is not a healthy contract. A malformed envelope or
    // any other soft-failure reason could hide wrapper drift while painting
    // the operator diagnostic green.
    return { status: "unknown_error", reason };
  }
  const code = outcome.errorCode ?? "";
  const message = outcome.errorMessage ?? "";
  if (code === "42501") return { status: "denied", reason: null };
  if (code === "PGRST202" || code === "42883") return { status: "unavailable", reason: null };
  if (
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
  ) {
    return { status: "network_error", reason: null };
  }
  return { status: "unknown_error", reason: null };
}

// ---------------------------------------------------------------------------
// Consistency check (diary timeline ↔ linked grow events)
// ---------------------------------------------------------------------------

export interface QuicklogConsistencyInput {
  /** Diary rows to reconcile (window + mirrors fetched by event id). */
  diaryEntries: QuicklogDiagnosticsDiaryRow[];
  /**
   * Grow events available for reconciliation: the manual-source window PLUS
   * every event fetched by a diary row's linked id. A linked id absent from
   * this set was fetched-by-id and not found, i.e. genuinely dangling.
   */
  growEvents: QuicklogDiagnosticsEventRow[];
  loggedAtColumnAvailable: boolean;
}

export interface QuicklogConsistencyReport {
  checkedDiaryEntries: number;
  checkedGrowEvents: number;
  /** Links whose occurrence AND Captured timestamps both prove parity. */
  healthyLinks: number;
  /**
   * Links whose occurrence matches but whose Captured parity is unprovable —
   * columns absent from the schema, or both stamps null. Never "healthy":
   * unknown telemetry must not be classified as healthy.
   */
  linksWithoutCapturedParity: number;
  unlinkedDiaryEntries: number;
  danglingDiaryLinks: {
    diaryEntryId: string;
    linkedGrowEventId: string;
    linkKey: QuicklogMirrorLinkKey;
  }[];
  occurrenceMismatches: {
    diaryEntryId: string;
    growEventId: string;
    entryAt: string;
    occurredAt: string;
  }[];
  loggedAtMismatches: {
    diaryEntryId: string;
    growEventId: string;
    diaryLoggedAt: string | null;
    eventLoggedAt: string | null;
  }[];
  unmirroredManualEvents: { growEventId: string; eventType: string; createdAt: string }[];
}

export function buildQuicklogConsistencyReport(
  input: QuicklogConsistencyInput,
): QuicklogConsistencyReport {
  const eventsById = new Map<string, QuicklogDiagnosticsEventRow>();
  for (const event of input.growEvents) eventsById.set(event.id.toLowerCase(), event);

  const report: QuicklogConsistencyReport = {
    checkedDiaryEntries: input.diaryEntries.length,
    checkedGrowEvents: input.growEvents.length,
    healthyLinks: 0,
    linksWithoutCapturedParity: 0,
    unlinkedDiaryEntries: 0,
    danglingDiaryLinks: [],
    occurrenceMismatches: [],
    loggedAtMismatches: [],
    unmirroredManualEvents: [],
  };

  const mirroredEventIds = new Set<string>();
  const sortedDiary = [...input.diaryEntries].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  for (const diary of sortedDiary) {
    const link = readLinkedGrowEventId(diary.details);
    if (!link.id || !link.key) {
      report.unlinkedDiaryEntries += 1;
      continue;
    }
    const event = eventsById.get(link.id);
    if (!event) {
      report.danglingDiaryLinks.push({
        diaryEntryId: diary.id,
        linkedGrowEventId: link.id,
        linkKey: link.key,
      });
      continue;
    }
    mirroredEventIds.add(link.id);
    let healthy = true;
    let capturedParityProven = false;
    if (!sameInstant(diary.entry_at, event.occurred_at)) {
      healthy = false;
      report.occurrenceMismatches.push({
        diaryEntryId: diary.id,
        growEventId: event.id,
        entryAt: diary.entry_at,
        occurredAt: event.occurred_at,
      });
    }
    if (input.loggedAtColumnAvailable) {
      const diaryLoggedAt = diary.logged_at ?? null;
      const eventLoggedAt = event.logged_at ?? null;
      const bothAbsent = diaryLoggedAt === null && eventLoggedAt === null;
      if (bothAbsent) {
        // Legacy pre-backfill pair: nothing to compare, so parity is
        // unprovable — reported as such, never as healthy.
      } else if (!sameInstant(diaryLoggedAt, eventLoggedAt)) {
        healthy = false;
        report.loggedAtMismatches.push({
          diaryEntryId: diary.id,
          growEventId: event.id,
          diaryLoggedAt,
          eventLoggedAt,
        });
      } else {
        capturedParityProven = true;
      }
    }
    if (healthy && capturedParityProven) report.healthyLinks += 1;
    else if (healthy) report.linksWithoutCapturedParity += 1;
  }

  const sortedEvents = [...input.growEvents].sort((a, b) => {
    const leftMs = Date.parse(a.created_at);
    const rightMs = Date.parse(b.created_at);
    if (leftMs !== rightMs) return rightMs - leftMs;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  for (const event of sortedEvents) {
    if (!mirroredEventIds.has(event.id.toLowerCase())) {
      report.unmirroredManualEvents.push({
        growEventId: event.id,
        eventType: event.event_type,
        createdAt: event.created_at,
      });
    }
  }

  return report;
}
