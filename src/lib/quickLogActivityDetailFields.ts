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
 * Canonical-contract conformance (Codex review, PR #441):
 *  - Training/defoliation VALUE CODES come from the canonical vocabulary in
 *    quickLogTypedEventPayloadRules.ts (TRAINING_TECHNIQUES / TRAINING_INTENSITIES)
 *    so the typed adapter accepts them and diaryCalendarViewModel labels them.
 *    Codes are load-bearing; labels here are grower-facing only.
 *  - Environment-check manual readings persist inside the canonical NESTED
 *    envelope `details.environment_check = { temp_c, humidity_pct }` (numbers),
 *    which environmentCheckInsightsViewModel / environmentCheckTimelineViewModel
 *    read via pickEnvelope(). temp is CELSIUS → `temp_c`; never `room_temp_f`
 *    (that key is Fahrenheit — mis-mapping silently corrupts to ~-4 °C).
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
  /** Stored key under details.<key> (or under details.<envelope>.<key>). */
  readonly key: string;
  /** Grower-facing label (menus, form, timeline). */
  readonly label: string;
  readonly kind: QuickLogDetailFieldKind;
  /** Closed option set for `select` fields. */
  readonly options?: readonly QuickLogDetailSelectOption[];
  /** Placeholder for `text` / `number` fields. */
  readonly placeholder?: string;
  /**
   * Inclusive plausibility bounds for `number` fields. The UI blocks the save
   * with an inline error when a value is out of band (see
   * validateQuickLogDetailNumberInput); sanitize keeps the same band as a
   * defensive floor so an out-of-band value can never be persisted.
   */
  readonly min?: number;
  readonly max?: number;
  /** Display unit for `number` fields (e.g. "°C", "%"). Display-only. */
  readonly unit?: string;
  /**
   * When set, the value is stored NESTED at details.<envelope>.<key> as a
   * NUMBER — used to conform to an existing canonical envelope contract
   * (e.g. details.environment_check.temp_c) instead of inventing flat keys.
   */
  readonly envelope?: string;
}

/**
 * Fixed details an activity always persists alongside grower-chosen fields.
 * Defoliation must carry technique="defoliation" so the canonical typed
 * training adapter (which requires an explicit `technique`) accepts it — the
 * details.subtype fence alone is only read by the calendar presenter.
 */
export const QUICK_LOG_ACTIVITY_FIXED_DETAILS: Partial<
  Record<QuickLogActivityId, Readonly<Record<string, string>>>
> = Object.freeze({
  defoliation: Object.freeze({ technique: "defoliation" }),
});

/**
 * Ordered detail fields per activity. Only activities that gain structured
 * detail appear here; the rest keep their existing note-only capture.
 */
export const QUICK_LOG_ACTIVITY_DETAIL_FIELDS: Partial<
  Record<QuickLogActivityId, readonly QuickLogDetailFieldSpec[]>
