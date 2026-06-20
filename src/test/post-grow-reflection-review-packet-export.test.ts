import { describe, expect, it } from "vitest";

import { validatePostGrowReflectionCandidatePaste } from "@/lib/ai/postGrowReflectionCandidatePasteValidator";
import { findPostGrowReflectionEnvelopeSample } from "@/lib/ai/postGrowReflectionEnvelopeSamples";
import { createValidPostGrowReflectionOutput } from "@/lib/ai/postGrowReflectionOutputFixtures";
import { buildPostGrowReflectionReviewPacket } from "@/lib/ai/postGrowReflectionReviewPacket";
import {
  buildReviewPacketDownloadBlob,
  buildReviewPacketJsonText,
  buildReviewPacketOperatorText,
} from "@/lib/ai/postGrowReflectionReviewPacketExport";

function validatedPacket() {
  const result = validatePostGrowReflectionCandidatePaste(
    JSON.stringify(createValidPostGrowReflectionOutput()),
  );
  return buildPostGrowReflectionReviewPacket(result);
}

describe("buildReviewPacketJsonText", () => {
  it("produces valid parseable JSON", () => {
    expect(() => JSON.parse(buildReviewPacketJsonText(validatedPacket()))).not.toThrow();
  });

  it("is pretty printed", () => {
    expect(buildReviewPacketJsonText(validatedPacket())).toContain("\n");
  });

  it("excludes raw candidate body text", () => {
    expect(buildReviewPacketJsonText(validatedPacket())).not.toContain(
      "flower VPD averaged 1.21 kPa",
    );
  });

  it("includes outcome label", () => {
    expect(buildReviewPacketJsonText(validatedPacket())).toContain("Validated locally");
  });

  it("includes safety labels", () => {
    const text = buildReviewPacketJsonText(validatedPacket());
    expect(text).toContain("Operator review packet");
    expect(text).toContain("Not saved");
    expect(text).toContain("No live AI call");
  });
});

describe("buildReviewPacketOperatorText", () => {
  it("includes required operator-readable fields", () => {
    const text = buildReviewPacketOperatorText(validatedPacket());
    expect(text).toContain("Post-Grow Reflection Review Packet");
    expect(text).toContain("Outcome:");
    expect(text).toContain("Persistence:");
    expect(text).toContain("Runtime:");
    expect(text).toContain("Safety labels:");
  });

  it("excludes raw candidate body text", () => {
    expect(buildReviewPacketOperatorText(validatedPacket())).not.toContain(
      "flower VPD averaged 1.21 kPa",
    );
  });

  it("includes envelope source for envelope validated result", () => {
    const sample = findPostGrowReflectionEnvelopeSample("valid_envelope");
    const packet = buildPostGrowReflectionReviewPacket(
      validatePostGrowReflectionCandidatePaste(sample.jsonText),
    );
    expect(buildReviewPacketOperatorText(packet)).toContain("local deterministic envelope sample");
  });

  it("includes section summary counts without body text", () => {
    const text = buildReviewPacketOperatorText(validatedPacket());
    expect(text).toContain("Section summaries:");
    expect(text).toMatch(/\d+ items/);
    expect(text).not.toContain("flower VPD averaged 1.21 kPa");
  });
});

describe("buildReviewPacketDownloadBlob", () => {
  it("creates a Blob with JSON MIME type when Blob exists in test environment", () => {
    if (typeof Blob === "undefined") return;
    const blob = buildReviewPacketDownloadBlob(validatedPacket());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("blob size matches the sanitized JSON text length", () => {
    if (typeof Blob === "undefined") return;
    const packet = validatedPacket();
    const blob = buildReviewPacketDownloadBlob(packet);
    const text = buildReviewPacketJsonText(packet);
    expect(blob.size).toBe(new Blob([text]).size);
    expect(text).not.toContain("flower VPD averaged 1.21 kPa");
  });
});
