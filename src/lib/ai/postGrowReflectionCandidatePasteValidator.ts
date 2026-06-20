import { createRichPhotoperiodReflectionContext } from "./postGrowReflectionFixtures";
import {
  adaptPostGrowReflectionCandidate,
  type PostGrowReflectionAdapterResult,
} from "./postGrowReflectionAdapter";
import type { PostGrowReflectionPreviewSectionRow } from "./postGrowReflectionPreviewViewModel";
import type { GrowContext, ReflectionConfidence, ReflectionOutput } from "./postGrowReflectionTypes";

export const POST_GROW_REFLECTION_CANDIDATE_PASTE_VALIDATOR_VERSION =
  "post-grow-reflection-candidate-paste-validator-v1";

export const POST_GROW_REFLECTION_CANDIDATE_PASTE_LABELS = {
  operatorCandidate: "Operator candidate",
  manualPaste: "Manual paste",
  validatedOutput: "Validated output",
  rejectedCandidate: "Rejected candidate",
  notSaved: "Not saved",
  noLiveAiCall: "No live AI call",
} as const;

export type PostGrowReflectionCandidatePasteLabelKey =
  keyof typeof POST_GROW_REFLECTION_CANDIDATE_PASTE_LABELS;

export interface PostGrowReflectionCandidatePasteLabel {
  key: PostGrowReflectionCandidatePasteLabelKey;
  text: string;
}

export interface PostGrowReflectionCandidatePasteValidationOptions {
  sensorCoveragePct: number;
  knownGapCount: number;
  minEvidenceReferences: number;
  label: string;
}

interface BaseCandidatePasteResult {
  validatorVersion: typeof POST_GROW_REFLECTION_CANDIDATE_PASTE_VALIDATOR_VERSION;
  title: string;
  subtitle: string;
  labels: PostGrowReflectionCandidatePasteLabel[];
}

export interface PostGrowReflectionCandidatePasteIdleResult extends BaseCandidatePasteResult {
  status: "idle";
  message: string;
}

export interface PostGrowReflectionCandidatePasteEmptyResult extends BaseCandidatePasteResult {
  status: "empty";
  message: string;
}

export interface PostGrowReflectionCandidatePasteInvalidJsonResult extends BaseCandidatePasteResult {
  status: "invalid_json";
  message: string;
  parseError: string;
}

export interface PostGrowReflectionCandidatePasteValidationFailedResult extends BaseCandidatePasteResult {
  status: "validation_failed";
  message: string;
  issueCodes: string[];
  failureReason: string;
  validationOptions: PostGrowReflectionCandidatePasteValidationOptions;
}

export interface PostGrowReflectionCandidatePasteValidatedResult extends BaseCandidatePasteResult {
  status: "validated";
  message: string;
  confidence: ReflectionConfidence;
  confidenceLabel: string;
  sections: PostGrowReflectionPreviewSectionRow[];
  validationOptions: PostGrowReflectionCandidatePasteValidationOptions;
}

export type PostGrowReflectionCandidatePasteResult =
  | PostGrowReflectionCandidatePasteIdleResult
  | PostGrowReflectionCandidatePasteEmptyResult
  | PostGrowReflectionCandidatePasteInvalidJsonResult
  | PostGrowReflectionCandidatePasteValidationFailedResult
  | PostGrowReflectionCandidatePasteValidatedResult;

export interface ValidatePostGrowReflectionCandidatePasteOptions {
  context?: GrowContext;
}

const BASE_TITLE = "Candidate Paste Validator";
const BASE_SUBTITLE =
  "Manual operator check for pasted ReflectionOutput JSON. Local validation only, not saved, and no live AI call.";

function labels(includeRejected: boolean): PostGrowReflectionCandidatePasteLabel[] {
  const keys: PostGrowReflectionCandidatePasteLabelKey[] = includeRejected
    ? ["operatorCandidate", "manualPaste", "rejectedCandidate", "notSaved", "noLiveAiCall"]
    : ["operatorCandidate", "manualPaste", "validatedOutput", "notSaved", "noLiveAiCall"];
  return keys.map((key) => ({ key, text: POST_GROW_REFLECTION_CANDIDATE_PASTE_LABELS[key] }));
}

