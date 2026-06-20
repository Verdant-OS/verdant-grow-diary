import { createRichPhotoperiodReflectionContext } from "./postGrowReflectionFixtures";
import {
  adaptPostGrowReflectionCandidate,
  type PostGrowReflectionAdapterCandidate,
  type PostGrowReflectionAdapterResult,
} from "./postGrowReflectionAdapter";
import {
  normalizePostGrowReflectionProviderCandidateEnvelope,
  type PostGrowReflectionProviderCandidateEnvelopeMetadata,
} from "./postGrowReflectionProviderCandidateEnvelope";
import type { PostGrowReflectionPreviewSectionRow } from "./postGrowReflectionPreviewViewModel";
import type {
  GrowContext,
  ReflectionConfidence,
  ReflectionOutput,
} from "./postGrowReflectionTypes";

export const POST_GROW_REFLECTION_CANDIDATE_PASTE_VALIDATOR_VERSION =
  "post-grow-reflection-candidate-paste-validator-v2";

export const POST_GROW_REFLECTION_CANDIDATE_PASTE_LABELS = {
  operatorCandidate: "Operator candidate",
  manualPaste: "Manual paste",
  envelopePaste: "Envelope paste",
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

export interface PostGrowReflectionCandidatePasteEnvelopeMetadataView {
  sourceLabel: string;
  requestLabel: string;
  createdAt: string;
  candidateFormat: "object" | "json_string";
  label: string;
}

interface BaseCandidatePasteResult {
  validatorVersion: typeof POST_GROW_REFLECTION_CANDIDATE_PASTE_VALIDATOR_VERSION;
  title: string;
  subtitle: string;
  labels: PostGrowReflectionCandidatePasteLabel[];
  inputKind: "raw_candidate" | "envelope" | null;
}

export interface PostGrowReflectionCandidatePasteIdleResult extends BaseCandidatePasteResult {
  status: "idle";
  message: string;
  inputKind: null;
}

export interface PostGrowReflectionCandidatePasteEmptyResult extends BaseCandidatePasteResult {
  status: "empty";
  message: string;
  inputKind: null;
}

export interface PostGrowReflectionCandidatePasteInvalidJsonResult extends BaseCandidatePasteResult {
  status: "invalid_json";
  message: string;
  parseError: string;
  inputKind: null;
}

export interface PostGrowReflectionCandidatePasteEnvelopeRejectedResult extends BaseCandidatePasteResult {
  status: "envelope_rejected";
  message: string;
  inputKind: "envelope";
  issueCodes: string[];
  failureReason: string;
}

export interface PostGrowReflectionCandidatePasteValidationFailedResult extends BaseCandidatePasteResult {
  status: "validation_failed";
  message: string;
  inputKind: "raw_candidate" | "envelope";
  issueCodes: string[];
  failureReason: string;
  validationOptions: PostGrowReflectionCandidatePasteValidationOptions;
  envelopeMetadata: PostGrowReflectionCandidatePasteEnvelopeMetadataView | null;
}

export interface PostGrowReflectionCandidatePasteValidatedResult extends BaseCandidatePasteResult {
  status: "validated";
  message: string;
  inputKind: "raw_candidate" | "envelope";
  confidence: ReflectionConfidence;
  confidenceLabel: string;
  sections: PostGrowReflectionPreviewSectionRow[];
  validationOptions: PostGrowReflectionCandidatePasteValidationOptions;
  envelopeMetadata: PostGrowReflectionCandidatePasteEnvelopeMetadataView | null;
}

export type PostGrowReflectionCandidatePasteResult =
  | PostGrowReflectionCandidatePasteIdleResult
  | PostGrowReflectionCandidatePasteEmptyResult
  | PostGrowReflectionCandidatePasteInvalidJsonResult
  | PostGrowReflectionCandidatePasteEnvelopeRejectedResult
  | PostGrowReflectionCandidatePasteValidationFailedResult
  | PostGrowReflectionCandidatePasteValidatedResult;

export interface ValidatePostGrowReflectionCandidatePasteOptions {
  context?: GrowContext;
}

const BASE_TITLE = "Candidate Paste Validator";
const BASE_SUBTITLE =
  "Manual operator check for pasted ReflectionOutput JSON or candidate envelope. Local validation only, not saved, and no live AI call.";

type CandidatePasteInputKind = "raw_candidate" | "envelope" | null;

function labels(
  inputKind: CandidatePasteInputKind,
  includeRejected: boolean,
): PostGrowReflectionCandidatePasteLabel[] {
  const keys: PostGrowReflectionCandidatePasteLabelKey[] = ["operatorCandidate", "manualPaste"];
  if (inputKind === "envelope") keys.push("envelopePaste");
  keys.push(includeRejected ? "rejectedCandidate" : "validatedOutput", "notSaved", "noLiveAiCall");
  return keys.map((key) => ({ key, text: POST_GROW_REFLECTION_CANDIDATE_PASTE_LABELS[key] }));
}

function base<K extends CandidatePasteInputKind>(
  inputKind: K,
  includeRejected = false,
): BaseCandidatePasteResult & { inputKind: K } {
  return {
    validatorVersion: POST_GROW_REFLECTION_CANDIDATE_PASTE_VALIDATOR_VERSION,
    title: BASE_TITLE,
    subtitle: BASE_SUBTITLE,
    labels: labels(inputKind, includeRejected),
    inputKind,
  };
}

function issueCodes(result: PostGrowReflectionAdapterResult): string[] {
  return Array.from(new Set(result.issues.map((issue) => issue.code))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function validationOptions(
  result: PostGrowReflectionAdapterResult,
): PostGrowReflectionCandidatePasteValidationOptions {
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
    {
      key: "repeat_next_run",
      label: "Repeat next run",
      kind: "list",
      items: [...output.repeat_next_run],
    },
    {
      key: "adjust_or_avoid",
      label: "Adjust or avoid",
      kind: "list",
      items: [...output.adjust_or_avoid],
    },
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

function parseCandidate(
  rawText: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(rawText) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to parse pasted JSON.",
    };
  }
}

function isEnvelopeLike(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value;
}

function envelopeMetadataView(
  metadata: PostGrowReflectionProviderCandidateEnvelopeMetadata,
): PostGrowReflectionCandidatePasteEnvelopeMetadataView {
  return {
    sourceLabel: metadata.sourceLabel,
    requestLabel: metadata.requestLabel ?? "—",
    createdAt: metadata.createdAt ?? "—",
    candidateFormat: metadata.candidateFormat,
    label: `sourceLabel=${metadata.sourceLabel}; requestLabel=${metadata.requestLabel ?? "—"}; createdAt=${metadata.createdAt ?? "—"}; candidateFormat=${metadata.candidateFormat}`,
  };
}

function candidateFromParsed(value: unknown):
  | {
      ok: true;
      inputKind: "raw_candidate" | "envelope";
      candidate: PostGrowReflectionAdapterCandidate;
      envelopeMetadata: PostGrowReflectionCandidatePasteEnvelopeMetadataView | null;
    }
  | { ok: false; issueCodes: string[]; failureReason: string } {
  if (!isEnvelopeLike(value)) {
    return {
      ok: true,
      inputKind: "raw_candidate",
      candidate: { source: "external_candidate", rawOutput: value },
      envelopeMetadata: null,
    };
  }

  const envelope = normalizePostGrowReflectionProviderCandidateEnvelope(value);
  if (!envelope.ok) {
    const e = envelope as { issueCodes: string[]; failureReason: string };
    return { ok: false, issueCodes: e.issueCodes, failureReason: e.failureReason };
  }

  return {
    ok: true,
    inputKind: "envelope",
    candidate: envelope.candidate,
    envelopeMetadata: envelopeMetadataView(envelope.metadata),
  };
}

export function validatePostGrowReflectionCandidatePaste(
  rawText?: string,
  options: ValidatePostGrowReflectionCandidatePasteOptions = {},
): PostGrowReflectionCandidatePasteResult {
  if (rawText === undefined) {
    return {
      ...base(null),
      status: "idle",
      message:
        "Paste a candidate ReflectionOutput JSON or candidate envelope and validate it locally.",
    };
  }

  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return {
      ...base(null, true),
      status: "empty",
      message: "Paste a candidate before validating.",
    };
  }

  const parsed = parseCandidate(trimmed);
  if (!parsed.ok) {
    const { error } = parsed as { error: string };
    return {
      ...base(null, true),
      status: "invalid_json",
      message: "Pasted candidate is not valid JSON.",
      parseError: error,
    };
  }

  const candidate = candidateFromParsed(parsed.value);
  if (!candidate.ok) {
    const c = candidate as { issueCodes: string[]; failureReason: string };
    return {
      ...base("envelope", true),
      status: "envelope_rejected",
      message: "Pasted candidate envelope was rejected before reflection validation.",
      issueCodes: c.issueCodes,
      failureReason: c.failureReason,
    };
  }

  const adapterResult = adaptPostGrowReflectionCandidate({
    context: options.context ?? createRichPhotoperiodReflectionContext(),
    candidate: candidate.candidate,
  });

  if (adapterResult.status === "validation_failed") {
    return {
      ...base(candidate.inputKind, true),
      status: "validation_failed",
      message: "Pasted candidate was rejected by the reflection validator.",
      issueCodes: issueCodes(adapterResult),
      failureReason: adapterResult.failureReason,
      validationOptions: validationOptions(adapterResult),
      envelopeMetadata: candidate.envelopeMetadata,
    };
  }

  return {
    ...base(candidate.inputKind),
    status: "validated",
    message: "Pasted candidate passed local validation.",
    confidence: adapterResult.output.confidence,
    confidenceLabel: `Confidence: ${adapterResult.output.confidence}`,
    sections: sections(adapterResult.output),
    validationOptions: validationOptions(adapterResult),
    envelopeMetadata: candidate.envelopeMetadata,
  };
}
