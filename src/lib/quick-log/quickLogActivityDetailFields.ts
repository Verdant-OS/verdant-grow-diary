/**
 * quickLogActivityDetailFields — structured detail fields that expand a Quick
 * Log activity beyond a bare note, for the activities this slice covers
 * (Training, Photo).
 *
 * Pure. No React, no I/O, no persistence. This is the single place these
 * fields AND their grower-facing copy live, so JSX presenters cannot drift
 * into recommendation or diagnosis language.
 *
 * How it fits the existing pipeline (no schema/RPC change):
 *   - Captured values are sanitized here and passed to createQuickLogEvent as
 *     `extraDetails`, merged into the `quicklog_save_event` p_details JSON.
 *     `training` and `photo` are already-valid `event_type` values at both
 *     the RPC's own allowlist and the `validate_grow_event` DB trigger
 *     (supabase/migrations/20260707130000_quicklog_save_event_trust_boundary_hardening.sql)
 *     — no migration needed.
 *   - describeQuickLogDetailsFromExtras() reads the stored details back into
 *     ordered label/value display lines for the Timeline + Recent Activity
 *     read surfaces.
 *
 * Vocabulary note: unlike the deploy branch (verdant-grow-diary), where
 * Training and Defoliation are two separate activities, `main`'s own
 * TRAINING_TECHNIQUES already lists "defoliation" as one technique value —
 * so it's modeled here as a technique choice within Training, with an
 * Intensity field that only applies for that one technique (see `dependsOn`
 * below). Fields are imported from quickLogTypedEventPayloadRules.ts, not
 * duplicated, so this module can never drift out of sync with the canonical
 * vocabulary the typed adapter validates against.
 *
 * Doctrine (see project knowledge):
 *   - Every field records what the GROWER DID or OBSERVED. Never a
 *     diagnosis, never a recommendation, never a claim about plant health.
 *   - All fields are optional. A missing field stays unknown, never a
 *     default.
 *   - Select options are closed sets of neutral, descriptive labels.
 */
import { TRAINING_TECHNIQUES, TRAINING_INTENSITIES } from "@/lib/quickLogTypedEventPayloadRules";
import type { QuickLogEventType } from "./createQuickLogEvent";

/**
 * Keys the quicklog_save_event RPC's own merge
 * (`v_extra || jsonb_build_object(...)`, right-hand side wins on collision —
 * ...trust_boundary_hardening.sql:284) always overwrites. Never emit these;
 * a caller-supplied value here would be silently discarded.
 */
export const QUICK_LOG_DETAIL_CLOBBERED_KEYS: readonly string[] = Object.freeze([
  "sensor_snapshot",
  "photo_url",
  "watering",
  "feeding",
  "quick_log_version",
  "linked_grow_event_id",
]);

/**
 * Identity/auth keys — defense in depth. None of these is actually read from
 * p_details by this RPC today, but matches this codebase's established
 * reserved-key convention for detail-field modules.
 */
export const QUICK_LOG_DETAIL_RESERVED_KEYS: readonly string[] = Object.freeze([
  "user_id",
  "grow_id",
  "tent_id",
  "plant_id",
  "auth_uid",
  "auth.uid",
  ...QUICK_LOG_DETAIL_CLOBBERED_KEYS,
]);

/** Max characters kept for a free-text detail value. */
export const QUICK_LOG_DETAIL_TEXT_MAX = 200;

export interface QuickLogDetailSelectOption {
  readonly value: string;
  readonly label: string;
}

export type QuickLogDetailFieldKind = "select" | "text";

export interface QuickLogDetailFieldSpec {
  /** Stored key under details.<key>. */
  readonly key: string;
  /** Grower-facing label (form, timeline, recent-activity badges). */
  readonly label: string;
  readonly kind: QuickLogDetailFieldKind;
  /** Closed option set for `select` fields. */
  readonly options?: readonly QuickLogDetailSelectOption[];
  /** Placeholder for `text` fields. */
  readonly placeholder?: string;
  /**
   * When set, this field is only collected, sanitized, or described when the
   * sibling field named `key` currently equals `equals`. Used for Intensity,
   * which only applies when Technique = "defoliation".
   */
  readonly dependsOn?: { readonly key: string; readonly equals: string };
}

const TRAINING_TECHNIQUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  lst: "Low-stress training (LST)",
  topping: "Topping",
  fim: "FIMing",
  defoliation: "Defoliation",
  supercropping: "Super cropping",
  scrog: "SCROG net",
  manifold: "Mainlining / manifold",
  other: "Other",
});

const TRAINING_INTENSITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
});

function toOptions(
  values: ReadonlySet<string>,
  labels: Readonly<Record<string, string>>,
): readonly QuickLogDetailSelectOption[] {
  return [...values].map((value) => ({ value, label: labels[value] ?? value }));
}

/**
 * Ordered detail fields per activity. Only activities that gain structured
 * detail in this slice appear here; other activities keep note-only capture.
 */
export const QUICK_LOG_ACTIVITY_DETAIL_FIELDS: Partial<
  Record<QuickLogEventType, readonly QuickLogDetailFieldSpec[]>