function base(includeRejected = false): BaseCandidatePasteResult {
  return {
    validatorVersion: POST_GROW_REFLECTION_CANDIDATE_PASTE_VALIDATOR_VERSION,
    title: BASE_TITLE,
    subtitle: BASE_SUBTITLE,
    labels: labels(includeRejected),
  };
}

function issueCodes(result: PostGrowReflectionAdapterResult): string[] {
  return Array.from(new Set(result.issues.map((issue) => issue.code))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function validationOptions(result: PostGrowReflectionAdapterResult): PostGrowReflectionCandidatePasteValidationOptions {
  const opts = result.request.validationOptions;
  return {
    sensorCoveragePct: opts.sensorCoveragePct,
    knownGapCount: opts.knownGapCount,
    minEvidenceReferences: opts.minEvidenceReferences,
    label: `sensorCoveragePct=${opts.sensorCoveragePct}; knownGapCount=${opts.knownGapCount}; minEvidenceReferences=${opts.minEvidenceReferences}`,
  };
}

function sections(output: ReflectionOutput): PostGrowReflectionPreviewSectionRow[] {
  return [
    {
      key: "executive_reflection",
      label: "Executive reflection",
      kind: "paragraph",
      paragraph: output.executive_reflection,
    },
    { key: "key_wins", label: "Key wins", kind: "list", items: [...output.key_wins] },
    { key: "repeat_next_run", label: "Repeat next run", kind: "list", items: [...output.repeat_next_run] },
    { key: "adjust_or_avoid", label: "Adjust or avoid", kind: "list", items: [...output.adjust_or_avoid] },
    {
      key: "post_harvest_specific_insights",
      label: "Post-harvest specific insights",
      kind: "list",
      items: [...output.post_harvest_specific_insights],
    },
    {
      key: "pheno_strain_notes",
      label: "Pheno / strain notes",
      kind: "list",
      items: [...output.pheno_strain_notes],
    },
    {
      key: "low_risk_experiments",
      label: "Low-risk experiments",
      kind: "list",
      items: [...output.low_risk_experiments],
    },
    { key: "gaps", label: "Gaps", kind: "list", items: [...output.gaps] },
  ];
}

function parseCandidate(rawText: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(rawText) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to parse pasted JSON.",
    };
  }
}

export function validatePostGrowReflectionCandidatePaste(
  rawText?: string,
  options: ValidatePostGrowReflectionCandidatePasteOptions = {},
): PostGrowReflectionCandidatePasteResult {
  if (rawText === undefined) {
    return {
      ...base(),
      status: "idle",
      message: "Paste a candidate ReflectionOutput JSON and validate it locally.",
    };
  }

  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return {
      ...base(true),
      status: "empty",
      message: "Paste a candidate before validating.",
    };
  }

  const parsed = parseCandidate(trimmed);
  if (!parsed.ok) {
    return {
      ...base(true),
      status: "invalid_json",
      message: "Pasted candidate is not valid JSON.",
      parseError: parsed.error,
    };
  }

  const adapterResult = adaptPostGrowReflectionCandidate({
    context: options.context ?? createRichPhotoperiodReflectionContext(),
    candidate: {
      source: "external_candidate",
      rawOutput: parsed.value,
    },
  });

  if (adapterResult.status === "validation_failed") {
    return {
      ...base(true),
      status: "validation_failed",
      message: "Pasted candidate was rejected by the reflection validator.",
      issueCodes: issueCodes(adapterResult),
      failureReason: adapterResult.failureReason,
      validationOptions: validationOptions(adapterResult),
    };
  }

  return {
    ...base(),
    status: "validated",
    message: "Pasted candidate passed local validation.",
    confidence: adapterResult.output.confidence,
    confidenceLabel: `Confidence: ${adapterResult.output.confidence}`,
    sections: sections(adapterResult.output),
    validationOptions: validationOptions(adapterResult),
  };
}
