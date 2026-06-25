import type { PostGrowReflectionCandidatePasteResult } from "./postGrowReflectionCandidatePasteValidator";

export const POST_GROW_REFLECTION_REVIEW_PACKET_VERSION = "post-grow-reflection-review-packet-v1";

export const POST_GROW_REFLECTION_REVIEW_PACKET_GENERATED_LABEL =
  "Post-grow reflection review packet";

export const POST_GROW_REFLECTION_REVIEW_PACKET_SAFETY_LABELS = [
  "Operator review packet",
  "Sanitized",
  "Manual review only",
  "Not saved",
  "No live AI call",
] as const;

export interface PostGrowReflectionReviewPacketSectionSummary {
  key: string;
  label: string;
  kind: "paragraph" | "list";
  itemCount: number | null;
  paragraphPresent: boolean;
}

interface PostGrowReflectionReviewPacketBase {
  packetVersion: typeof POST_GROW_REFLECTION_REVIEW_PACKET_VERSION;
  generatedLabel: typeof POST_GROW_REFLECTION_REVIEW_PACKET_GENERATED_LABEL;
  status: PostGrowReflectionCandidatePasteResult["status"];
  outcomeLabel: string;
  inputKindLabel: string;
  issueCodes: readonly string[];
  failureReason: string;
  validationOptionsLabel: string;
  envelopeSourceLabel: string;
  envelopeCandidateFormat: string | null;
  persistenceLabel: "Not saved";
  runtimeLabel: "No live AI call";
  safetyLabels: readonly string[];
}

export interface PostGrowReflectionReviewPacketIdle extends PostGrowReflectionReviewPacketBase {
  status: "idle";
  confidence: null;
  sectionSummaries: null;
}

export interface PostGrowReflectionReviewPacketEmpty extends PostGrowReflectionReviewPacketBase {
  status: "empty";
  confidence: null;
  sectionSummaries: null;
}

export interface PostGrowReflectionReviewPacketInvalidJson extends PostGrowReflectionReviewPacketBase {
  status: "invalid_json";
  confidence: null;
  sectionSummaries: null;
}

export interface PostGrowReflectionReviewPacketEnvelopeRejected extends PostGrowReflectionReviewPacketBase {
  status: "envelope_rejected";
  confidence: null;
  sectionSummaries: null;
}

export interface PostGrowReflectionReviewPacketValidationFailed extends PostGrowReflectionReviewPacketBase {
  status: "validation_failed";
  confidence: null;
  sectionSummaries: null;
}

export interface PostGrowReflectionReviewPacketValidated extends PostGrowReflectionReviewPacketBase {
  status: "validated";
  confidence: string;
  sectionSummaries: PostGrowReflectionReviewPacketSectionSummary[];
}

export type PostGrowReflectionReviewPacket =
  | PostGrowReflectionReviewPacketIdle
  | PostGrowReflectionReviewPacketEmpty
  | PostGrowReflectionReviewPacketInvalidJson
  | PostGrowReflectionReviewPacketEnvelopeRejected
  | PostGrowReflectionReviewPacketValidationFailed
  | PostGrowReflectionReviewPacketValidated;

function resolveOutcomeLabel(result: PostGrowReflectionCandidatePasteResult): string {
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

function resolveInputKindLabel(result: PostGrowReflectionCandidatePasteResult): string {
  if (result.inputKind === "envelope") return "Envelope";
  if (result.inputKind === "raw_candidate") return "Raw candidate";
  return "No candidate";
}

function resolveIssueCodes(result: PostGrowReflectionCandidatePasteResult): readonly string[] {
  if (result.status === "validation_failed" || result.status === "envelope_rejected") {
    return result.issueCodes;
  }
  return [];
}

function resolveFailureReason(result: PostGrowReflectionCandidatePasteResult): string {
  if (result.status === "validation_failed" || result.status === "envelope_rejected") {
    return result.failureReason;
  }
  return "none";
}

function resolveValidationOptionsLabel(result: PostGrowReflectionCandidatePasteResult): string {
  if (result.status === "validated" || result.status === "validation_failed") {
    return result.validationOptions.label;
  }
  return "not available";
}

function resolveEnvelopeSourceLabel(result: PostGrowReflectionCandidatePasteResult): string {
  if (
    (result.status === "validated" || result.status === "validation_failed") &&
    result.envelopeMetadata
  ) {
    return result.envelopeMetadata.sourceLabel;
  }
  return "not available";
}

function resolveEnvelopeCandidateFormat(
  result: PostGrowReflectionCandidatePasteResult,
): string | null {
  if (
    (result.status === "validated" || result.status === "validation_failed") &&
    result.envelopeMetadata
  ) {
    return result.envelopeMetadata.candidateFormat;
  }
  return null;
}

export function buildPostGrowReflectionReviewPacket(
  result: PostGrowReflectionCandidatePasteResult,
): PostGrowReflectionReviewPacket {
  const common = {
    packetVersion: POST_GROW_REFLECTION_REVIEW_PACKET_VERSION,
    generatedLabel: POST_GROW_REFLECTION_REVIEW_PACKET_GENERATED_LABEL,
    outcomeLabel: resolveOutcomeLabel(result),
    inputKindLabel: resolveInputKindLabel(result),
    issueCodes: resolveIssueCodes(result),
    failureReason: resolveFailureReason(result),
    validationOptionsLabel: resolveValidationOptionsLabel(result),
    envelopeSourceLabel: resolveEnvelopeSourceLabel(result),
    envelopeCandidateFormat: resolveEnvelopeCandidateFormat(result),
    persistenceLabel: "Not saved" as const,
    runtimeLabel: "No live AI call" as const,
    safetyLabels: POST_GROW_REFLECTION_REVIEW_PACKET_SAFETY_LABELS,
  } as const;

  if (result.status === "validated") {
    return {
      ...common,
      status: "validated",
      confidence: result.confidence,
      sectionSummaries: result.sections.map((section) => ({
        key: section.key,
        label: section.label,
        kind: section.kind,
        itemCount: section.kind === "list" ? (section.items?.length ?? 0) : null,
        paragraphPresent: section.kind === "paragraph" ? Boolean(section.paragraph) : false,
      })),
    };
  }

  if (result.status === "idle")
    return { ...common, status: "idle", confidence: null, sectionSummaries: null };
  if (result.status === "empty")
    return { ...common, status: "empty", confidence: null, sectionSummaries: null };
  if (result.status === "invalid_json")
    return { ...common, status: "invalid_json", confidence: null, sectionSummaries: null };
  if (result.status === "envelope_rejected")
    return { ...common, status: "envelope_rejected", confidence: null, sectionSummaries: null };
  return { ...common, status: "validation_failed", confidence: null, sectionSummaries: null };
}

export function serializePostGrowReflectionReviewPacket(
  packet: PostGrowReflectionReviewPacket,
): string {
  return JSON.stringify(packet, null, 2);
}

export function buildPostGrowReflectionReviewPacketFilename(
  packet: PostGrowReflectionReviewPacket,
): string {
  return `post-grow-reflection-review-packet-${packet.status}.json`;
}
