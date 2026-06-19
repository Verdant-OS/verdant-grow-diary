/**
 * exportRedactionRules — pure safety surface for Verdant CSV / report exports.
 *
 * Goal:
 *   - No export should leak sensitive device fields, raw payloads, bridge
 *     tokens, service-like secrets, MAC addresses, vendor identifiers, or
 *     API-token-shaped strings.
 *
 * Design:
 *   - Per-export-type ALLOWLISTS (preferred over masking). A key not on
 *     the allowlist is dropped entirely from the exported row.
 *   - A shared FORBIDDEN_EXPORT_KEYS list backs a static scanner / runtime
 *     sanity check — even if a future export type forgets to apply an
 *     allowlist, these keys must never ship.
 *   - Sensitive *value* detection (MAC, bridge token, vendor id, long hex,
 *     etc.) is delegated to `actionQueueRedactionRules.ts` so display and
 *     export agree on what "sensitive" looks like. Single source of truth.
 *
 * Pure / deterministic / null-safe. No React, no Supabase, no I/O.
 */

import {
  detectDeviceIdentifierLeaks,
  SENSITIVE_DEVICE_PATTERNS,
  type SensitiveDevicePattern,
} from "./actionQueueRedactionRules";

// ---------------------------------------------------------------------------
// Forbidden export keys — never appear in any export row, regardless of type
// ---------------------------------------------------------------------------

export const FORBIDDEN_EXPORT_KEYS: ReadonlyArray<string> = [
  "target_device",
  "raw_payload",
  "bridge_token",
  "bridge_tokens",
  "secret",
  "secrets",
  "token",
  "api_key",
  "api_keys",
  "apiKey",
  "service_role",
  "service_role_key",
  "passkey",
  "application_key",
  "auth",
  "authorization",
  "session_token",
  "refresh_token",
  "access_token",
  "private_key",
  "webhook_secret",
  "mac",
  "mac_address",
  "device_id",
  "device_serial",
  "vendor_device_id",
  "user_id",
];

const FORBIDDEN_LOWER = new Set(
  FORBIDDEN_EXPORT_KEYS.map((k) => k.toLowerCase()),
);

export function isForbiddenExportKey(key: string): boolean {
  return FORBIDDEN_LOWER.has(key.toLowerCase());
}

// ---------------------------------------------------------------------------
// Per-export-type allowlists (from Step 0 enumeration)
// ---------------------------------------------------------------------------

/** Allowed keys for sensor snapshot CSV / report exports. */
export const SENSOR_SNAPSHOT_EXPORT_ALLOWLIST: ReadonlyArray<string> = [
  "metric",
  "value",
  "unit",
  "source",
  "captured_at",
  "confidence",
  "grow_label",
  "tent_label",
  "plant_label",
  "note",
];

/** Allowed keys for diary / timeline exports. */
export const TIMELINE_EXPORT_ALLOWLIST: ReadonlyArray<string> = [
  "occurred_at",
  "created_at",
  "kind",
  "stage",
  "title",
  "body",
  "summary",
  "grow_label",
  "tent_label",
  "plant_label",
  "photo_count",
  "is_visual_record",
];

/** Allowed keys for Action Queue exports (if/when added). */
export const ACTION_QUEUE_EXPORT_ALLOWLIST: ReadonlyArray<string> = [
  "id",
  "action_type",
  "target_metric",
  "target_label", // safe label from formatActionTargetLabel
  "suggested_change",
  "reason",
  "risk_level",
  "status",
  "source",
  "created_at",
  "approved_at",
  "rejected_at",
  "completed_at",
  "grow_label",
  "tent_label",
  "plant_label",
];

/** Allowed keys for environment summary report exports. */
export const ENVIRONMENT_SUMMARY_EXPORT_ALLOWLIST: ReadonlyArray<string> = [
  "window_start",
  "window_end",
  "metric",
  "min",
  "max",
  "avg",
  "p50",
  "p95",
  "sample_count",
  "source",
  "grow_label",
  "tent_label",
];

export type ExportKind =
  | "sensor_snapshot"
  | "timeline"
  | "action_queue"
  | "environment_summary";

const ALLOWLISTS: Record<ExportKind, ReadonlyArray<string>> = {
  sensor_snapshot: SENSOR_SNAPSHOT_EXPORT_ALLOWLIST,
  timeline: TIMELINE_EXPORT_ALLOWLIST,
  action_queue: ACTION_QUEUE_EXPORT_ALLOWLIST,
  environment_summary: ENVIRONMENT_SUMMARY_EXPORT_ALLOWLIST,
};

export function getExportAllowlist(kind: ExportKind): ReadonlyArray<string> {
  return ALLOWLISTS[kind];
}

// ---------------------------------------------------------------------------
// Safe row construction — allowlist first, then forbidden-key + value scan
// ---------------------------------------------------------------------------

