import { describe, it, expect } from "vitest";
import {
  sanitizeProofReportMarkdown,
  PROOF_REPORT_REDACTION_NOTICE,
  REDACTED_PLACEHOLDER,
} from "@/lib/proofReportRedactionRules";

describe("proofReportRedactionRules", () => {
  it("redacts UUIDs", () => {
    const out = sanitizeProofReportMarkdown(
      "alert 11111111-2222-3333-4444-555555555555 raised",
    );
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(out).toContain(REDACTED_PLACEHOLDER);
  });

  it("redacts second/millisecond ISO timestamps", () => {
    const out = sanitizeProofReportMarkdown(
      "captured_at=2026-06-23T14:05:09.123Z and 2026-06-23T14:05:09+02:00",
    );
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("redacts raw_payload references", () => {
    const out = sanitizeProofReportMarkdown("raw_payload={...}");
    expect(out).not.toMatch(/raw_payload/);
  });

  it("redacts bridge_token, access_token, refresh_token, service_role", () => {
    const out = sanitizeProofReportMarkdown(
      "bridge_token=abc access_token=xyz refresh_token=qqq service_role=zzz",
    );
    for (const k of [
      "bridge_token",
      "access_token",
      "refresh_token",
      "service_role",
    ]) {
      expect(out).not.toMatch(new RegExp(k));
    }
  });

  it("redacts Bearer tokens and JWT-shaped strings", () => {
    const out = sanitizeProofReportMarkdown(
      "Authorization: Bearer abc.def.ghi eyJhbGciOiJIUzI1NiJ9.payload.sig",
    );
    expect(out).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
    expect(out).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
  });

  it("redacts MAC-like values", () => {
    const out = sanitizeProofReportMarkdown("device AA:BB:CC:DD:EE:FF online");
    expect(out).not.toMatch(/[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}/i);
  });

  it("redacts long hex blobs that look like API keys", () => {
    const long = "deadbeef".repeat(8);
    const out = sanitizeProofReportMarkdown(`key=${long}`);
    expect(out).not.toContain(long);
  });

  it("is idempotent", () => {
    const once = sanitizeProofReportMarkdown(
      "uuid 11111111-2222-3333-4444-555555555555 token=Bearer abc.def.ghi",
    );
    const twice = sanitizeProofReportMarkdown(once);
    expect(twice).toBe(once);
  });

  it("returns empty string for empty/non-string input", () => {
    expect(sanitizeProofReportMarkdown("")).toBe("");
    expect(
      sanitizeProofReportMarkdown(null as unknown as string),
    ).toBe("");
  });

  it("preserves benign human-readable proof prose", () => {
    const src =
      "Step 3 — Sensor snapshot: source=manual, captured today (last hour).";
    expect(sanitizeProofReportMarkdown(src)).toBe(src);
  });

  it("exposes the UI notice copy", () => {
    expect(PROOF_REPORT_REDACTION_NOTICE.join(" ")).toMatch(
      /sanitized report/i,
    );
    expect(PROOF_REPORT_REDACTION_NOTICE.join(" ")).toMatch(
      /Raw IDs, payloads, and secrets are excluded/i,
    );
  });
});