> = Object.freeze({
  // Value codes are the canonical TRAINING_TECHNIQUES subset (excluding
  // "defoliation", which is its own activity). Adding a non-canonical code here
  // would be rejected by the typed adapter as technique:invalid and silently
  // unlabeled on the diary calendar.
  training: [
    {
      key: "technique",
      label: "Technique",
      kind: "select",
      options: [
        { value: "lst", label: "Low-stress training (LST)" },
        { value: "topping", label: "Topping" },
        { value: "fim", label: "FIMing" },
        { value: "supercropping", label: "Super cropping" },
        { value: "manifold", label: "Mainlining / manifold" },
        { value: "scrog", label: "SCROG net" },
        { value: "other", label: "Other" },
      ],
    },
  ],
  // Records what the grower removed — a description of the action, not a claim
  // about recovery, stress, or plant health. Key `intensity` + values
  // light/medium/heavy are the canonical TRAINING_INTENSITIES contract.
  defoliation: [
    {
      key: "intensity",
      label: "Amount removed",
      kind: "select",
      options: [
        { value: "light", label: "Light" },
        { value: "medium", label: "Medium" },
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
  // labeled "manual", plausibility-bounded, and persisted inside the canonical
  // details.environment_check envelope (as numbers) so the Diary Calendar
  // insights/timeline read them. They do NOT flow into the sensor_readings
  // pipeline or VPD surfaces (that is the Manual Sensor Snapshot path).
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
      key: "temp_c",
      label: "Temperature (manual)",
      kind: "number",
      min: -10,
      max: 60,
      unit: "°C",
      placeholder: "e.g. 24",
      envelope: "environment_check",
    },
    {
      key: "humidity_pct",
      label: "Humidity (manual)",
      kind: "number",
      min: 0,
      max: 100,
      unit: "%",
      placeholder: "e.g. 55",
      envelope: "environment_check",
    },
  ],
});

export function getQuickLogActivityDetailFields(
  activityId: QuickLogActivityId,
): readonly QuickLogDetailFieldSpec[] {
  return QUICK_LOG_ACTIVITY_DETAIL_FIELDS[activityId] ?? [];
}

/**
 * Every TOP-LEVEL details key this module can produce: flat field keys,
 * envelope parent keys, fixed-detail keys, plus the save hook's `subtype`
 * fence. Read surfaces (e.g. the Timeline generic chip loop) use this to keep
 * structured keys out of raw `key: value` rendering — including keys whose
 * VALUE fails validation and therefore produces no labeled display line.
 */
export const QUICK_LOG_DETAIL_FIELD_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(QUICK_LOG_ACTIVITY_DETAIL_FIELDS).flatMap((specs) =>
    (specs ?? []).map((s) => s.envelope ?? s.key),
  ),
  ...Object.values(QUICK_LOG_ACTIVITY_FIXED_DETAILS).flatMap((fixed) =>
    Object.keys(fixed ?? {}),
  ),
  // Written by useQuickLogActivitySave's metadata fence (e.g. "defoliation",
  // "issue"); machine routing data, never useful as a raw chip.
  "subtype",
  // Dual-timestamp keys on quick-log companions: consumed by the
  // observation-time resolver / read layers, never raw chips.
  "logged_at",
  "event_type",
]);

function optionLabel(spec: QuickLogDetailFieldSpec, value: string): string | null {
  const match = spec.options?.find((o) => o.value === value);
  return match ? match.label : null;
}

export interface QuickLogDetailNumberValidation {
  ok: boolean;
  error: string | null;
}

export function quickLogDetailNumberRangeError(spec: QuickLogDetailFieldSpec): string {
  const unit = spec.unit ? ` ${spec.unit}` : "";
  return `Enter a value between ${spec.min} and ${spec.max}${unit}.`;
}

export const QUICK_LOG_DETAIL_NOT_A_NUMBER_ERROR = "Enter a number.";

/**
 * Blocking UI validation for `number` detail fields. Blank/missing means "not
 * provided" and passes (all fields are optional). Everything the grower DID
 * type must either persist or block: a non-numeric entry ("24C", "fifty") and
 * an out-of-band number both BLOCK the save with an inline error, so a typed
 * value is never silently discarded behind a success receipt (harvest-gate
 * strictness — the free-text input only hints inputMode=decimal).
 */
export function validateQuickLogDetailNumberInput(
  spec: QuickLogDetailFieldSpec,
  raw: string | null | undefined,
): QuickLogDetailNumberValidation {
  if (spec.kind !== "number") return { ok: true, error: null };
  if (raw == null) return { ok: true, error: null };
  const trimmed = String(raw).trim();
  if (trimmed === "") return { ok: true, error: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { ok: false, error: QUICK_LOG_DETAIL_NOT_A_NUMBER_ERROR };
  }
  if (typeof spec.min === "number" && n < spec.min) {
    return { ok: false, error: quickLogDetailNumberRangeError(spec) };
  }
  if (typeof spec.max === "number" && n > spec.max) {
    return { ok: false, error: quickLogDetailNumberRangeError(spec) };
  }
  return { ok: true, error: null };
}

/**
 * Turn raw form values into a sanitized, doctrine-safe details object suitable
 * for extraDetails. Drops unknown keys, reserved identity keys, blank values,
 * out-of-set select values, out-of-band numbers, and over-long text. Envelope
 * fields are nested (as numbers) under their canonical parent key. Fixed
 * details for the activity are always merged in. Returns null when nothing
 * remains so callers omit p_details entirely rather than storing {}.
 */
