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

function parseStatusLine(noteBody: string | null | undefined): EnvCheckOverallStatus {
  if (typeof noteBody !== "string") return "unknown";
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
  let lines: string[];
  try {
    lines = String(noteBody ?? "").split(/\r?\n/);
  } catch {
    return { status: "unknown", metrics: [] };
  }
  const metrics: EnvCheckMetric[] = [];
  const seenKeys = new Set<string>();
  const supportedKeys = new Set<string>(REQUIRED_ENVIRONMENT_METRICS);
  for (const line of lines) {
    let m: RegExpMatchArray | null = null;
    try {
      m = line.match(METRIC_LINE_RE);
    } catch {
      m = null;
    }
    if (!m) continue;
    const label = (m[1] ?? "").trim();
    if (!label) continue;
    const status = m[2] as EnvCheckMetricStatus;
    const value = parseValue(m[3] ?? "");
    const reason = (m[4] ?? "").trim();
    const key = normalizeKey(label);
    if (!key) continue;
    // Deterministic dedupe: first occurrence wins.
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    metrics.push({
      key,
      label,
      status,
      value,
      reason,
      derived: DERIVED_KEY_HINTS.has(key),
      supported: supportedKeys.has(key),
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

// ---------------------------------------------------------------------------
// Event quality classification + best-event selection
// ---------------------------------------------------------------------------

export type EnvCheckSelectedStatus =
  | "accepted"
  | "mixed"
  | "weak"
  | "rejected"
  | "not_checked"
  | "missing";

export interface EnvCheckEventQuality {
  /** True when at least one REQUIRED metric is accepted. */
  hasAcceptedRequired: boolean;
  acceptedRequiredCount: number;
  rejectedCount: number;
  notCheckedCount: number;
  totalSupported: number;
  selectedStatus: EnvCheckSelectedStatus;
}

export function classifyEnvironmentCheckQuality(
  event: EnvironmentCheckEventInput | null | undefined,
): EnvCheckEventQuality {
  if (!event || !isEcowittEnvironmentCheckNote(event.noteBody)) {
    return {
      hasAcceptedRequired: false,
      acceptedRequiredCount: 0,
      rejectedCount: 0,
      notCheckedCount: 0,
      totalSupported: 0,
      selectedStatus: "missing",
    };
  }
  const parsed = parseEnvironmentCheckNote(event.noteBody as string);
  const required = new Set<string>(REQUIRED_ENVIRONMENT_METRICS);
  const supported = parsed.metrics.filter((m) => m.supported || required.has(m.key));
  const acceptedRequired = supported.filter(
    (m) => required.has(m.key) && m.status === "accepted",
  );
  const rejected = supported.filter((m) => m.status === "rejected");
  const notChecked = supported.filter((m) => m.status === "not_checked");
  const accepted = supported.filter((m) => m.status === "accepted");

  let selectedStatus: EnvCheckSelectedStatus = "missing";
  if (parsed.status === "rejected" && accepted.length === 0) {
    selectedStatus = "rejected";
  } else if (
    supported.length > 0 &&
    accepted.length === 0 &&
    notChecked.length > 0
  ) {
    selectedStatus = "not_checked";
  } else if (accepted.length > 0 && (rejected.length > 0 || notChecked.length > 0)) {
    selectedStatus = "mixed";
  } else if (accepted.length > 0 && acceptedRequired.length === 0) {
    selectedStatus = "weak";
  } else if (acceptedRequired.length > 0) {
    selectedStatus = "accepted";
  } else if (supported.length > 0) {
    selectedStatus = "weak";
  }

  return {
    hasAcceptedRequired: acceptedRequired.length > 0,
    acceptedRequiredCount: acceptedRequired.length,
    rejectedCount: rejected.length,
    notCheckedCount: notChecked.length,
    totalSupported: supported.length,
    selectedStatus,
  };
}

export interface BestEnvironmentCheckSelection {
  selected: EnvironmentCheckEventInput | null;
  isFallback: boolean;
  selectedStatus: EnvCheckSelectedStatus;
  acceptedCandidateCount: number;
  totalCandidateCount: number;
}

function eventTitleForTieBreak(e: EnvironmentCheckEventInput): string {
  const body = e.noteBody ?? "";
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.trim();
}

/**
 * Pick the best Environment Check for AI Doctor. Selection rules:
 *  1. Prefer the latest candidate with ≥1 accepted required metric.
 *  2. Otherwise fall back to the newest weak/mixed/rejected candidate.
 *  3. Deterministic tie-breakers: accepted first, captured_at desc, title.
 *
 * Never throws on malformed inputs; rejects unparseable events.
 */
export function selectBestEnvironmentCheckEvent(
  events: readonly EnvironmentCheckEventInput[] | null | undefined,
): BestEnvironmentCheckSelection {
  const empty: BestEnvironmentCheckSelection = {
    selected: null,
    isFallback: false,
    selectedStatus: "missing",
    acceptedCandidateCount: 0,
    totalCandidateCount: 0,
  };
  if (!Array.isArray(events) || events.length === 0) return empty;
  const candidates = events.filter(
    (e) => !!e && isEcowittEnvironmentCheckNote(e.noteBody),
  );
  if (candidates.length === 0) return empty;

  const enriched = candidates.map((e) => ({
    event: e,
    quality: classifyEnvironmentCheckQuality(e),
    occurredAt: e.occurredAt ?? "",
    title: eventTitleForTieBreak(e),
  }));

  const cmp = (
    a: (typeof enriched)[number],
    b: (typeof enriched)[number],
  ): number => {
    const aAcc = a.quality.hasAcceptedRequired ? 1 : 0;
    const bAcc = b.quality.hasAcceptedRequired ? 1 : 0;
    if (aAcc !== bAcc) return bAcc - aAcc; // accepted first
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return 0;
  };

  const sorted = [...enriched].sort(cmp);
  const accepted = sorted.filter((x) => x.quality.hasAcceptedRequired);
  const acceptedCandidateCount = accepted.length;
  const chosen = accepted.length > 0 ? accepted[0] : sorted[0];
  const isFallback = !chosen.quality.hasAcceptedRequired;

  return {
    selected: chosen.event,
    isFallback,
    selectedStatus: chosen.quality.selectedStatus,
    acceptedCandidateCount,
    totalCandidateCount: candidates.length,
  };
}

// ---------------------------------------------------------------------------
// More-data-needed checklist
// ---------------------------------------------------------------------------

export type ChecklistItemState = "complete" | "needed";

export interface EnvironmentCheckChecklistItem {
  key: RequiredEnvironmentMetric;
  label: string;
  state: ChecklistItemState;
  reason: string;
}

export interface EnvironmentCheckChecklist {
  items: EnvironmentCheckChecklistItem[];
  /** True when at least one required metric still needs capture. */
  hasNeeded: boolean;
  cautionCopy: string;
}

const CHECKLIST_LABELS: Record<RequiredEnvironmentMetric, string> = {
  temp_f: "Capture air temperature (temp_f)",
  humidity_pct: "Capture humidity (humidity_pct)",
  vpd_kpa: "Capture/confirm derived VPD (vpd_kpa)",
  co2_ppm: "Capture CO₂ (co2_ppm) if available",
  soil_moisture_pct: "Capture soil moisture (soil_moisture_pct) if available",
};

export function buildEnvironmentCheckChecklist(args: {
  event: EnvironmentCheckEventInput | null | undefined;
  hasLiveSensorContext: boolean;
}): EnvironmentCheckChecklist {
  const parsed = args.event && isEcowittEnvironmentCheckNote(args.event.noteBody)
    ? parseEnvironmentCheckNote(args.event.noteBody as string)
    : { status: "unknown" as EnvCheckOverallStatus, metrics: [] as EnvCheckMetric[] };
  const byKey = new Map<string, EnvCheckMetric>();
  for (const m of parsed.metrics) {
    if (!byKey.has(m.key)) byKey.set(m.key, m);
  }
  const items: EnvironmentCheckChecklistItem[] = REQUIRED_ENVIRONMENT_METRICS.map(
    (key) => {
      const m = byKey.get(key);
      if (m && m.status === "accepted") {
        return {
          key,
          label: CHECKLIST_LABELS[key],
          state: "complete" as ChecklistItemState,
          reason: "Accepted in latest Environment Check.",
        };
      }
      if (!m) {
        return {
          key,
          label: CHECKLIST_LABELS[key],
          state: "needed" as ChecklistItemState,
          reason: "Not captured.",
        };
      }
      const reason =
        m.status === "rejected"
          ? `Rejected${m.reason ? `: ${m.reason}` : ""}.`
          : m.status === "not_checked"
            ? "Not checked."
            : "Needs capture.";
      return {
        key,
        label: CHECKLIST_LABELS[key],
        state: "needed" as ChecklistItemState,
        reason,
      };
    },
  );

  const hasNeeded = items.some((i) => i.state === "needed");
  const allComplete = !hasNeeded;
  let cautionCopy = "";
  if (allComplete && !args.hasLiveSensorContext) {
    cautionCopy =
      "Environment Check is useful context, but not live telemetry.";
  } else if (!args.hasLiveSensorContext) {
    cautionCopy =
      "Live telemetry is still missing. Treat this as context, not live sensor truth.";
  }

  return { items, hasNeeded, cautionCopy };
}
