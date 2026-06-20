import type { ReflectionConfidence, ReflectionOutput } from "./postGrowReflectionTypes";

export type PostGrowReflectionValidationSeverity = "error" | "warning";

export interface PostGrowReflectionValidationIssue {
  path: string;
  code:
    | "invalid_json"
    | "missing_field"
    | "invalid_type"
    | "invalid_confidence"
    | "empty_text"
    | "unsafe_language"
    | "overconfident_language"
    | "high_confidence_with_thin_data"
    | "missing_evidence";
  message: string;
  severity: PostGrowReflectionValidationSeverity;
}

export interface PostGrowReflectionValidationOptions {
  sensorCoveragePct?: number | null;
  knownGapCount?: number;
  minEvidenceReferences?: number;
}

export type PostGrowReflectionValidationResult =
  | {
      ok: true;
      value: ReflectionOutput;
      issues: PostGrowReflectionValidationIssue[];
    }
  | {
      ok: false;
      value: null;
      issues: PostGrowReflectionValidationIssue[];
    };

const REQUIRED_STRING_FIELDS = ["executive_reflection", "confidence"] as const;

const REQUIRED_ARRAY_FIELDS = [
  "key_wins",
  "repeat_next_run",
  "adjust_or_avoid",
  "post_harvest_specific_insights",
  "pheno_strain_notes",
  "low_risk_experiments",
  "gaps",
] as const;

const ALLOWED_CONFIDENCE: ReflectionConfidence[] = ["Low", "Medium", "High"];

const UNSAFE_LANGUAGE_PATTERNS = [
  /\bautopilot\b/i,
  /\bauto[-\s]?execute\b/i,
  /\bautomatically\s+(?:control|adjust|change|run|execute)\b/i,
  /\bdevice\s+command\b/i,
  /\bcontrol\s+(?:the\s+)?(?:lights?|fans?|irrigation|pump|humidifier|dehumidifier|exhaust)\b/i,
  /\bturn\s+(?:on|off)\s+(?:the\s+)?(?:lights?|fans?|pump|humidifier|dehumidifier|exhaust)\b/i,
  /\bset\s+(?:the\s+)?(?:light|fan|pump|humidifier|dehumidifier|exhaust)\b/i,
  /\brelay\b/i,
  /\bactuator\b/i,
];

const OVERCONFIDENT_LANGUAGE_PATTERNS = [
  /\bguarantee(?:d|s)?\b/i,
  /\bproof\b/i,
  /\bproved\b/i,
  /\bdefinitely\b/i,
  /\bcertainly\b/i,
  /\bwill\s+(?:fix|prevent|ensure|guarantee)\b/i,
  /\bcaused\b/i,
];

const EVIDENCE_MARKER_PATTERN = /\b(?:evt-[a-z0-9-]+|20\d{2}-\d{2}-\d{2}|\d+(?:\.\d+)?\s?(?:%|kPa|RH|g|grams?|days?|readings?|photos?|events?|score)|\d+(?:\.\d+)?)\b/i;

