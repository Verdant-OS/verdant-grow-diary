/**
 * aiDoctorSessionLedgerViewModel — pure, deterministic mapping from raw
 * `ai_doctor_sessions` metadata rows (+ owner-resolved scope name maps) into
 * a compact, privacy-safe "session integrity ledger" view.
 *
 * Boundaries (stop-ship if violated):
 *   - Pure. No fetch, no Supabase, no React, no wall-clock reads. Sorting is
 *     driven entirely by each row's own `created_at`.
 *   - Input rows carry ONLY metadata fields (id, timestamp, scope ids,
 *     sensor-evidence classification fields). This module never accepts or
 *     returns `user_id`, `question`, `analysis`, `diagnosis`,
 *     `suggested_actions`, raw confidence, context data, photo URLs, or any
 *     model/provider payload.
 *   - Never marks a session "invalid" for lacking a `plant_id`. A grow- or
 *     tent-scoped session with no plant is a legitimate, common shape —
 *     there is no "invalid session" concept anywhere in this module.
 *   - Archived or unresolved grow/tent/plant references render as
 *     "Archived or unavailable" — never an invented name, never silently
 *     dropped. The immutable id is always preserved for the technical-ID
 *     view regardless of resolution outcome.
 */
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/** Metadata-only shape. Deliberately excludes every sensitive field. */
export interface AiDoctorLedgerSessionRow {
  id: string;
  created_at: string | null | undefined;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  sensor_snapshot_status: string | null;
  sensor_snapshot_reason_code: string | null;
  counts_as_healthy_evidence: boolean | null;
  sensor_evidence_mode: string | null;
  sensor_evidence_evaluated_at: string | null;
}

/** Owner-resolved id -> display name maps. Archived/missing ids are simply absent. */
export interface AiDoctorLedgerScopeLabelMaps {
  growNameById: ReadonlyMap<string, string>;
  tentNameById: ReadonlyMap<string, string>;
  plantNameById: ReadonlyMap<string, string>;
}

export const EMPTY_LEDGER_SCOPE_LABEL_MAPS: AiDoctorLedgerScopeLabelMaps = {
  growNameById: new Map(),
  tentNameById: new Map(),
  plantNameById: new Map(),
};

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

export type AiDoctorLedgerEvidenceTone = "healthy" | "cautionary" | "unsafe" | "missing" | "legacy";

export interface AiDoctorLedgerScopeLabel {
  id: string | null;
  /**
   * Display label. Either a resolved owner-owned name, the literal
   * "Archived or unavailable" (id present but not resolvable), or "—"
   * (no id — not applicable, never treated as an error).
   */
  label: string;
  /** True only when an id IS present but could not be resolved. Never true when id is null. */
  archivedOrUnavailable: boolean;
}

export interface AiDoctorLedgerEvidenceSummary {
  tone: AiDoctorLedgerEvidenceTone;
  label: string;
  /** Humanized reason code, or null when not recorded. */
  reasonLabel: string | null;
  countsAsHealthy: boolean | null;
  /** Formatted evaluation timestamp, or null when not recorded/invalid. */
  evaluatedAtDisplay: string | null;
  /** True when no recognized `sensor_evidence_mode` was captured on this row. */
  isLegacy: boolean;
}