export interface SanitizeOptions {
  /**
   * When true (default), any string value that matches a sensitive device
   * pattern (MAC, bridge token, vendor id, long hex, etc.) is dropped from
   * the output. Set false only in tests that exercise the detector.
   */
  dropSensitiveValues?: boolean;
}

export interface SanitizeResult<T extends Record<string, unknown>> {
  row: Partial<T>;
  /** Keys present on the input that were dropped — useful for audit logs. */
  droppedKeys: string[];
}

/**
 * Build an export-safe row by keeping ONLY allowlisted keys and then
 * defensively dropping any cell whose stringified value contains a
 * sensitive device-identifier pattern (catches upstream contamination
 * where a "safe" label accidentally carries a MAC, etc.).
 *
 * Pure, deterministic.
 */
export function sanitizeExportRow<T extends Record<string, unknown>>(
  row: T,
  kind: ExportKind,
  opts: SanitizeOptions = {},
): SanitizeResult<T> {
  const dropSensitiveValues = opts.dropSensitiveValues !== false;
  const allow = new Set(ALLOWLISTS[kind]);
  const out: Partial<T> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (!allow.has(key) || isForbiddenExportKey(key)) {
      dropped.push(key);
      continue;
    }
    if (dropSensitiveValues && typeof value === "string") {
      if (detectDeviceIdentifierLeaks(value).length > 0) {
        dropped.push(key);
        continue;
      }
    }
    (out as Record<string, unknown>)[key] = value;
  }
  return { row: out, droppedKeys: dropped };
}

export function sanitizeExportRows<T extends Record<string, unknown>>(
  rows: ReadonlyArray<T>,
  kind: ExportKind,
  opts?: SanitizeOptions,
): { rows: Array<Partial<T>>; droppedKeys: string[] } {
  const droppedAll = new Set<string>();
  const safeRows: Array<Partial<T>> = [];
  for (const r of rows) {
    const { row, droppedKeys } = sanitizeExportRow(r, kind, opts);
    droppedKeys.forEach((k) => droppedAll.add(k));
    safeRows.push(row);
  }
  return { rows: safeRows, droppedKeys: Array.from(droppedAll).sort() };
}

// ---------------------------------------------------------------------------
// Header / serialized-output guardrails (used by static scanner test)
// ---------------------------------------------------------------------------

/**
 * Return any forbidden keys present in a CSV header list. Used by export
 * builders to assert their own headers before serializing.
 */
export function findForbiddenHeaders(
  headers: ReadonlyArray<string>,
): string[] {
  return headers.filter((h) => isForbiddenExportKey(h));
}

/**
 * Scan an already-serialized export blob (CSV text, JSON text) for
 * sensitive identifier patterns. Returns matched pattern names; empty
 * means clean.
 */
export function detectExportLeaks(text: string): string[] {
  const leaks = detectDeviceIdentifierLeaks(text);
  // Also flag any forbidden key that slipped into headers / JSON keys.
  const lower = text.toLowerCase();
  const keyLeaks = FORBIDDEN_EXPORT_KEYS.filter((k) =>
    new RegExp(`(^|[",\\s{])${k}\\s*[",:=]`, "i").test(lower),
  ).map((k) => `forbidden_key:${k}`);
  return [...new Set([...leaks.map((l) => l.pattern), ...keyLeaks])];
}

/**
 * Hard-fail guardrail used at export-builder boundaries. Throws an
 * `Error` if the serialized export blob (CSV/JSON/PDF-text) contains any
 * forbidden export key or sensitive device-identifier pattern. Builders
 * call this *after* assembling output, immediately before returning the
 * payload, so contamination from any upstream source surfaces loudly
 * instead of silently shipping.
 *
 * `label` is included in the error for triage (e.g. "ai-doctor-evidence-csv").
 */
export function assertExportSafe(text: string, label: string): void {
  const leaks = detectExportLeaks(text);
  if (leaks.length > 0) {
    throw new Error(
      `[export-redaction] ${label}: forbidden content detected — ${leaks.join(", ")}`,
    );
  }
}

/**
 * Header-time guardrail. Throws if any column on a fixed CSV header list
 * is a forbidden export key. Call this once per module load (top-level)
 * so a future maintainer adding e.g. "target_device" to a column array
 * fails immediately, not at runtime when a user clicks Export.
 */
export function assertExportHeadersSafe(
  headers: ReadonlyArray<string>,
  label: string,
): void {
  const offenders = findForbiddenHeaders(headers);
  if (offenders.length > 0) {
    throw new Error(
      `[export-redaction] ${label}: forbidden header columns — ${offenders.join(", ")}`,
    );
  }
}

// Re-export so callers have one import for both pattern source and rules.
export { SENSITIVE_DEVICE_PATTERNS };
export type { SensitiveDevicePattern };
