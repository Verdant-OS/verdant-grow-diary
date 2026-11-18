/**
 * phenoScoringTemplateRules
 *
 * Pure engine for versioned pheno scoring templates: the template shape, a
 * configurable scale, template validation, per-field value validation, and a
 * per-field evaluation of one saved response.
 *
 * Design rules:
 *  - The scale is a template parameter (min, max, step), and a field may carry
 *    its own scale. Nothing here assumes 0–10 or 1–5.
 *  - A missing value is "not scored", never 0. A zero is a real value only when
 *    the scale includes it.
 *  - Values are never rounded, clamped or coerced. An off-step, out-of-range or
 *    wrong-type value is reported as invalid, with the reason.
 *  - A response is read only against the exact template id and version it was
 *    saved with. A mismatch is reported, never re-mapped.
 *  - This module never ranks plants. It produces no total, average, composite
 *    or position, and it never names a keeper. The grower decides.
 *
 * No I/O. No fetch. No Supabase. No AI. No clock. Deterministic, null-safe.
 */

export type PhenoScoringTemplateStatus = "draft" | "published";
export type PhenoScoringTemplateVisibility = "internal" | "public";

export interface PhenoScoringScale {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly minLabel?: string;
  readonly maxLabel?: string;
}

export interface PhenoScoringOption {
  readonly id: string;
  readonly label: string;
}

interface PhenoScoringFieldBase {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly help?: string;
}

export interface PhenoScoringScaleField extends PhenoScoringFieldBase {
  readonly kind: "scale";
  /** Overrides the template scale for this field only. */
  readonly scale?: PhenoScoringScale;
}

export interface PhenoScoringSingleChoiceField extends PhenoScoringFieldBase {
  readonly kind: "single";
  readonly options: readonly PhenoScoringOption[];
}

export interface PhenoScoringMultiChoiceField extends PhenoScoringFieldBase {
  readonly kind: "multi";
  readonly options: readonly PhenoScoringOption[];
  readonly maxSelections?: number;
}

export interface PhenoScoringMeasureField extends PhenoScoringFieldBase {
  readonly kind: "measure";
  readonly unit: string;
  readonly min?: number;
  readonly max?: number;
}

export interface PhenoScoringNoteField extends PhenoScoringFieldBase {
  readonly kind: "note";
  readonly maxLength?: number;
}

export type PhenoScoringField =
  | PhenoScoringScaleField
  | PhenoScoringSingleChoiceField
  | PhenoScoringMultiChoiceField
  | PhenoScoringMeasureField
  | PhenoScoringNoteField;

export interface PhenoScoringSection {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly PhenoScoringField[];
}

export interface PhenoScoringTemplate {
  readonly id: string;
  /** Positive integer. A saved response is bound to one version. */
  readonly version: number;
  readonly title: string;
  readonly status: PhenoScoringTemplateStatus;
  readonly visibility: PhenoScoringTemplateVisibility;
  readonly scale: PhenoScoringScale;
  readonly sections: readonly PhenoScoringSection[];
}

// ---------------------------------------------------------------------------
// Template validation
// ---------------------------------------------------------------------------

export type PhenoScoringTemplateIssueCode =
  | "template_not_object"
  | "template_id_missing"
  | "template_version_invalid"
  | "sections_missing"
  | "scale_range_invalid"
  | "scale_step_invalid"
  | "field_id_missing"
  | "field_id_duplicate"
  | "field_kind_unknown"
  | "options_missing"
  | "option_id_duplicate"
  | "max_selections_invalid"
  | "measure_range_invalid"
  | "max_length_invalid";

export interface PhenoScoringTemplateIssue {
  readonly code: PhenoScoringTemplateIssueCode;
  /** Field or section the issue belongs to, when it belongs to one. */
  readonly path?: string;
}

export interface PhenoScoringTemplateValidation {
  readonly ok: boolean;
  readonly issues: readonly PhenoScoringTemplateIssue[];
}

/** Tolerance for comparing decimal steps such as 0.5 or 0.1. */
const STEP_EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True when `value` lands on a step counted from `min`, within tolerance. */
function isOnStep(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) <= STEP_EPSILON * Math.max(1, Math.abs(steps));
}

function scaleIssues(scale: unknown, path?: string): PhenoScoringTemplateIssue[] {
  const at = path ? { path } : {};
  if (!isRecord(scale)) return [{ code: "scale_range_invalid", ...at }];
  const { min, max, step } = scale;
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || min >= max) {
    return [{ code: "scale_range_invalid", ...at }];
  }
  if (!isFiniteNumber(step) || step <= 0 || !isOnStep(max, min, step)) {
    return [{ code: "scale_step_invalid", ...at }];
  }
  return [];
}

