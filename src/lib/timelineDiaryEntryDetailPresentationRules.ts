/**
 * timelineDiaryEntryDetailPresentationRules — single source of truth for
 * deciding what a diary entry's `details` JSONB blob is safe to render on
 * the Grow Timeline, versus what must never render raw.
 *
 * Why this lives alone (Codex review, PR #502):
 *  - This logic previously lived inline inside Timeline.tsx's per-entry
 *    render body as a `HIDDEN` array + a chain of per-category booleans.
 *    Every diary writer that adds a new internal/machine field (a Pheno
 *    evidence receipt, a Quick Log v2 companion-row plumbing field, a
 *    future AI Doctor or learning-loop marker) has to remember to update
 *    that inline list, or the default-open raw "key: value" chip fallback
 *    silently exposes it to the grower — which is exactly how two
 *    unrelated leaks (hunt_id/evidence_goal/... and quick_log_version/
 *    linked_grow_event_id/...) both happened in production. Centralizing
 *    the rule in one tested, pure module makes "does this leak?" a single
 *    answerable question instead of an implicit render-body side effect.
 *
 * When you add a new diary/QuickLog writer with internal-only fields:
 *  1. If the ENTIRE details blob is machine bookkeeping for one event
 *     kind (e.g. a receipt/marker with its own `kind` discriminator),
 *     add that kind to `SUPPRESSED_DETAIL_KINDS` below so nothing from
 *     it ever reaches the raw fallback.
 *  2. If only SOME top-level keys are internal (schema-version markers,
 *     join ids, redundant echoes of a row-level column), add those keys
 *     to `HIDDEN_DIARY_DETAIL_KEYS` below.
 *  3. If the field is genuinely grower-facing, register it as a proper
 *     structured field in `quickLogActivityDetailFields.ts` so it gets a
 *     real label instead of a raw snake_case chip.
 *
 * Pure. No React, no I/O, no Supabase.
 */
