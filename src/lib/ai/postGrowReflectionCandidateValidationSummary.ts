import type { PostGrowReflectionCandidatePasteResult } from "./postGrowReflectionCandidatePasteValidator";

export const POST_GROW_REFLECTION_CANDIDATE_VALIDATION_SUMMARY_VERSION =
  "post-grow-reflection-candidate-validation-summary-v1";

export interface PostGrowReflectionCandidateValidationSummaryRow {
  label: string;
  value: string;
}

export interface PostGrowReflectionCandidateValidationSummary {
  version: typeof POST_GROW_REFLECTION_CANDIDATE_VALIDATION_SUMMARY_VERSION;
  title: string;
  status: PostGrowReflectionCandidatePasteResult["status"];
  outcomeLabel: string;
  inputKindLabel: string;
  safeToPersist: false;
  rows: PostGrowReflectionCandidateValidationSummaryRow[];
  note: string;
}

function inputKindLabel(result: PostGrowReflectionCandidatePasteResult): string {
  if (result.inputKind === "envelope") return "Envelope";
  if (result.inputKind === "raw_candidate") return "Raw candidate";
  return "No candidate";
}

function issueCodes(result: PostGrowReflectionCandidatePasteResult): string {
  if (result.status === "validation_failed" || result.status === "envelope_rejected") {
    return result.issueCodes.length > 0 ? result.issueCodes.join(", ") : "none";
  }
  return "none";
}

function failureReason(result: PostGrowReflectionCandidatePasteResult): string {
  if (result.status === "validation_failed" || result.status === "envelope_rejected") {
    return result.failureReason;
  }
  if (result.status === "invalid_json") return result.parseError;
  return "none";
}

function validationOptions(result: PostGrowReflectionCandidatePasteResult): string {
  if (result.status === "validated" || result.status === "validation_failed") {
    return result.validationOptions.label;
  }
  return "not available";
}

function confidence(result: PostGrowReflectionCandidatePasteResult): string {
  return result.status === "validated" ? result.confidence : "not validated";
}

function envelopeSource(result: PostGrowReflectionCandidatePasteResult): string {
  if ((result.status === "validated" || result.status === "validation_failed") && result.envelopeMetadata) {
    return result.envelopeMetadata.sourceLabel;
  }
  return "not available";
}

function envelopeFormat(result: PostGrowReflectionCandidatePasteResult): string {
  if ((result.status === "validated" || result.status === "validation_failed") && result.envelopeMetadata) {
    return result.envelopeMetadata.candidateFormat;
  }
  return "not available";
}

function outcomeLabel(result: PostGrowReflectionCandidatePasteResult): string {
  switch (result.status) {
    case "validated":
      return "Validated locally";
    case "validation_failed":
      return "Rejected by reflection validator";
    case "envelope_rejected":
      return "Rejected by envelope contract";
    case "invalid_json":
      return "Invalid JSON";
    case "empty":
      return "Empty paste";
    case "idle":
      return "Not validated";
  }
}

export function buildPostGrowReflectionCandidateValidationSummary(
  result: PostGrowReflectionCandidatePasteResult,
): PostGrowReflectionCandidateValidationSummary {
  return {
    version: POST_GROW_REFLECTION_CANDIDATE_VALIDATION_SUMMARY_VERSION,
    title: "Sanitized validation summary",
    status: result.status,
    outcomeLabel: outcomeLabel(result),
    inputKindLabel: inputKindLabel(result),
    safeToPersist: false,
    rows: [
      { label: "Outcome", value: outcomeLabel(result) },
      { label: "Input kind", value: inputKindLabel(result) },
      { label: "Confidence", value: confidence(result) },
      { label: "Issue codes", value: issueCodes(result) },
      { label: "Failure reason", value: failureReason(result) },
      { label: "Validation options", value: validationOptions(result) },
      { label: "Envelope source", value: envelopeSource(result) },
      { label: "Envelope format", value: envelopeFormat(result) },
      { label: "Persistence", value: "Not saved" },
    ],
    note:
      "Summary excludes raw pasted JSON, candidate body text, credentials, private metadata, and device/action targets.",
  };
}