> = Object.freeze({
  training: [
    {
      key: "technique",
      label: "Technique",
      kind: "select",
      options: toOptions(TRAINING_TECHNIQUES, TRAINING_TECHNIQUE_LABELS),
    },
    // Records what the grower removed — a description of the action, not a
    // claim about recovery, stress, or plant health. Only meaningful (and
    // only ever collected/persisted/described) when technique="defoliation".
    {
      key: "intensity",
      label: "Amount removed",
      kind: "select",
      options: toOptions(TRAINING_INTENSITIES, TRAINING_INTENSITY_LABELS),
      dependsOn: { key: "technique", equals: "defoliation" },
    },
  ],
  // Describes what the photo is OF. Neutral anatomical subjects only — never
  // a judgement about the plant's condition (that stays the grower's, in the
  // separate general Note field).
  photo: [
    {
      key: "subject",
      label: "Subject",
      kind: "select",
      options: [
        { value: "whole_plant", label: "Whole plant" },
        { value: "leaves", label: "Leaves" },
        { value: "buds", label: "Buds / flower" },
        { value: "trichomes", label: "Trichomes / macro" },
        { value: "roots", label: "Roots" },
        { value: "stem", label: "Stem / node" },
        { value: "setup", label: "Setup / environment" },
        { value: "other", label: "Other" },
      ],
    },
    {
      key: "caption",
      label: "Caption",
      kind: "text",
      placeholder: "What this photo shows",
    },
  ],
});

export function getQuickLogActivityDetailFields(
  activityId: QuickLogEventType,
): readonly QuickLogDetailFieldSpec[] {
  return QUICK_LOG_ACTIVITY_DETAIL_FIELDS[activityId] ?? [];
}

function optionLabel(spec: QuickLogDetailFieldSpec, value: string): string | null {
  const match = spec.options?.find((o) => o.value === value);
  return match ? match.label : null;
}

function dependsOnSatisfied(
  spec: QuickLogDetailFieldSpec,
  values: Readonly<Record<string, unknown>>,
): boolean {
  if (!spec.dependsOn) return true;
  return values[spec.dependsOn.key] === spec.dependsOn.equals;
}

/**
 * Turn raw form values into a sanitized, doctrine-safe details object for
 * `extraDetails`. Drops unknown keys, reserved/clobbered keys, blank values,
 * out-of-set select values, over-long text, and any field whose `dependsOn`
 * gate isn't satisfied (defense in depth — the UI should never send an
 * intensity for a non-defoliation technique, but a mismatched pair like
 * {technique:"lst", intensity:"heavy"} must never persist even if it does).
 * Always injects `event_type: activityId` when anything else survives — this
 * is what makes Timeline's badge dispatch (getEventType) and
 * QuickLogHistoryPanels' lane routing (laneForEventType) recognize the row;
 * diary_entries has no event_type column, only whatever's inside `details`.
 * Returns null when nothing survives so callers omit p_details entirely
 * rather than storing {}.
 */
export function sanitizeQuickLogActivityDetails(
  activityId: QuickLogEventType,
  rawValues: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> | null {
  const specs = getQuickLogActivityDetailFields(activityId);
  if (specs.length === 0) return null;

  const out: Record<string, unknown> = {};
  const values = rawValues ?? {};
  for (const spec of specs) {
    if (QUICK_LOG_DETAIL_RESERVED_KEYS.includes(spec.key)) continue;
    if (!dependsOnSatisfied(spec, values)) continue;
    const raw = values[spec.key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;

    if (spec.kind === "select") {
      if (optionLabel(spec, trimmed) === null) continue;
      out[spec.key] = trimmed;
    } else {
      out[spec.key] = trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX);
    }
  }

  if (Object.keys(out).length === 0) return null;
  out.event_type = activityId;
  return out;
}

export interface QuickLogDetailDisplayLine {
  readonly key: string;
  readonly label: string;
  /** Human-readable value (option label for selects, raw text otherwise). */
  readonly value: string;
}

function formatDetailLine(
  spec: QuickLogDetailFieldSpec,
  raw: unknown,
): QuickLogDetailDisplayLine | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (spec.kind === "select") {
    const label = optionLabel(spec, trimmed);
    if (label === null) return null;
    return { key: spec.key, label: spec.label, value: label };
  }
  return { key: spec.key, label: spec.label, value: trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX) };
}

/**
 * Describe stored Quick Log detail WITHOUT knowing the activity id ahead of
 * time. The diary mirror carries no reliable activity marker of its own —
 * this scans a stored details object for any recognized detail-field key and
 * returns ordered display lines, honoring each field's `dependsOn` gate so a
 * stray/legacy `intensity` value never displays against a non-defoliation
 * technique. Unknown keys, blank values, and out-of-set select codes are
 * skipped, so a malformed or partial row degrades to fewer lines rather than
 * showing raw codes or empty rows.
 */
export function describeQuickLogDetailsFromExtras(
  details: unknown,
): readonly QuickLogDetailDisplayLine[] {
  if (!details || typeof details !== "object") return [];
  const record = details as Record<string, unknown>;

  const lines: QuickLogDetailDisplayLine[] = [];
  const seen = new Set<string>();
  for (const specs of Object.values(QUICK_LOG_ACTIVITY_DETAIL_FIELDS)) {
    for (const spec of specs ?? []) {
      if (seen.has(spec.key)) continue;
      seen.add(spec.key);
      if (!dependsOnSatisfied(spec, record)) continue;
      const line = formatDetailLine(spec, record[spec.key]);
      if (line) lines.push(line);
    }
  }
  return lines;
}