import {
  describeQuickLogDetailsFromExtras,
  QUICK_LOG_DETAIL_FIELD_KEYS,
  type QuickLogDetailDisplayLine,
} from "@/lib/quickLogActivityDetailFields";
import {
  celsiusToFahrenheit,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import { PHENO_EVIDENCE_RECEIPT_KIND } from "@/lib/phenoEvidenceCaptureRules";
import { readDetailsLoggedAt } from "@/lib/quicklogManualDiagnosticsRules";

/**
 * Top-level detail keys that must never render as a raw "key: value" chip,
 * regardless of event kind or value. Pure internal bookkeeping: schema
 * version markers, foreign-key join ids, and echoes already presented by a
 * dedicated element elsewhere on the card.
 */
export const HIDDEN_DIARY_DETAIL_KEYS: ReadonlySet<string> = new Set([
  "event_type",
  "plant_id",
  "plant_name",
  "tent_id",
  // Shown by the dedicated tent chip. A raw tent_name chip would repeat it.
  "tent_name",
  "sensor",
  "sensor_snapshot",
  "manual_sensor_snapshot",
  "remind_at",
  // Quick Log v2 companion-row plumbing (see quickLogDiaryCompanionRules.ts):
  // a schema version marker and a grow_events join id.
  "quick_log_version",
  "linked_grow_event_id",
  // Correction/retraction handle (issue #786): display-only spine join id
  // stamped by growEventToDiaryRawEntry so history-panel controls can
  // target the right root. Machine bookkeeping; never a chip.
  "origin_grow_event_id",
  // Guided Symptom Check stage is presented by its dedicated evidence card.
  "observation_stage",
  // Redundant with the dedicated photo render, which reads the row-level
  // photo_url column directly.
  "photo_url",
  // Written by the photo diary seam. Growers see a labeled local time and
  // "Attached to", never the raw snake_case chip.
  "logged_at",
  "attached_to_action",
  // Operator attestation blob. Never a grower-facing chip.
  "manual_provenance",
]);

/**
 * `details.kind` values whose ENTIRE blob is machine bookkeeping for a
 * dedicated feature (not general QuickLog activity detail) and must never
 * reach the raw fallback. Learning-loop and AI Doctor readiness-check rows
 * are excluded by their own dedicated presenters upstream of this module
 * (they carry no stable `details.kind` this module can key off); Pheno
 * evidence receipts are the one case identified so far that flows through
 * the generic diary render path.
 */
const SUPPRESSED_DETAIL_KINDS: ReadonlySet<string> = new Set([PHENO_EVIDENCE_RECEIPT_KIND]);

export interface TimelineDiaryEntryDetailPresentation {
  /** Structured, labeled display lines (e.g. "Technique: Topping"). */
  readonly detailLines: readonly QuickLogDetailDisplayLine[];
  /** Remaining raw "key: value" chips — last-resort fallback only. */
  readonly extra: ReadonlyArray<readonly [key: string, value: string]>;
}

const EMPTY_PRESENTATION: TimelineDiaryEntryDetailPresentation = Object.freeze({
  detailLines: [],
  extra: [],
});

function detailsRecord(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

/**
 * Decide whether a diary entry's `details` blob is entirely internal
 * bookkeeping that must never reach the generic render path (learning-loop
 * rows, AI Doctor readiness checks, Pheno evidence receipts, ...).
 * `suppress` covers categories this module cannot key off `details` alone
 * (e.g. learning-loop rows, keyed off the row's `event_type`) — pass the
 * caller's own classification for those.
 */
export function isFullySuppressedTimelineDetail(details: unknown, suppress = false): boolean {
  if (suppress) return true;
  const record = detailsRecord(details);
  return typeof record.kind === "string" && SUPPRESSED_DETAIL_KINDS.has(record.kind);
}

/**
 * Compute what a diary entry's `details` blob is safe to present: labeled
 * structured lines, plus any remaining unrecognized-but-non-null key as a
 * last-resort raw chip. Returns an empty presentation when the entry is
 * fully suppressed (see `isFullySuppressedTimelineDetail`).
 *
 * A null-valued key is always dropped from the raw fallback — the write
 * seam echoes several always-present-but-often-null fields (e.g.
 * feeding/watering on a non-feeding/watering entry) onto every row, and a
 * null value is "not provided", never "feeding: null" (matching this
 * codebase's absence-stays-unknown doctrine).
 */
export interface TimelineDiaryDetailPresentationOptions {
  suppress?: boolean;
  /** IANA zone for `logged_at`. Omitted uses the runtime local zone. */
  timeZone?: string;
  /** Test seam. When set, it replaces the local timestamp formatter. */
  formatTimestamp?: (iso: string) => string | null;
}

function formatDiaryDetailTimestamp(iso: string, timeZone?: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return null;
  }
}

function friendlyAttachedAction(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > 80) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const TYPED_ACTIVITY_ENVELOPES = ["watering", "feeding"] as const;

const TYPED_ACTIVITY_FIELD_LABELS: Record<string, string> = {
  ph: "pH",
  ec_ms_cm: "EC",
  ec_in: "EC in",
  ec_out: "EC out",
  runoff_ml: "Runoff",
  runoff_ph: "Runoff pH",
  runoff_ec: "Runoff EC",
  water_temp_c: "Water temperature",
};

function typedActivityScalar(
  key: string,
  value: unknown,
  tempUnit: TemperatureUnitPreference,
): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (key === "volume_ml" || key === "runoff_ml") return `${value} ml`;
    if (key === "water_temp_c") {
      const displayed = tempUnit === "fahrenheit" ? celsiusToFahrenheit(value) : value;
      const shown = String(Math.round(displayed * 10) / 10);
      return `${shown} ${tempUnit === "fahrenheit" ? "°F" : "°C"}`;
    }
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "default") return null;
    return trimmed;
  }
  return null;
}

function typedProductText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const brand =
    typeof record.brand === "string"
      ? record.brand.trim()
      : typeof record.nutrient_brand === "string"
        ? record.nutrient_brand.trim()
        : "";
  const identity = name && brand ? `${name} (${brand})` : name || brand;
  if (!identity) return null;
  const amount =
    typeof record.amount === "number" && Number.isFinite(record.amount) ? record.amount : null;
  const unit = typeof record.unit === "string" ? record.unit.trim() : "";
  if (amount != null && unit) return `${identity} ${amount} ${unit}`;
  return identity;
}

function plainDetailValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed === "") return null;
      parts.push(trimmed);
    } else if (typeof item === "number") {
      if (!Number.isFinite(item)) return null;
      parts.push(String(item));
    } else if (typeof item === "boolean") {
      parts.push(String(item));
    } else {
      return null;
    }
  }
  return parts.join(", ");
}

function typedVolumeLabel(envelope: (typeof TYPED_ACTIVITY_ENVELOPES)[number]): string {
  return envelope === "watering" ? "Water Volume" : "Feed Volume";
}

function typedActivityEnvelopeLines(
  envelope: (typeof TYPED_ACTIVITY_ENVELOPES)[number],
  value: unknown,
  tempUnit: TemperatureUnitPreference,
): QuickLogDetailDisplayLine[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const lines: QuickLogDetailDisplayLine[] = [];
  for (const [key, child] of Object.entries(record)) {
    if (key === "products" || key === "nutrients") {
      const items = Array.isArray(child) ? child : [child];
      const texts = items
        .map((item) => typedProductText(item))
        .filter((item): item is string => item != null);
      if (texts.length > 0) {
        lines.push({ key: `${envelope}.${key}`, label: "Products", value: texts.join(", ") });
      }
      continue;
    }
    const label =
      key === "volume_ml" ? typedVolumeLabel(envelope) : TYPED_ACTIVITY_FIELD_LABELS[key];
    const text = typedActivityScalar(key, child, tempUnit);
    if (!label || !text) continue;
    lines.push({ key: `${envelope}.${key}`, label, value: text });
  }
  return lines;
}

function withGrowerFacingDetailLines(
  record: Record<string, unknown>,
  lines: readonly QuickLogDetailDisplayLine[],
  options: TimelineDiaryDetailPresentationOptions,
): QuickLogDetailDisplayLine[] {
  const next = [...lines];
  if (typeof record.logged_at === "string" && !next.some((line) => line.key === "logged_at")) {
    const reading = readDetailsLoggedAt({ logged_at: record.logged_at });
    if (reading.parseable && reading.value) {
      const formatted = options.formatTimestamp
        ? options.formatTimestamp(reading.value)
        : formatDiaryDetailTimestamp(reading.value, options.timeZone);
      if (formatted) next.push({ key: "logged_at", label: "Logged at", value: formatted });
    }
  }
  const attached = friendlyAttachedAction(record.attached_to_action);
  if (attached && !next.some((line) => line.key === "attached_to_action")) {
    next.push({ key: "attached_to_action", label: "Attached to", value: attached });
  }
  return next;
}

export function presentTimelineDiaryEntryDetails(
  details: unknown,
  tempUnit: TemperatureUnitPreference,
  options: TimelineDiaryDetailPresentationOptions = {},
): TimelineDiaryEntryDetailPresentation {
  if (isFullySuppressedTimelineDetail(details, options.suppress)) return EMPTY_PRESENTATION;

  const record = detailsRecord(details);
  const detailLines = withGrowerFacingDetailLines(
    record,
    describeQuickLogDetailsFromExtras(details, tempUnit),
    options,
  );
  for (const envelope of TYPED_ACTIVITY_ENVELOPES) {
    detailLines.push(...typedActivityEnvelopeLines(envelope, record[envelope], tempUnit));
  }
  const extra = Object.entries(record)
    .filter(
      ([k]) =>
        !HIDDEN_DIARY_DETAIL_KEYS.has(k) &&
        !QUICK_LOG_DETAIL_FIELD_KEYS.has(k) &&
        !TYPED_ACTIVITY_ENVELOPES.includes(k as (typeof TYPED_ACTIVITY_ENVELOPES)[number]),
    )
    .map(([k, v]) => {
      const text = plainDetailValue(v);
      return text == null ? null : ([k, text] as const);
    })
    .filter((entry): entry is readonly [string, string] => entry != null);

  return { detailLines, extra };
}
