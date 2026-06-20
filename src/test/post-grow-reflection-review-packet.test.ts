import { describe, expect, it } from "vitest";

import { validatePostGrowReflectionCandidatePaste } from "@/lib/ai/postGrowReflectionCandidatePasteValidator";
import { findPostGrowReflectionEnvelopeSample } from "@/lib/ai/postGrowReflectionEnvelopeSamples";
import {
  createMalformedPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "@/lib/ai/postGrowReflectionOutputFixtures";
import {
  POST_GROW_REFLECTION_REVIEW_PACKET_VERSION,
  buildPostGrowReflectionReviewPacket,
  buildPostGrowReflectionReviewPacketFilename,
  serializePostGrowReflectionReviewPacket,
} from "@/lib/ai/postGrowReflectionReviewPacket";

describe("buildPostGrowReflectionReviewPacket", () => {
  it("builds an idle packet for idle input", () => {
    const result = validatePostGrowReflectionCandidatePaste();
    const packet = buildPostGrowReflectionReviewPacket(result);

    expect(packet.status).toBe("idle");
    expect(packet.packetVersion).toBe(POST_GROW_REFLECTION_REVIEW_PACKET_VERSION);
    expect(packet.persistenceLabel).toBe("Not saved");
    expect(packet.runtimeLabel).toBe("No live AI call");
    expect(packet.safetyLabels).toEqual(
      expect.arrayContaining(["Operator review packet", "Sanitized", "Manual review only"]),
    );
    expect(packet.confidence).toBeNull();
    expect(packet.sectionSummaries).toBeNull();
  });

  it("builds a validated packet excluding raw candidate body text", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    const packet = buildPostGrowReflectionReviewPacket(result);

    expect(packet.status).toBe("validated");
    expect(packet.outcomeLabel).toBe("Validated locally");
    expect(packet.inputKindLabel).toBe("Raw candidate");
    expect(packet.confidence).toBe("High");
    expect(packet.sectionSummaries).not.toBeNull();
    expect(JSON.stringify(packet)).not.toContain("flower VPD averaged 1.21 kPa");
  });

  it("includes section summaries with counts and presence only — no body text", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    const packet = buildPostGrowReflectionReviewPacket(result);
    if (packet.status !== "validated") throw new Error("expected validated");

    expect(packet.sectionSummaries.length).toBeGreaterThan(0);
    for (const section of packet.sectionSummaries) {
      expect(section.key).toBeDefined();
      expect(section.label).toBeDefined();
      expect(["paragraph", "list"]).toContain(section.kind);
      if (section.kind === "list") {
        expect(typeof section.itemCount).toBe("number");
        expect(section.itemCount).toBeGreaterThanOrEqual(0);
      } else {
        expect(typeof section.paragraphPresent).toBe("boolean");
        expect(section.itemCount).toBeNull();
      }
      expect(section).not.toHaveProperty("paragraph");
      expect(section).not.toHaveProperty("items");
    }
  });

  it("includes safe envelope source and format for validated envelope", () => {
    const sample = findPostGrowReflectionEnvelopeSample("valid_envelope");
    const result = validatePostGrowReflectionCandidatePaste(sample.jsonText);
    const packet = buildPostGrowReflectionReviewPacket(result);

    expect(packet.status).toBe("validated");
    expect(packet.inputKindLabel).toBe("Envelope");
    expect(packet.envelopeSourceLabel).toBe("local deterministic envelope sample");
    expect(packet.envelopeCandidateFormat).toBe("object");
  });

  it("includes issue codes and failure reason for envelope_rejected", () => {
    const sample = findPostGrowReflectionEnvelopeSample("contract_rejected_missing_candidate");
    const result = validatePostGrowReflectionCandidatePaste(sample.jsonText);
    const packet = buildPostGrowReflectionReviewPacket(result);

    expect(packet.status).toBe("envelope_rejected");
    expect(packet.outcomeLabel).toBe("Rejected by envelope contract");
    expect(packet.issueCodes).toContain("missing_candidate");
    expect(packet.envelopeSourceLabel).toBe("not available");
    expect(packet.confidence).toBeNull();
    expect(packet.sectionSummaries).toBeNull();
  });

  it("builds a validation_failed packet without body text", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createMalformedPostGrowReflectionOutput()),
    );
    const packet = buildPostGrowReflectionReviewPacket(result);

    expect(packet.status).toBe("validation_failed");
    expect(packet.outcomeLabel).toBe("Rejected by reflection validator");
    expect(packet.issueCodes.length).toBeGreaterThan(0);
    expect(JSON.stringify(packet)).not.toContain("flower VPD averaged 1.21 kPa");
  });

  it("excludes parseError from invalid_json packet", () => {
    const result = validatePostGrowReflectionCandidatePaste("{not-json");
    const packet = buildPostGrowReflectionReviewPacket(result);

    expect(packet.status).toBe("invalid_json");
    expect(packet.outcomeLabel).toBe("Invalid JSON");
    expect(packet.confidence).toBeNull();
    expect(packet.sectionSummaries).toBeNull();
    expect(JSON.stringify(packet)).not.toContain("{not-json");
  });

  it("produces a deterministic filename by status with no timestamps or IDs", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    const packet = buildPostGrowReflectionReviewPacket(result);
    const filename = buildPostGrowReflectionReviewPacketFilename(packet);

    expect(filename).toBe("post-grow-reflection-review-packet-validated.json");
    expect(filename).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("is deterministic across calls", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    expect(buildPostGrowReflectionReviewPacket(result)).toEqual(
      buildPostGrowReflectionReviewPacket(result),
    );
  });

  it("serialization is deterministic", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    const packet = buildPostGrowReflectionReviewPacket(result);
    expect(serializePostGrowReflectionReviewPacket(packet)).toBe(
      serializePostGrowReflectionReviewPacket(packet),
    );
  });

  it("safety labels include all required operator labels", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    const packet = buildPostGrowReflectionReviewPacket(result);

    expect(packet.safetyLabels).toContain("Operator review packet");
    expect(packet.safetyLabels).toContain("Sanitized");
    expect(packet.safetyLabels).toContain("Manual review only");
    expect(packet.safetyLabels).toContain("Not saved");
    expect(packet.safetyLabels).toContain("No live AI call");
  });
});
