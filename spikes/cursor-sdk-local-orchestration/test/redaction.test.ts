import { describe, expect, it } from "vitest";

import { FINDING_SCHEMA_VERSION } from "../src/constants.ts";
import {
  containsSecretShaped,
  detectInvalidPresentedAsHealthy,
  redactText,
  sanitizeInspectorOutput,
} from "../src/outputSanitizer.ts";
import { validateInspectorOutput } from "../src/schemas.ts";

describe("output sanitization", () => {
  it("redacts secret-shaped canary values", () => {
    const redacted = redactText(
      "SYNTHETIC_SECRET_CANARY=sk_test_FAKE_NOT_A_REAL_KEY_verdant_spike_only",
    );
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("sk_test_FAKE_NOT_A_REAL_KEY_verdant_spike_only");
  });

  it("redacts inspector evidence before it can enter a receipt", () => {
    const sanitized = sanitizeInspectorOutput(
      validateInspectorOutput({
        schemaVersion: FINDING_SCHEMA_VERSION,
        synthetic: true,
        findings: [
          {
            findingId: "SYN-007",
            sourceFile: "secret-canary.synthetic.txt",
            evidence: "CURSOR_API_KEY=SYNTHETIC_PLACEHOLDER_NEVER_A_LIVE_KEY leaked",
            confidence: "high",
            classification: "secret-shaped",
            missingInformation: [],
            recommendedHumanReview: true,
          },
        ],
      }),
    );
    expect(sanitized.findings[0]?.evidence).not.toMatch(/CURSOR_API_KEY\s*=/);
    expect(containsSecretShaped(sanitized)).toBe(false);
  });

  it("forces demo and invalid sources off healthy", () => {
    const sanitized = sanitizeInspectorOutput(
      validateInspectorOutput({
        schemaVersion: FINDING_SCHEMA_VERSION,
        synthetic: true,
        findings: [
          {
            findingId: "SYN-003",
            sourceFile: "sensor-demo.synthetic.json",
            evidence: "SYNTHETIC demo",
            confidence: "high",
            classification: "healthy",
            missingInformation: [],
            recommendedHumanReview: false,
          },
          {
            findingId: "SYN-004",
            sourceFile: "sensor-invalid.synthetic.json",
            evidence: "SYNTHETIC invalid",
            confidence: "high",
            classification: "healthy",
            missingInformation: [],
            recommendedHumanReview: false,
          },
        ],
      }),
    );
    expect(sanitized.findings.find((item) => item.findingId === "SYN-003")?.classification).toBe(
      "demo",
    );
    expect(sanitized.findings.find((item) => item.findingId === "SYN-004")?.classification).toBe(
      "invalid",
    );
  });

  it("detects invalid-as-healthy on raw inspector output before sanitization", () => {
    const raw = validateInspectorOutput({
      schemaVersion: FINDING_SCHEMA_VERSION,
      synthetic: true,
      findings: [
        {
          findingId: "SYN-004",
          sourceFile: "sensor-invalid.synthetic.json",
          evidence: "SYNTHETIC invalid",
          confidence: "high",
          classification: "healthy",
          missingInformation: [],
          recommendedHumanReview: false,
        },
      ],
    });
    expect(detectInvalidPresentedAsHealthy(raw)).toBe(true);
    expect(detectInvalidPresentedAsHealthy(sanitizeInspectorOutput(raw))).toBe(false);
  });
});
