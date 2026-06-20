import type { PostGrowReflectionAdapterCandidate } from "./postGrowReflectionAdapter";

export const POST_GROW_REFLECTION_PROVIDER_CANDIDATE_ENVELOPE_VERSION =
  "post-grow-reflection-provider-candidate-envelope-v1";

export type PostGrowReflectionProviderCandidateEnvelopeStatus = "accepted" | "rejected";

export interface PostGrowReflectionProviderCandidateEnvelopeMetadata {
  sourceLabel: string;
  requestLabel: string | null;
  createdAt: string | null;
  candidateFormat: "object" | "json_string";
}

export interface PostGrowReflectionProviderCandidateEnvelopeAccepted {
  ok: true;
  status: "accepted";
  envelopeVersion: typeof POST_GROW_REFLECTION_PROVIDER_CANDIDATE_ENVELOPE_VERSION;
  candidate: PostGrowReflectionAdapterCandidate;
  metadata: PostGrowReflectionProviderCandidateEnvelopeMetadata;
  issueCodes: [];
}

export interface PostGrowReflectionProviderCandidateEnvelopeRejected {
  ok: false;
  status: "rejected";
  envelopeVersion: typeof POST_GROW_REFLECTION_PROVIDER_CANDIDATE_ENVELOPE_VERSION;
  candidate: null;
  metadata: null;
  issueCodes: string[];
  failureReason: string;
}

export type PostGrowReflectionProviderCandidateEnvelopeResult =
  | PostGrowReflectionProviderCandidateEnvelopeAccepted
  | PostGrowReflectionProviderCandidateEnvelopeRejected;

interface CandidateEnvelopeLike {
  kind?: unknown;
  candidate?: unknown;
  metadata?: unknown;
}

const ENVELOPE_KIND = "post_grow_reflection_candidate";
const MAX_LABEL_LENGTH = 80;
const MAX_REQUEST_LABEL_LENGTH = 120;
const DISALLOWED_METADATA_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "password",
  "secret",
  "session",
  "token",
]);

function rejected(
  issueCodes: string[],
  failureReason: string,
): PostGrowReflectionProviderCandidateEnvelopeRejected {
  return {
    ok: false,
    status: "rejected",
    envelopeVersion: POST_GROW_REFLECTION_PROVIDER_CANDIDATE_ENVELOPE_VERSION,
    candidate: null,
    metadata: null,
    issueCodes: [...issueCodes].sort((a, b) => a.localeCompare(b)),
    failureReason,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvelope(
  input: unknown,
): { ok: true; value: unknown } | { ok: false; issue: string } {
  if (typeof input !== "string") return { ok: true, value: input };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, issue: "empty_envelope" };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, issue: "invalid_envelope_json" };
  }
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

function metadataHasUnsafeKey(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Object.keys(value).some((key) => DISALLOWED_METADATA_KEYS.has(key.toLowerCase()));
}

function metadataValue(value: unknown, key: string): unknown {
  return isPlainObject(value) ? value[key] : undefined;
}

function candidateFormat(candidate: unknown): "object" | "json_string" | null {
  if (typeof candidate === "string") return "json_string";
  if (isPlainObject(candidate)) return "object";
  return null;
}

export function normalizePostGrowReflectionProviderCandidateEnvelope(
  input: unknown,
): PostGrowReflectionProviderCandidateEnvelopeResult {
  const parsedEnvelope = parseEnvelope(input);
  if (!parsedEnvelope.ok) {
    const p = parsedEnvelope as { issue: string };
    return rejected([p.issue], p.issue);
  }

  if (!isPlainObject(parsedEnvelope.value)) {
    return rejected(["invalid_envelope"], "Candidate envelope must be an object.");
  }

  const envelope = parsedEnvelope.value as CandidateEnvelopeLike;
  if (envelope.kind !== ENVELOPE_KIND) {
    return rejected(["invalid_kind"], `Candidate envelope kind must be ${ENVELOPE_KIND}.`);
  }

  if (!("candidate" in envelope)) {
    return rejected(["missing_candidate"], "Candidate envelope is missing candidate output.");
  }

  const format = candidateFormat(envelope.candidate);
  if (!format) {
    return rejected(
      ["invalid_candidate_format"],
      "Candidate output must be an object or JSON string.",
    );
  }

  if (metadataHasUnsafeKey(envelope.metadata)) {
    return rejected(["unsafe_metadata_key"], "Candidate metadata contains a blocked private key.");
  }

  const sourceLabel =
    normalizeText(metadataValue(envelope.metadata, "sourceLabel"), MAX_LABEL_LENGTH) ??
    "external candidate";
  const requestLabel = normalizeText(
    metadataValue(envelope.metadata, "requestLabel"),
    MAX_REQUEST_LABEL_LENGTH,
  );
  const createdAt = normalizeText(
    metadataValue(envelope.metadata, "createdAt"),
    MAX_REQUEST_LABEL_LENGTH,
  );

  return {
    ok: true,
    status: "accepted",
    envelopeVersion: POST_GROW_REFLECTION_PROVIDER_CANDIDATE_ENVELOPE_VERSION,
    candidate: {
      source: "external_candidate",
      rawOutput: envelope.candidate,
    },
    metadata: {
      sourceLabel,
      requestLabel,
      createdAt,
      candidateFormat: format,
    },
    issueCodes: [],
  };
}
