/**
 * quickLogActivityDetailFields — data-driven, doctrine-safe detail fields that
 * expand each Quick Log activity beyond a bare note.
 *
 * Pure. No React, no I/O, no persistence. This is the single place the
 * structured detail fields AND their grower-facing copy live, so JSX presenters
 * cannot drift into recommendation or diagnosis language.
 *
 * How it fits the existing pipeline (no schema change):
 *  - Captured values are sanitized here and handed to useQuickLogActivitySave as
 *    `extraDetails`, which merges them into the `quicklog_save_event` p_details
 *    JSON. The write seam (20260721193923 …quicklog_save_event) passes unknown
 *    detail keys through, subject to: total < 20 KB, no secret-like strings, and
 *    a reserved-identity-key blocklist (user_id/grow_id/tent_id/plant_id/
 *    auth_uid/auth.uid). sanitize* below never emits those keys.
 *  - describeQuickLogActivityDetails() reads the stored details back into ordered
 *    label/value display lines for the timeline + recent-activity surfaces.
 *
 * Doctrine (see project knowledge):
 *  - Every field records what the GROWER DID or OBSERVED. Never a diagnosis,
 *    never a recommendation, never a claim about plant health or outcome.
 *  - All fields are optional. A missing field stays unknown, never a default.
 *  - Select options are closed sets of neutral, descriptive labels.
 */

import type { QuickLogActivityId } from "@/constants/quickLogActivityTypes";

/** Reserved identity keys the write seam rejects — never emit these. */
export const QUICK_LOG_DETAIL_RESERVED_KEYS: readonly string[] = Object.freeze([
  "user_id",
  "grow_id",
  "tent_id",
  "plant_id",
  "auth_uid",
  "auth.uid",
]);

/** Max characters kept for a free-text detail value (well under the 20 KB seam). */
export const QUICK_LOG_DETAIL_TEXT_MAX = 200;

export interface QuickLogDetailSelectOption {
  readonly value: string;
  readonly label: string;
}

export type QuickLogDetailFieldKind = "select" | "text";

export interface QuickLogDetailFieldSpec {
  /** Stored key under details.<key>. Never a reserved identity key. */
  readonly key: string;
  /** Grower-facing label (menus, form, timeline). */
  readonly label: string;
  readonly kind: QuickLogDetailFieldKind;
  /** Closed option set for `select` fields. */
  readonly options?: readonly QuickLogDetailSelectOption[];
  /** Placeholder for `text` fields. */
  readonly placeholder?: string;
}

/**
 * Ordered detail fields per activity. Only activities that gain structured
 * detail appear here; the rest keep their existing note-only capture until
 * their own slice lands (built one by one).
 */
export const QUICK_LOG_ACTIVITY_DETAIL_FIELDS: Partial<
  Record<QuickLogActivityId, readonly QuickLogDetailFieldSpec[]>
> = Object.freeze({
  training: [
    {
      key: "technique",
      label: "Technique",
      kind: "select",
      options: [
        { value: "lst", label: "Low-stress training (LST)" },
        { value: "topping", label: "Topping" },
        { value: "fim", label: "FIMing" },
        { value: "supercrop", label: "Super cropping" },
        { value: "lollipop", label: "Lollipopping" },
        { value: "mainline", label: "Mainlining / manifold" },
        { value: "scrog", label: "SCROG net" },
        { value: "staking", label: "Staking / trellis" },
        { value: "transplant", label: "Transplant" },
        { value: "other", label: "Other" },
      ],
    },
  ],
});

export function getQuickLogActivityDetailFields(
  activityId: QuickLogActivityId,
): readonly QuickLogDetailFieldSpec[] {
  return QUICK_LOG_ACTIVITY_DETAIL_FIELDS[activityId] ?? [];
}

function optionLabel(spec: QuickLogDetailFieldSpec, value: string): string | null {
  const match = spec.options?.find((o) => o.value === value);
  return match ? match.label : null;
}

