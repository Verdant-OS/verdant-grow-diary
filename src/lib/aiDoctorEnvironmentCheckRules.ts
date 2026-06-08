/**
 * aiDoctorEnvironmentCheckRules — pure parser/builder that turns recent
 * diary/grow_events created from EcoWitt local validation evidence into
 * cautious AI Doctor context.
 *
 * Hard constraints:
 *  - Pure / deterministic. No I/O, no Supabase, no React.
 *  - Local/test EcoWitt validation evidence is NEVER labeled "live".
 *  - Rejected / not_checked metrics are NEVER treated as healthy.
 *  - Derived VPD is surfaced as context only, never as a raw sensor reading.
 *  - No device control, no automation, no Action Queue writes.
 */

import { DIARY_ENVIRONMENT_CHECK_TITLE } from "./ecowittDiaryEnvironmentCheckRules";

export const AI_DOCTOR_ENV_CHECK_SOURCE_LABEL =
  "local EcoWitt validation / test-local evidence";

export type EnvCheckMetricStatus = "accepted" | "rejected" | "not_checked";

/** Metrics the AI Doctor "more data needed" checklist enforces. */
export const REQUIRED_ENVIRONMENT_METRICS = [
  "temp_f",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
] as const;
export type RequiredEnvironmentMetric =
  (typeof REQUIRED_ENVIRONMENT_METRICS)[number];

export interface EnvCheckMetric {
  key: string;
  label: string;
  status: EnvCheckMetricStatus;
  value: number | null;
  reason: string;
  derived: boolean;
  /** False when the metric label is not in the known/required vocabulary. */
  supported: boolean;
}

export type EnvCheckOverallStatus = "accepted" | "rejected" | "unknown";

export interface EnvironmentCheckEventInput {
  /** ISO-8601 capture/occurred timestamp on the grow_event row. */
  occurredAt: string | null | undefined;
  /** Plain-text note body persisted via quicklog_save_manual. */
  noteBody: string | null | undefined;
  /** Optional structured echoes (preserved when caller has them). */
  temperatureC?: number | null;
  humidityPct?: number | null;
  vpdKpa?: number | null;
}

export interface AiDoctorEnvironmentCheckContext {
  kind: "present";
  present: true;
  capturedAt: string;
  /** Honest source label — never "live". */
  sourceLabel: string;
  isLive: false;
  status: EnvCheckOverallStatus;
  metrics: EnvCheckMetric[];
  acceptedCount: number;
  rejectedCount: number;
  notCheckedCount: number;
  /** Derived metric notes (e.g. VPD is derived, context only). */
  derivedNotes: string[];
  /** Raw/derived warning notes lifted from the diary draft. */
  warnings: string[];
  /** One-line deterministic summary for AI Doctor prompt context. */
  contextSummary: string;
  /** Cautious notes that must accompany AI Doctor output. */
  safetyNotes: string[];
  /** Confidence impact this evidence has on AI Doctor. */
  confidenceImpact: "reduced" | "severely-reduced" | "untrusted";
}

export interface AiDoctorEnvironmentCheckAbsent {
  kind: "absent";
  present: false;
  reason:
    | "no_event"
    | "unparseable"
    | "missing_captured_at";
  /** Cautious copy AI Doctor should surface when evidence is missing/weak. */
  cautionCopy: string;
}

export type AiDoctorEnvironmentCheckResult =
  | AiDoctorEnvironmentCheckContext
  | AiDoctorEnvironmentCheckAbsent;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Returns true when a grow_event note body was produced by the EcoWitt
 * local validation → diary Environment Check handoff.
 */
export function isEcowittEnvironmentCheckNote(
  noteBody: string | null | undefined,
): boolean {
  if (typeof noteBody !== "string" || noteBody.length === 0) return false;
  return (
    noteBody.includes(DIARY_ENVIRONMENT_CHECK_TITLE) &&
    noteBody.includes("Source: local EcoWitt validation")
  );
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const METRIC_LINE_RE =
  /^\s*•\s+(.+?):\s+(accepted|rejected|not_checked)\s+\(value=([^)]*)\)(?:\s+—\s+(.*))?$/;

const DERIVED_KEY_HINTS = new Set([
  "vpd_kpa",
  "vpd",
  "derived_vpd",
]);

function normalizeKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "—" || trimmed === "null") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseStatusLine(noteBody: string): EnvCheckOverallStatus {
  const m = noteBody.match(/Validation status:\s*(\w+)/i);
  if (!m) return "unknown";
  const s = m[1].toLowerCase();
  if (s === "accepted") return "accepted";
  if (s === "rejected") return "rejected";
  return "unknown";
}

interface ParsedNote {
  status: EnvCheckOverallStatus;
  metrics: EnvCheckMetric[];
}

export function parseEnvironmentCheckNote(noteBody: string): ParsedNote {
  const lines = noteBody.split(/\r?\n/);
  const metrics: EnvCheckMetric[] = [];
  for (const line of lines) {
    const m = line.match(METRIC_LINE_RE);
    if (!m) continue;
    const label = m[1].trim();
    const status = m[2] as EnvCheckMetricStatus;
    const value = parseValue(m[3]);
    const reason = (m[4] ?? "").trim();
    const key = normalizeKey(label);
    metrics.push({
      key,
      label,
      status,
      value,
      reason,
      derived: DERIVED_KEY_HINTS.has(key),
    });
  }
  return { status: parseStatusLine(noteBody), metrics };
}