function optionIssues(options: unknown, path: string): PhenoScoringTemplateIssue[] {
  if (!Array.isArray(options) || options.length === 0) {
    return [{ code: "options_missing", path }];
  }
  const seen = new Set<string>();
  const issues: PhenoScoringTemplateIssue[] = [];
  for (const option of options) {
    const id = isRecord(option) && isNonBlankString(option.id) ? option.id : null;
    if (id === null) {
      issues.push({ code: "options_missing", path });
      continue;
    }
    if (seen.has(id)) issues.push({ code: "option_id_duplicate", path: `${path}.${id}` });
    seen.add(id);
  }
  return issues;
}

function fieldIssues(field: Record<string, unknown>, path: string): PhenoScoringTemplateIssue[] {
  switch (field.kind) {
    case "scale":
      return field.scale === undefined ? [] : scaleIssues(field.scale, path);
    case "single":
      return optionIssues(field.options, path);
    case "multi": {
      const issues = optionIssues(field.options, path);
      const cap = field.maxSelections;
      if (cap !== undefined && (!Number.isInteger(cap) || (cap as number) < 1)) {
        issues.push({ code: "max_selections_invalid", path });
      }
      return issues;
    }
    case "measure": {
      const { min, max } = field;
      if (min !== undefined && !isFiniteNumber(min)) {
        return [{ code: "measure_range_invalid", path }];
      }
      if (max !== undefined && !isFiniteNumber(max)) {
        return [{ code: "measure_range_invalid", path }];
      }
      if (isFiniteNumber(min) && isFiniteNumber(max) && min > max) {
        return [{ code: "measure_range_invalid", path }];
      }
      return [];
    }
    case "note": {
      const cap = field.maxLength;
      if (cap !== undefined && (!Number.isInteger(cap) || (cap as number) < 1)) {
        return [{ code: "max_length_invalid", path }];
      }
      return [];
    }
    default:
      return [{ code: "field_kind_unknown", path }];
  }
}

/**
 * Validate an untrusted template. Returns every issue found, in template
 * order, so an author can fix them in one pass. Never throws.
 */
export function validatePhenoScoringTemplate(template: unknown): PhenoScoringTemplateValidation {
  if (!isRecord(template)) {
    return { ok: false, issues: [{ code: "template_not_object" }] };
  }

  const issues: PhenoScoringTemplateIssue[] = [];
  if (!isNonBlankString(template.id)) issues.push({ code: "template_id_missing" });
  if (!Number.isInteger(template.version) || (template.version as number) < 1) {
    issues.push({ code: "template_version_invalid" });
  }
  issues.push(...scaleIssues(template.scale));

  if (!Array.isArray(template.sections) || template.sections.length === 0) {
    issues.push({ code: "sections_missing" });
    return { ok: false, issues };
  }

  const seenFieldIds = new Set<string>();
  for (const section of template.sections) {
    const sectionId = isRecord(section) && isNonBlankString(section.id) ? section.id : "?";
    const fields = isRecord(section) && Array.isArray(section.fields) ? section.fields : [];
    for (const field of fields) {
      if (!isRecord(field) || !isNonBlankString(field.id)) {
        issues.push({ code: "field_id_missing", path: sectionId });
        continue;
      }
      if (seenFieldIds.has(field.id)) {
        issues.push({ code: "field_id_duplicate", path: field.id });
      }
      seenFieldIds.add(field.id);
      issues.push(...fieldIssues(field, field.id));
    }
  }

  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Field values
// ---------------------------------------------------------------------------

/** The scale a scale field is scored on: its own, or the template's. */
export function resolveFieldScale(
  template: PhenoScoringTemplate,
  field: PhenoScoringScaleField | PhenoScoringField,
): PhenoScoringScale {
  if (field.kind === "scale" && field.scale) return field.scale;
  return template.scale;
}

export type PhenoScoringValueInvalidReason =
  | "wrong_type"
  | "out_of_range"
  | "off_step"
  | "unknown_option"
  | "duplicate_option"
  | "too_many_selections"
  | "too_long";

export type PhenoScoringFieldValueResult =
  | { readonly status: "not_scored" }
  | { readonly status: "valid"; readonly value: number | string | readonly string[] }
  | { readonly status: "invalid"; readonly reason: PhenoScoringValueInvalidReason };

const NOT_SCORED: PhenoScoringFieldValueResult = { status: "not_scored" };

function invalid(reason: PhenoScoringValueInvalidReason): PhenoScoringFieldValueResult {
  return { status: "invalid", reason };
}

function optionIds(options: readonly PhenoScoringOption[]): ReadonlySet<string> {
  return new Set(options.map((o) => o.id));
}

/**
 * Validate one value against one field. `null` and `undefined` are "not
 * scored". Values are reported as they are: nothing is rounded or coerced.
 */
export function validateFieldValue(
  template: PhenoScoringTemplate,
  field: PhenoScoringField,
  value: unknown,
): PhenoScoringFieldValueResult {
  if (value === null || value === undefined) return NOT_SCORED;

  switch (field.kind) {
    case "scale": {
      if (!isFiniteNumber(value)) return invalid("wrong_type");
      const scale = resolveFieldScale(template, field);
      if (value < scale.min || value > scale.max) return invalid("out_of_range");
      if (!isOnStep(value, scale.min, scale.step)) return invalid("off_step");
      return { status: "valid", value };
    }
    case "measure": {
      if (!isFiniteNumber(value)) return invalid("wrong_type");
      if (field.min !== undefined && value < field.min) return invalid("out_of_range");
      if (field.max !== undefined && value > field.max) return invalid("out_of_range");
      return { status: "valid", value };
    }
    case "single": {
      if (typeof value !== "string") return invalid("wrong_type");
      if (!optionIds(field.options).has(value)) return invalid("unknown_option");
      return { status: "valid", value };
    }
    case "multi": {
      if (!Array.isArray(value)) return invalid("wrong_type");
      if (value.length === 0) return NOT_SCORED;
      if (!value.every((v): v is string => typeof v === "string")) return invalid("wrong_type");
      const known = optionIds(field.options);
      if (!value.every((v) => known.has(v))) return invalid("unknown_option");
      if (new Set(value).size !== value.length) return invalid("duplicate_option");
      if (field.maxSelections !== undefined && value.length > field.maxSelections) {
        return invalid("too_many_selections");
      }
      return { status: "valid", value: [...value] };
    }
    case "note": {
      if (typeof value !== "string") return invalid("wrong_type");
      if (value.trim().length === 0) return NOT_SCORED;
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        return invalid("too_long");
      }
      return { status: "valid", value };
    }
    default:
      return invalid("wrong_type");
  }
}