function issue(
  path: string,
  code: PostGrowReflectionValidationIssue["code"],
  message: string,
  severity: PostGrowReflectionValidationSeverity = "error",
): PostGrowReflectionValidationIssue {
  return { path, code, message, severity };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseRawOutput(raw: unknown): { value: unknown; issues: PostGrowReflectionValidationIssue[] } {
  if (typeof raw !== "string") return { value: raw, issues: [] };
  try {
    return { value: JSON.parse(raw), issues: [] };
  } catch {
    return {
      value: null,
      issues: [issue("$", "invalid_json", "Reflection output must be valid JSON.")],
    };
  }
}

function flattenOutputText(output: ReflectionOutput): string[] {
  return [
    output.executive_reflection,
    ...output.key_wins,
    ...output.repeat_next_run,
    ...output.adjust_or_avoid,
    ...output.post_harvest_specific_insights,
    ...output.pheno_strain_notes,
    ...output.low_risk_experiments,
    ...output.gaps,
  ];
}

function countEvidenceReferences(lines: string[]): number {
  return lines.filter((line) => EVIDENCE_MARKER_PATTERN.test(line)).length;
}

function validateTextSafety(output: ReflectionOutput, options: PostGrowReflectionValidationOptions): PostGrowReflectionValidationIssue[] {
  const issues: PostGrowReflectionValidationIssue[] = [];
  const lines = flattenOutputText(output);

  for (const [index, line] of lines.entries()) {
    if (UNSAFE_LANGUAGE_PATTERNS.some((pattern) => pattern.test(line))) {
      issues.push(
        issue(
          `text[${index}]`,
          "unsafe_language",
          "Reflection output must not suggest automation, equipment control, or device execution.",
        ),
      );
    }
    if (OVERCONFIDENT_LANGUAGE_PATTERNS.some((pattern) => pattern.test(line))) {
      issues.push(
        issue(
          `text[${index}]`,
          "overconfident_language",
          "Reflection output must avoid causation, proof, guarantee, or certainty language.",
        ),
      );
    }
  }

  const minEvidenceReferences = options.minEvidenceReferences ?? 2;
  const evidenceReferences = countEvidenceReferences(lines);
  if (evidenceReferences < minEvidenceReferences) {
    issues.push(
      issue(
        "$",
        "missing_evidence",
        `Reflection output needs at least ${minEvidenceReferences} explicit evidence references; found ${evidenceReferences}.`,
      ),
    );
  }

  const sensorCoveragePct = options.sensorCoveragePct ?? null;
  const knownGapCount = options.knownGapCount ?? 0;
  if (output.confidence === "High" && ((sensorCoveragePct !== null && sensorCoveragePct < 70) || knownGapCount > 0)) {
    issues.push(
      issue(
        "confidence",
        "high_confidence_with_thin_data",
        "High confidence is not allowed when supplied context is thin or has known gaps.",
      ),
    );
  }

  return issues;
}

export function validatePostGrowReflectionOutput(
  raw: unknown,
  options: PostGrowReflectionValidationOptions = {},
): PostGrowReflectionValidationResult {
  const parsed = parseRawOutput(raw);
  const issues: PostGrowReflectionValidationIssue[] = [...parsed.issues];
  if (issues.some((item) => item.severity === "error")) return { ok: false, value: null, issues };

  if (!isRecord(parsed.value)) {
    return {
      ok: false,
      value: null,
      issues: [issue("$", "invalid_type", "Reflection output must be a JSON object.")],
    };
  }

  const record = parsed.value;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!(field in record)) {
      issues.push(issue(field, "missing_field", `Missing required field: ${field}.`));
    } else if (typeof record[field] !== "string") {
      issues.push(issue(field, "invalid_type", `${field} must be a string.`));
    } else if ((record[field] as string).trim().length === 0) {
      issues.push(issue(field, "empty_text", `${field} must not be empty.`));
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!(field in record)) {
      issues.push(issue(field, "missing_field", `Missing required field: ${field}.`));
      continue;
    }
    if (!Array.isArray(record[field])) {
      issues.push(issue(field, "invalid_type", `${field} must be an array of strings.`));
      continue;
    }
    for (const [index, value] of (record[field] as unknown[]).entries()) {
      if (typeof value !== "string") {
        issues.push(issue(`${field}[${index}]`, "invalid_type", `${field}[${index}] must be a string.`));
      } else if (value.trim().length === 0) {
        issues.push(issue(`${field}[${index}]`, "empty_text", `${field}[${index}] must not be empty.`));
      }
    }
  }

  if (typeof record.confidence === "string" && !ALLOWED_CONFIDENCE.includes(record.confidence as ReflectionConfidence)) {
    issues.push(issue("confidence", "invalid_confidence", "confidence must be Low, Medium, or High."));
  }

  if (issues.some((item) => item.severity === "error")) return { ok: false, value: null, issues };

  const output = record as unknown as ReflectionOutput;
  issues.push(...validateTextSafety(output, options));

  if (issues.some((item) => item.severity === "error")) return { ok: false, value: null, issues };
  return { ok: true, value: output, issues };
}