// ---------------------------------------------------------------------------
// Build context
// ---------------------------------------------------------------------------

function pickConfidenceImpact(
  status: EnvCheckOverallStatus,
  rejected: number,
  notChecked: number,
  accepted: number,
): AiDoctorEnvironmentCheckContext["confidenceImpact"] {
  if (status === "rejected" || rejected > 0) {
    if (accepted === 0) return "untrusted";
    return "severely-reduced";
  }
  if (notChecked > 0 && accepted === 0) return "untrusted";
  // Local/test evidence is never a substitute for live telemetry.
  return "reduced";
}

function buildSummary(
  capturedAt: string,
  status: EnvCheckOverallStatus,
  accepted: number,
  rejected: number,
  notChecked: number,
): string {
  return (
    `Recent Environment Check from ${AI_DOCTOR_ENV_CHECK_SOURCE_LABEL} ` +
    `captured at ${capturedAt}: status=${status}, accepted=${accepted}, ` +
    `rejected=${rejected}, not_checked=${notChecked}. Test/local data — not live telemetry.`
  );
}

function buildSafetyNotes(
  status: EnvCheckOverallStatus,
  metrics: EnvCheckMetric[],
): string[] {
  const notes: string[] = [
    "Environment Check evidence is from local EcoWitt validation (test/local data). Do not treat as live telemetry.",
    "Do not suggest device control actions or automation changes from Environment Check evidence.",
    "Sensor telemetry alone cannot confirm or deny plant health with certainty.",
  ];
  if (status === "rejected") {
    notes.push(
      "Validation status is rejected: do not treat metrics as healthy.",
    );
  }
  if (metrics.some((m) => m.status === "rejected")) {
    const rejectedKeys = metrics
      .filter((m) => m.status === "rejected")
      .map((m) => m.key)
      .join(", ");
    notes.push(`Rejected metrics must not be used as healthy evidence: ${rejectedKeys}.`);
  }
  if (metrics.some((m) => m.status === "not_checked")) {
    notes.push("Some metrics were not_checked — they cannot be assumed healthy.");
  }
  if (metrics.some((m) => m.derived)) {
    notes.push(
      "Derived VPD is included as context only — it is not a raw sensor reading.",
    );
  }
  return notes;
}

export interface BuildEnvCheckContextOptions {
  /** Now — used only for cautious copy in the absent case. */
  now?: number;
}

export function buildAiDoctorEnvironmentCheckContext(
  event: EnvironmentCheckEventInput | null | undefined,
): AiDoctorEnvironmentCheckResult {
  if (!event || !isEcowittEnvironmentCheckNote(event.noteBody)) {
    return {
      kind: "absent",
      present: false,
      reason: "no_event",
      cautionCopy:
        "No recent Environment Check evidence is available. More data is needed before drawing conclusions.",
    };
  }
  if (!event.occurredAt) {
    return {
      kind: "absent",
      present: false,
      reason: "missing_captured_at",
      cautionCopy:
        "Environment Check evidence is missing a capture timestamp. More data is needed.",
    };
  }

  const parsed = parseEnvironmentCheckNote(event.noteBody as string);
  if (parsed.metrics.length === 0) {
    return {
      kind: "absent",
      present: false,
      reason: "unparseable",
      cautionCopy:
        "Environment Check evidence could not be parsed. More data is needed before drawing conclusions.",
    };
  }

  const accepted = parsed.metrics.filter((m) => m.status === "accepted").length;
  const rejected = parsed.metrics.filter((m) => m.status === "rejected").length;
  const notChecked = parsed.metrics.filter((m) => m.status === "not_checked").length;

  const derivedNotes = parsed.metrics
    .filter((m) => m.derived)
    .map((m) => `${m.label} is derived (context only, not a raw sensor reading).`);

  const warnings: string[] = [];
  if (rejected > 0) warnings.push(`${rejected} metric(s) rejected.`);
  if (notChecked > 0) warnings.push(`${notChecked} metric(s) not_checked.`);
  if (accepted === 0) warnings.push("No accepted metrics in this Environment Check.");

  return {
    kind: "present",
    present: true,
    capturedAt: event.occurredAt,
    sourceLabel: AI_DOCTOR_ENV_CHECK_SOURCE_LABEL,
    isLive: false,
    status: parsed.status,
    metrics: parsed.metrics,
    acceptedCount: accepted,
    rejectedCount: rejected,
    notCheckedCount: notChecked,
    derivedNotes,
    warnings,
    contextSummary: buildSummary(
      event.occurredAt,
      parsed.status,
      accepted,
      rejected,
      notChecked,
    ),
    safetyNotes: buildSafetyNotes(parsed.status, parsed.metrics),
    confidenceImpact: pickConfidenceImpact(
      parsed.status,
      rejected,
      notChecked,
      accepted,
    ),
  };
}

/**
 * Pick the latest Environment Check event from a list (deterministic:
 * stable sort by occurredAt desc, then noteBody length as tiebreaker).
 */
export function selectLatestEnvironmentCheckEvent(
  events: readonly EnvironmentCheckEventInput[] | null | undefined,
): EnvironmentCheckEventInput | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const candidates = events.filter((e) =>
    isEcowittEnvironmentCheckNote(e?.noteBody),
  );
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const at = a.occurredAt ?? "";
    const bt = b.occurredAt ?? "";
    if (at < bt) return 1;
    if (at > bt) return -1;
    return (b.noteBody?.length ?? 0) - (a.noteBody?.length ?? 0);
  });
  return sorted[0] ?? null;
}
