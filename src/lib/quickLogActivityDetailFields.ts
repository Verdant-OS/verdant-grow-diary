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

export type QuickLogDetailFieldKind = "select" | "text" | "number";

export interface QuickLogDetailFieldSpec {
  /** Stored key under details.<key>. Never a reserved identity key. */
  readonly key: string;
  /** Grower-facing label (menus, form, timeline). */
  readonly label: string;
  readonly kind: QuickLogDetailFieldKind;
  /** Closed option set for `select` fields. */
  readonly options?: readonly QuickLogDetailSelectOption[];
  /** Placeholder for `text` / `number` fields. */
  readonly placeholder?: string;
  /**
   * Inclusive plausibility bounds for `number` fields. A value outside the band
   * is dropped (fail-closed) rather than stored — keeps a fat-fingered reading
   * out of the permanent log. The grower's exact entry is preserved as a string.
   */
  readonly min?: number;
  readonly max?: number;
  /** Display unit for `number` fields (e.g. "°C", "%"). Display-only. */
  readonly unit?: string;
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
  // Records what the grower removed — a description of the action, not a claim
  // about recovery, stress, or plant health.
  defoliation: [
    {
      key: "amount",
      label: "Amount removed",
      kind: "select",
      options: [
        { value: "light", label: "Light" },
        { value: "moderate", label: "Moderate" },
        { value: "heavy", label: "Heavy" },
      ],
    },
    {
      key: "canopyArea",
      label: "Canopy area",
      kind: "select",
      options: [
        { value: "upper", label: "Upper canopy" },
        { value: "middle", label: "Middle canopy" },
        { value: "lower", label: "Lower canopy" },
        { value: "inner", label: "Inner / lollipop" },
        { value: "whole", label: "Whole plant" },
      ],
    },
  ],
  // Describes what the photo is OF. Neutral anatomical subjects only — never a
  // judgement about the plant's condition (that stays the grower's, in the note).
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
  // A note stays freeform; the tag is only a light, optional way to file it.
  note: [
    {
      key: "noteTag",
      label: "Tag",
      kind: "select",
      options: [
        { value: "general", label: "General" },
        { value: "reminder", label: "Reminder" },
        { value: "change", label: "Change made" },
        { value: "question", label: "Question" },
      ],
    },
  ],
  // CARDINAL doctrine: captures what the grower SAW, never a cause or diagnosis.
  // Options are visible signs ("yellowing"), not causes ("nitrogen deficiency").
  // Closed set (no free-text "Other") so a logged observation can never smuggle
  // in a diagnosis. Location is where the sign was seen.
  issue_observation: [
    {
      key: "observedSign",
      label: "What you observed",
      kind: "select",
      options: [
        { value: "discoloration", label: "Discoloration / yellowing" },
        { value: "spots", label: "Spots or lesions" },
        { value: "curling", label: "Curling or clawing leaves" },
        { value: "wilting", label: "Wilting or drooping" },
        { value: "crispy_edges", label: "Crispy / burnt edges or tips" },
        { value: "pests_seen", label: "Pests seen (bugs / webbing / eggs)" },
        { value: "mold_seen", label: "Mold or powder seen" },
        { value: "unusual_smell", label: "Unusual smell" },
        { value: "slow_growth", label: "Slow / stalled growth" },
        { value: "physical_damage", label: "Physical damage" },
      ],
    },
    {
      key: "observationLocation",
      label: "Location",
      kind: "select",
      options: [
        { value: "lower_leaves", label: "Lower leaves" },
        { value: "upper_growth", label: "Upper / new growth" },
        { value: "whole_plant", label: "Whole plant" },
        { value: "buds", label: "Buds / flower" },
        { value: "stems", label: "Stems" },
        { value: "medium_surface", label: "Soil / medium surface" },
        { value: "roots", label: "Roots" },
      ],
    },
  ],
  // CARDINAL doctrine: stays a MANUAL observation, distinct from live sensor
  // data. The qualitative check is primary; the optional temp/RH are explicitly
  // labeled "manual" and validated to plausible bands. These are logged as
  // event metadata only — they do NOT flow into the sensor_readings pipeline or
  // VPD surfaces (that is the Manual Sensor Snapshot path).
  environment_check: [
    {
      key: "checkType",
      label: "What you checked / adjusted",
      kind: "select",
      options: [
        { value: "airflow", label: "Airflow / fans" },
        { value: "condensation", label: "Condensation / moisture" },
        { value: "smell", label: "Smell / odor" },
        { value: "light", label: "Light (on-off / height)" },
        { value: "equipment", label: "Equipment / noise" },
        { value: "walkthrough", label: "General walkthrough" },
        { value: "other", label: "Other" },
      ],
    },
    {
      key: "manualTempC",
      label: "Temperature (manual)",
      kind: "number",
      min: -10,
      max: 60,
      unit: "°C",
      placeholder: "e.g. 24",
    },
    {
      key: "manualHumidityPct",
      label: "Humidity (manual)",
      kind: "number",
      min: 0,
      max: 100,
      unit: "%",
      placeholder: "e.g. 55",
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
    } else if (spec.kind === "number") {
      // Plausibility fence: finite and within the inclusive band, else dropped.
      const n = Number(trimmed);
      if (!Number.isFinite(n)) continue;
      if (typeof spec.min === "number" && n < spec.min) continue;
      if (typeof spec.max === "number" && n > spec.max) continue;
      // Preserve the grower's exact entry as a string (matches harvest details).
      out[spec.key] = trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX);
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
 * Format one stored value against its field spec into a display line, or null
 * when the value is blank/invalid/out-of-band. Shared by both describers so
 * select-label mapping, number bounds, and unit suffixing stay in one place.
 */
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
  if (spec.kind === "number") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    if (typeof spec.min === "number" && n < spec.min) return null;
    if (typeof spec.max === "number" && n > spec.max) return null;
    const shown = trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX);
    return { key: spec.key, label: spec.label, value: spec.unit ? `${shown} ${spec.unit}` : shown };
  }
  return { key: spec.key, label: spec.label, value: trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX) };
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
    const line = formatDetailLine(spec, record[spec.key]);
    if (line) lines.push(line);
  }
  return lines;
}

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
  // Preserve spec order per activity rather than raw-key insertion order, so
  // multi-field activities (e.g. observed sign then location) read consistently.
  const lines: QuickLogDetailDisplayLine[] = [];
  const seen = new Set<string>();
  for (const specs of Object.values(QUICK_LOG_ACTIVITY_DETAIL_FIELDS)) {
    for (const spec of specs ?? []) {
      if (seen.has(spec.key)) continue;
      seen.add(spec.key);
      if (!(spec.key in record)) continue;
      const line = formatDetailLine(spec, record[spec.key]);
      if (line) lines.push(line);
    }
  }
  return lines;
}