/**
 * Turn raw form values into a sanitized, doctrine-safe details object suitable
 * for extraDetails. Drops unknown keys, reserved identity keys, blank values,
 * out-of-set select values, and over-long text. Returns null when nothing valid
 * remains so callers omit p_details entirely rather than storing {}.
 */
export function sanitizeQuickLogActivityDetails(
  activityId: QuickLogActivityId,
  rawValues: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, string> | null {
  if (!rawValues) return null;
  const specs = getQuickLogActivityDetailFields(activityId);
  if (specs.length === 0) return null;

  const out: Record<string, string> = {};
  for (const spec of specs) {
    if (QUICK_LOG_DETAIL_RESERVED_KEYS.includes(spec.key)) continue; // defense-in-depth
    const raw = rawValues[spec.key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;

    if (spec.kind === "select") {
      // Only accept values that are in the closed option set.
      if (optionLabel(spec, trimmed) === null) continue;
      out[spec.key] = trimmed;
    } else {
      out[spec.key] = trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX);
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

export interface QuickLogDetailDisplayLine {
  readonly key: string;
  readonly label: string;
  /** Human-readable value (option label for selects, raw text otherwise). */
  readonly value: string;
}

/**
 * Read stored details back into ordered display lines for read-only surfaces.
 * Unknown/blank/out-of-set values are skipped so a malformed or partial row
 * degrades to fewer lines rather than showing raw codes or empty rows.
 */
export function describeQuickLogActivityDetails(
  activityId: QuickLogActivityId,
  details: unknown,
): readonly QuickLogDetailDisplayLine[] {
  const specs = getQuickLogActivityDetailFields(activityId);
  if (specs.length === 0) return [];
  if (!details || typeof details !== "object") return [];
  const record = details as Record<string, unknown>;

  const lines: QuickLogDetailDisplayLine[] = [];
  for (const spec of specs) {
    const raw = record[spec.key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;

    if (spec.kind === "select") {
      const label = optionLabel(spec, trimmed);
      if (label === null) continue;
      lines.push({ key: spec.key, label: spec.label, value: label });
    } else {
      lines.push({
        key: spec.key,
        label: spec.label,
        value: trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX),
      });
    }
  }
  return lines;
}

/**
 * Flat lookup of every detail field spec by its (globally unique) key. Built
 * once so the extras-scanning describer below stays O(keys).
 */
const DETAIL_FIELD_BY_KEY: ReadonlyMap<string, QuickLogDetailFieldSpec> = (() => {
  const map = new Map<string, QuickLogDetailFieldSpec>();
  for (const specs of Object.values(QUICK_LOG_ACTIVITY_DETAIL_FIELDS)) {
    for (const spec of specs ?? []) {
      // Field keys are globally unique across activities (enforced by test);
      // first-writer-wins keeps this deterministic even if that ever regresses.
      if (!map.has(spec.key)) map.set(spec.key, spec);
    }
  }
  return map;
})();

/**
 * Describe stored Quick Log detail WITHOUT knowing the activity id.
 *
 * The event-route diary mirror does not preserve a specific activity/event_type
 * on the diary row, so plant-scoped read surfaces cannot pick a per-activity
 * spec. This scans a stored details object for any recognized detail-field key
 * (keys are globally unique) and returns the same ordered display lines. Unknown
 * keys, blank values, and out-of-set select codes are skipped.
 */
export function describeQuickLogDetailsFromExtras(
  details: unknown,
): readonly QuickLogDetailDisplayLine[] {
  if (!details || typeof details !== "object") return [];
  const record = details as Record<string, unknown>;
  const lines: QuickLogDetailDisplayLine[] = [];
  for (const [key, raw] of Object.entries(record)) {
    const spec = DETAIL_FIELD_BY_KEY.get(key);
    if (!spec) continue;
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;

    if (spec.kind === "select") {
      const label = optionLabel(spec, trimmed);
      if (label === null) continue;
      lines.push({ key: spec.key, label: spec.label, value: label });
    } else {
      lines.push({
        key: spec.key,
        label: spec.label,
        value: trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX),
      });
    }
  }
  return lines;
}