export function sanitizeQuickLogActivityDetails(
  activityId: QuickLogActivityId,
  rawValues: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> | null {
  const specs = getQuickLogActivityDetailFields(activityId);
  const fixed = QUICK_LOG_ACTIVITY_FIXED_DETAILS[activityId] ?? null;
  if (specs.length === 0 && !fixed) return null;

  const out: Record<string, unknown> = {};
  const values = rawValues ?? {};
  for (const spec of specs) {
    // Defense-in-depth: neither the storage key nor an envelope parent may be
    // a reserved identity key.
    if (QUICK_LOG_DETAIL_RESERVED_KEYS.includes(spec.key)) continue;
    if (spec.envelope && QUICK_LOG_DETAIL_RESERVED_KEYS.includes(spec.envelope)) continue;
    const raw = values[spec.key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;

    if (spec.kind === "select") {
      // Only accept values that are in the closed option set.
      if (optionLabel(spec, trimmed) === null) continue;
      out[spec.key] = trimmed;
    } else if (spec.kind === "number") {
      // Plausibility floor: finite and within the inclusive band, else dropped.
      // (The UI gate blocks out-of-band saves before this ever runs.)
      const n = Number(trimmed);
      if (!Number.isFinite(n)) continue;
      if (typeof spec.min === "number" && n < spec.min) continue;
      if (typeof spec.max === "number" && n > spec.max) continue;
      if (spec.envelope) {
        // Canonical nested envelope, numeric — e.g. environment_check.temp_c.
        const parent = (out[spec.envelope] ?? {}) as Record<string, unknown>;
        parent[spec.key] = n;
        out[spec.envelope] = parent;
      } else {
        // Flat number fields keep the grower's exact entry as a string
        // (matches harvest details).
        out[spec.key] = trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX);
      }
    } else {
      out[spec.key] = trimmed.slice(0, QUICK_LOG_DETAIL_TEXT_MAX);
    }
  }

  if (fixed) {
    for (const [k, v] of Object.entries(fixed)) {
      if (QUICK_LOG_DETAIL_RESERVED_KEYS.includes(k)) continue;
      out[k] = v;
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
 * Number fields accept stored numbers (canonical envelopes) or numeric strings.
 */
function formatDetailLine(
  spec: QuickLogDetailFieldSpec,
  raw: unknown,
): QuickLogDetailDisplayLine | null {
  if (spec.kind === "number") {
    let n: number;
    if (typeof raw === "number") {
      n = raw;
    } else if (typeof raw === "string" && raw.trim() !== "") {
      n = Number(raw.trim());
    } else {
      return null;
    }
    if (!Number.isFinite(n)) return null;
    if (typeof spec.min === "number" && n < spec.min) return null;
    if (typeof spec.max === "number" && n > spec.max) return null;
    const shown = String(n).slice(0, QUICK_LOG_DETAIL_TEXT_MAX);
    return { key: spec.key, label: spec.label, value: spec.unit ? `${shown} ${spec.unit}` : shown };
  }

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

/** Resolve a spec's stored value from a details record (flat or enveloped). */
function readSpecValue(spec: QuickLogDetailFieldSpec, record: Record<string, unknown>): unknown {
  if (spec.envelope) {
    const parent = record[spec.envelope];
    if (!parent || typeof parent !== "object" || Array.isArray(parent)) return undefined;
    return (parent as Record<string, unknown>)[spec.key];
  }
  return record[spec.key];
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
    const line = formatDetailLine(spec, readSpecValue(spec, record));
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Describe stored Quick Log detail WITHOUT knowing the activity id.
 *
 * The event-route diary mirror does not always preserve a specific
 * activity/event_type on the diary row, so plant-scoped read surfaces cannot
 * pick a per-activity spec. This scans a stored details object for any
 * recognized detail-field key — flat or inside a canonical envelope — and
 * returns the same ordered display lines. Unknown keys, blank values, and
 * out-of-set select codes are skipped.
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
      const dedupeKey = spec.envelope ? `${spec.envelope}.${spec.key}` : spec.key;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const line = formatDetailLine(spec, readSpecValue(spec, record));
      if (line) lines.push(line);
    }
  }
  return lines;
}
