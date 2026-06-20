import { describe, expect, it } from "vitest";

import {
  buildContractRejectedPostGrowReflectionEnvelopeSample,
  buildPostGrowReflectionEnvelopeSamples,
  buildValidPostGrowReflectionEnvelopeSample,
  findPostGrowReflectionEnvelopeSample,
} from "@/lib/ai/postGrowReflectionEnvelopeSamples";
import { validatePostGrowReflectionCandidatePaste } from "@/lib/ai/postGrowReflectionCandidatePasteValidator";

describe("post-grow reflection envelope samples", () => {
  it("builds deterministic valid and rejected samples", () => {
    const samples = buildPostGrowReflectionEnvelopeSamples();
    expect(samples.map((sample) => sample.id)).toEqual([
      "valid_envelope",
      "contract_rejected_missing_candidate",
    ]);
    expect(samples.map((sample) => sample.expectedStatus)).toEqual([
      "validated",
      "envelope_rejected",
    ]);
    expect(buildPostGrowReflectionEnvelopeSamples()).toEqual(buildPostGrowReflectionEnvelopeSamples());
  });

  it("valid sample passes through the existing paste validator", () => {
    const sample = buildValidPostGrowReflectionEnvelopeSample();
    const result = validatePostGrowReflectionCandidatePaste(sample.jsonText);

    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.inputKind).toBe("envelope");
    expect(result.envelopeMetadata?.sourceLabel).toBe("local deterministic envelope sample");
  });

  it("contract rejected sample fails before reflection validation", () => {
    const sample = buildContractRejectedPostGrowReflectionEnvelopeSample();
    const result = validatePostGrowReflectionCandidatePaste(sample.jsonText);

    expect(result.status).toBe("envelope_rejected");
    if (result.status !== "envelope_rejected") return;
    expect(result.issueCodes).toContain("missing_candidate");
  });

  it("finds samples by id", () => {
    expect(findPostGrowReflectionEnvelopeSample("valid_envelope").label).toBe(
      "Valid envelope sample",
    );
    expect(findPostGrowReflectionEnvelopeSample("contract_rejected_missing_candidate").label).toBe(
      "Rejected envelope sample",
    );
  });
});