// ---------------------------------------------------------------------------
// Response evaluation
// ---------------------------------------------------------------------------

export interface PhenoScoringResponse {
  readonly templateId: string;
  readonly templateVersion: number;
  readonly values: Readonly<Record<string, unknown>>;
}

export type PhenoScoringFieldEvaluation = PhenoScoringFieldValueResult & {
  readonly fieldId: string;
};

export type PhenoScoringResponseEvaluation =
  | { readonly status: "template_mismatch" }
  | {
      readonly status: "evaluated";
      /** One entry per template field, in template order. */
      readonly fields: readonly PhenoScoringFieldEvaluation[];
      readonly fieldCount: number;
      readonly scoredCount: number;
      readonly invalidCount: number;
      readonly notScoredCount: number;
      /** Required fields with no value, in template order. */
      readonly requiredMissing: readonly string[];
      /** Value keys the template does not define, sorted. Reported, never dropped silently. */
      readonly unknownFieldIds: readonly string[];
      /** Every field scored and none invalid. */
      readonly complete: boolean;
    };

const TEMPLATE_MISMATCH: PhenoScoringResponseEvaluation = { status: "template_mismatch" };

/**
 * Evaluate one saved response field by field. Counts are honest tallies of
 * field states; there is deliberately no total, average or ranking.
 */
export function evaluatePhenoScoringResponse(
  template: PhenoScoringTemplate,
  response: PhenoScoringResponse | null | undefined,
): PhenoScoringResponseEvaluation {
  if (
    !response ||
    response.templateId !== template.id ||
    response.templateVersion !== template.version
  ) {
    return TEMPLATE_MISMATCH;
  }

  const values = isRecord(response.values) ? response.values : {};
  const definedIds = new Set<string>();
  const fields: PhenoScoringFieldEvaluation[] = [];
  const requiredMissing: string[] = [];
  let scoredCount = 0;
  let invalidCount = 0;
  let notScoredCount = 0;

  for (const section of template.sections) {
    for (const field of section.fields) {
      definedIds.add(field.id);
      const raw = Object.prototype.hasOwnProperty.call(values, field.id)
        ? values[field.id]
        : undefined;
      const result = validateFieldValue(template, field, raw);
      fields.push({ ...result, fieldId: field.id });
      if (result.status === "valid") scoredCount += 1;
      else if (result.status === "invalid") invalidCount += 1;
      else {
        notScoredCount += 1;
        if (field.required) requiredMissing.push(field.id);
      }
    }
  }

  const unknownFieldIds = Object.keys(values)
    .filter((key) => !definedIds.has(key))
    .sort();

  return {
    status: "evaluated",
    fields,
    fieldCount: fields.length,
    scoredCount,
    invalidCount,
    notScoredCount,
    requiredMissing,
    unknownFieldIds,
    complete: fields.length > 0 && scoredCount === fields.length,
  };
}