export interface AiDoctorLedgerEntry {
  id: string;
  timestampDisplay: string;
  hasValidTimestamp: boolean;
  grow: AiDoctorLedgerScopeLabel;
  tent: AiDoctorLedgerScopeLabel;
  plant: AiDoctorLedgerScopeLabel;
  /** True when this session has no plant_id. Purely informational — never a validity signal. */
  isPlantless: boolean;
  evidence: AiDoctorLedgerEvidenceSummary;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NO_SCOPE_LABEL = "—";
const ARCHIVED_OR_UNAVAILABLE_LABEL = "Archived or unavailable";
export const UNKNOWN_TIMESTAMP_LABEL = "Unknown time";
export const DEFAULT_ID_TRUNCATE_CHARS = 8;

const LEGACY_EVIDENCE_LABEL = "Legacy session — no frozen sensor-evidence classification recorded";

const EVIDENCE_TONE_LABEL: Record<Exclude<AiDoctorLedgerEvidenceTone, "legacy">, string> = {
  healthy: "Healthy sensor evidence at save time",
  cautionary: "Cautionary sensor evidence at save time",
  unsafe: "Unsafe or invalid sensor evidence at save time",
  missing: "No sensor data at save time",
};

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/** Parse an ISO-ish timestamp to epoch ms, or null when invalid/missing. */
function parseTimestampMs(ts: string | null | undefined): number | null {
  if (typeof ts !== "string" || ts.trim().length === 0) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Sort key for "newest first, invalid/missing last" ordering. Invalid or
 * missing timestamps sort as if infinitely old — they are still displayed
 * (never dropped), just never allowed to masquerade as recent.
 */
function sortEpochMs(ts: string | null | undefined): number {
  return parseTimestampMs(ts) ?? Number.NEGATIVE_INFINITY;
}

/** Format a timestamp for display, with a safe, honest fallback for invalid/missing values. */
export function formatLedgerTimestamp(ts: string | null | undefined): {
  display: string;
  isValid: boolean;
} {
  const ms = parseTimestampMs(ts);
  if (ms === null) return { display: UNKNOWN_TIMESTAMP_LABEL, isValid: false };
  try {
    return { display: format(new Date(ms), "PPp"), isValid: true };
  } catch {
    return { display: UNKNOWN_TIMESTAMP_LABEL, isValid: false };
  }
}

// ---------------------------------------------------------------------------
// Sorting — stable, newest-first, deterministic tie-breaker
// ---------------------------------------------------------------------------

/**
 * Newest-first comparison for two epoch-ms values. Written as explicit
 * relational comparisons (not subtraction) because both inputs can be
 * `Number.NEGATIVE_INFINITY` (two invalid/missing timestamps) — subtracting
 * `-Infinity - (-Infinity)` is `NaN`, which is not a valid Array.sort
 * comparator result and would leave tie-breaking undefined.
 */
function compareEpochNewestFirst(aMs: number, bMs: number): number {
  if (aMs === bMs) return 0;
  return aMs > bMs ? -1 : 1;
}

/**
 * Stable sort: newest `created_at` first; ties (including two invalid or
 * missing timestamps) break on `id` ascending so ordering is fully
 * deterministic regardless of row insertion order.
 */
export function sortLedgerRows<T extends { id: string; created_at: string | null | undefined }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const diff = compareEpochNewestFirst(sortEpochMs(a.created_at), sortEpochMs(b.created_at));
    if (diff !== 0) return diff;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

// ---------------------------------------------------------------------------
// Id display helpers
// ---------------------------------------------------------------------------

/** Truncate a long id for compact display. Never throws on odd/short inputs. */
export function truncateId(
  id: string | null | undefined,
  visibleChars: number = DEFAULT_ID_TRUNCATE_CHARS,
): string {
  if (typeof id !== "string" || id.length === 0) return NO_SCOPE_LABEL;
  if (id.length <= visibleChars) return id;
  return `${id.slice(0, visibleChars)}…`;
}

/** Turn a snake/kebab-case internal reason code into calm, readable copy. */
export function humanizeReasonCode(code: string | null | undefined): string | null {
  if (typeof code !== "string" || code.trim().length === 0) return null;
  const spaced = code.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------------------------------------------------------------------------
// Scope label resolution
// ---------------------------------------------------------------------------

function buildScopeLabel(
  id: string | null | undefined,
  nameById: ReadonlyMap<string, string>,
): AiDoctorLedgerScopeLabel {
  if (typeof id !== "string" || id.length === 0) {
    return { id: null, label: NO_SCOPE_LABEL, archivedOrUnavailable: false };
  }
  const name = nameById.get(id);
  if (typeof name === "string" && name.length > 0) {
    return { id, label: name, archivedOrUnavailable: false };
  }
  return { id, label: ARCHIVED_OR_UNAVAILABLE_LABEL, archivedOrUnavailable: true };
}

// ---------------------------------------------------------------------------
// Evidence summary — conservative, never over-claims
// ---------------------------------------------------------------------------

function toneFromMode(mode: string | null | undefined): AiDoctorLedgerEvidenceTone {
  switch (mode) {
    case "healthy":
    case "cautionary":
    case "unsafe":
    case "missing":
      return mode;
    default:
      // Unrecognized or absent mode: never invent a reassuring status.
      return "legacy";
  }
}

function buildEvidenceSummary(row: AiDoctorLedgerSessionRow): AiDoctorLedgerEvidenceSummary {
  const tone = toneFromMode(row.sensor_evidence_mode);
  const isLegacy = tone === "legacy";
  const label = isLegacy ? LEGACY_EVIDENCE_LABEL : EVIDENCE_TONE_LABEL[tone];
  const evaluated = formatLedgerTimestamp(row.sensor_evidence_evaluated_at);
  return {
    tone,
    label,
    // Independent, field-by-field null safety: a legacy row that happens to
    // carry a partial reason code or evaluated-at timestamp still surfaces
    // it — "legacy" only changes the headline tone, never hides real data.
    reasonLabel: humanizeReasonCode(row.sensor_snapshot_reason_code),
    countsAsHealthy:
      typeof row.counts_as_healthy_evidence === "boolean" ? row.counts_as_healthy_evidence : null,
    evaluatedAtDisplay: evaluated.isValid ? evaluated.display : null,
    isLegacy,
  };
}

// ---------------------------------------------------------------------------
// Entry + view model builders
// ---------------------------------------------------------------------------

function buildLedgerEntry(
  row: AiDoctorLedgerSessionRow,
  maps: AiDoctorLedgerScopeLabelMaps,
): AiDoctorLedgerEntry {
  const ts = formatLedgerTimestamp(row.created_at);
  const grow = buildScopeLabel(row.grow_id, maps.growNameById);
  const tent = buildScopeLabel(row.tent_id, maps.tentNameById);
  const plant = buildScopeLabel(row.plant_id, maps.plantNameById);
  return {
    id: row.id,
    timestampDisplay: ts.display,
    hasValidTimestamp: ts.isValid,
    grow,
    tent,
    plant,
    isPlantless: plant.id === null,
    evidence: buildEvidenceSummary(row),
  };
}

/**
 * Build the full, sorted ledger view model from raw metadata rows plus
 * owner-resolved scope name maps. Pure; unit-testable without React,
 * Supabase, or a wall clock.
 */
export function buildAiDoctorSessionLedgerViewModel(
  rows: readonly AiDoctorLedgerSessionRow[],
  maps: AiDoctorLedgerScopeLabelMaps = EMPTY_LEDGER_SCOPE_LABEL_MAPS,
): AiDoctorLedgerEntry[] {
  return sortLedgerRows(rows).map((row) => buildLedgerEntry(row, maps));
}
