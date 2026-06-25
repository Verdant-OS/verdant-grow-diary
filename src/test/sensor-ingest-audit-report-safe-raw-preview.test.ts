import { describe, it, expect } from "vitest";
import {
  buildSafeRawPayloadPreview,
  RAW_PAYLOAD_HIDDEN_COPY,
} from "@/lib/sensorIngestAuditReportRules";

describe("buildSafeRawPayloadPreview", () => {
  it("redacts known secret keys", () => {
    const r = buildSafeRawPayloadPreview({
      PASSKEY: "S3CRETKEY",
      token: "tok_xyz",
      metrics: { temp_c: 22 },
    });
    expect(r.safe).toBe(true);
    expect(r.preview).toContain("[redacted]");
    expect(r.preview).not.toContain("S3CRETKEY");
    expect(r.preview).not.toContain("tok_xyz");
  });

  it("hides preview when MAC-like value persists in non-redacted key", () => {
    const r = buildSafeRawPayloadPreview({
      device_info: "AA:BB:CC:DD:EE:FF was here",
    });
    expect(r.safe).toBe(false);
    expect(r.preview).toBeNull();
    expect(r.reason).toBe(RAW_PAYLOAD_HIDDEN_COPY);
  });

  it("hides preview when a Bearer token leaks through", () => {
    const r = buildSafeRawPayloadPreview({ note: "Bearer abcdef1234567890" });
    expect(r.safe).toBe(false);
  });

  it("hides preview when a private IP leaks through", () => {
    const r = buildSafeRawPayloadPreview({ note: "from 192.168.1.42" });
    expect(r.safe).toBe(false);
  });

  it("hides preview when a JWT-shaped value leaks through", () => {
    const r = buildSafeRawPayloadPreview({
      note: "eyJabcdefghij.eyJklmnopqrstuvwx.signaturePart",
    });
    expect(r.safe).toBe(false);
  });

  it("returns not-available for null payload", () => {
    const r = buildSafeRawPayloadPreview(null);
    expect(r.safe).toBe(false);
    expect(r.preview).toBeNull();
  });
});
