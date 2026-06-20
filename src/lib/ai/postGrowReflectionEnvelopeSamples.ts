import { createValidPostGrowReflectionOutput } from "./postGrowReflectionOutputFixtures";

export const POST_GROW_REFLECTION_ENVELOPE_SAMPLES_VERSION =
  "post-grow-reflection-envelope-samples-v1";

export type PostGrowReflectionEnvelopeSampleId =
  | "valid_envelope"
  | "contract_rejected_missing_candidate";

export interface PostGrowReflectionEnvelopeSample {
  id: PostGrowReflectionEnvelopeSampleId;
  label: string;
  description: string;
  expectedStatus: "validated" | "envelope_rejected";
  jsonText: string;
}

const ENVELOPE_KIND = "post_grow_reflection_candidate";
const SAMPLE_CREATED_AT = "2026-06-20T15:00:00.000Z";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildValidPostGrowReflectionEnvelopeSample(): PostGrowReflectionEnvelopeSample {
  return {
    id: "valid_envelope",
    label: "Valid envelope sample",
    description: "Accepted by the envelope contract and expected to pass reflection validation.",
    expectedStatus: "validated",
    jsonText: prettyJson({
      kind: ENVELOPE_KIND,
      candidate: createValidPostGrowReflectionOutput(),
      metadata: {
        sourceLabel: "local deterministic envelope sample",
        requestLabel: "sample-valid-envelope-001",
        createdAt: SAMPLE_CREATED_AT,
      },
    }),
  };
}

export function buildContractRejectedPostGrowReflectionEnvelopeSample(): PostGrowReflectionEnvelopeSample {
  return {
    id: "contract_rejected_missing_candidate",
    label: "Rejected envelope sample",
    description: "Rejected by the envelope contract before reflection validation because candidate is missing.",
    expectedStatus: "envelope_rejected",
    jsonText: prettyJson({
      kind: ENVELOPE_KIND,
      metadata: {
        sourceLabel: "local deterministic rejected envelope sample",
        requestLabel: "sample-rejected-envelope-001",
        createdAt: SAMPLE_CREATED_AT,
      },
    }),
  };
}

export function buildPostGrowReflectionEnvelopeSamples(): PostGrowReflectionEnvelopeSample[] {
  return [
    buildValidPostGrowReflectionEnvelopeSample(),
    buildContractRejectedPostGrowReflectionEnvelopeSample(),
  ];
}

export function findPostGrowReflectionEnvelopeSample(
  id: PostGrowReflectionEnvelopeSampleId,
): PostGrowReflectionEnvelopeSample {
  return buildPostGrowReflectionEnvelopeSamples().find((sample) => sample.id === id)!;
}
