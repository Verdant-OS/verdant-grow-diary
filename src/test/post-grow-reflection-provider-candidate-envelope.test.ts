import { describe, expect, it } from "vitest";

import {
  POST_GROW_REFLECTION_PROVIDER_CANDIDATE_ENVELOPE_VERSION,
  normalizePostGrowReflectionProviderCandidateEnvelope,
} from "@/lib/ai/postGrowReflectionProviderCandidateEnvelope";
import { createValidPostGrowReflectionOutput } from "@/lib/ai/postGrowReflectionOutputFixtures";

const kind = "post_grow_reflection_candidate";

describe("normalizePostGrowReflectionProviderCandidateEnvelope", () => {
  it("accepts an object candidate envelope", () => {
    const output = createValidPostGrowReflectionOutput();
    const result = normalizePostGrowReflectionProviderCandidateEnvelope({
      kind,
      candidate: output,
      metadata: {
        sourceLabel: "operator supplied runtime candidate",
        requestLabel: "request-001",
        createdAt: "2026-06-20T15:00:00.000Z",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("accepted");
    expect(result.envelopeVersion).toBe(POST_GROW_REFLECTION_PROVIDER_CANDIDATE_ENVELOPE_VERSION);
    if (!result.ok) return;
    expect(result.candidate).toEqual({ source: "external_candidate", rawOutput: output });
    expect(result.metadata).toEqual({
      sourceLabel: "operator supplied runtime candidate",
      requestLabel: "request-001",
      createdAt: "2026-06-20T15:00:00.000Z",
      candidateFormat: "object",
    });
  });

  it("accepts a JSON string envelope and preserves JSON string candidate format", () => {
    const envelope = JSON.stringify({
      kind,
      candidate: JSON.stringify(createValidPostGrowReflectionOutput()),
      metadata: { sourceLabel: "external candidate" },
    });

    const result = normalizePostGrowReflectionProviderCandidateEnvelope(envelope);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.candidateFormat).toBe("json_string");
    expect(typeof result.candidate.rawOutput).toBe("string");
  });

  it("rejects invalid JSON envelope text", () => {
    const result = normalizePostGrowReflectionProviderCandidateEnvelope("{not-json");
    expect(result.ok).toBe(false);
    expect(result.status).toBe("rejected");
    if (result.ok) return;
    expect(result.issueCodes).toEqual(["invalid_envelope_json"]);
  });

  it("rejects non-object envelopes", () => {
    const result = normalizePostGrowReflectionProviderCandidateEnvelope([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issueCodes).toEqual(["invalid_envelope"]);
  });

  it("rejects unexpected envelope kind", () => {
    const result = normalizePostGrowReflectionProviderCandidateEnvelope({
      kind: "other",
      candidate: createValidPostGrowReflectionOutput(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issueCodes).toEqual(["invalid_kind"]);
  });

  it("rejects missing candidate output", () => {
    const result = normalizePostGrowReflectionProviderCandidateEnvelope({ kind });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issueCodes).toEqual(["missing_candidate"]);
  });

  it("rejects unsupported candidate format", () => {
    const result = normalizePostGrowReflectionProviderCandidateEnvelope({ kind, candidate: 123 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issueCodes).toEqual(["invalid_candidate_format"]);
  });

  it("rejects blocked private metadata keys", () => {
    const result = normalizePostGrowReflectionProviderCandidateEnvelope({
      kind,
      candidate: createValidPostGrowReflectionOutput(),
      metadata: { token: "do-not-store" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issueCodes).toEqual(["unsafe_metadata_key"]);
  });

  it("is deterministic for repeated normalization", () => {
    const envelope = {
      kind,
      candidate: createValidPostGrowReflectionOutput(),
      metadata: { sourceLabel: "external candidate", requestLabel: "request-002" },
    };
    expect(normalizePostGrowReflectionProviderCandidateEnvelope(envelope)).toEqual(
      normalizePostGrowReflectionProviderCandidateEnvelope(envelope),
    );
  });
});
