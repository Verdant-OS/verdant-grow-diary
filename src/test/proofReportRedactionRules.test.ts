import { describe, it, expect } from "vitest";
import {
  sanitizeProofReportMarkdown,
  PROOF_REPORT_REDACTION_NOTICE,
  REDACTED_PLACEHOLDER,
} from "@/lib/proofReportRedactionRules";

describe("proofReportRedactionRules", () => {
  it("redacts UUIDs", () => {
    const out = sanitizeProofReportMarkdown("alert 11111111-2222-3333-4444-555555555555 raised");
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
    for (const k of ["bridge_token", "access_token", "refresh_token", "service_role"]) {
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
    expect(sanitizeProofReportMarkdown(null as unknown as string)).toBe("");
  });

  it("preserves benign human-readable proof prose", () => {
    const src = "Step 3 — Sensor snapshot: source=manual, captured today (last hour).";
    expect(sanitizeProofReportMarkdown(src)).toBe(src);
  });

  // Fourth instance of the redaction-ordering defect class, in the module the
  // audit behind #1185 / #1184 / #1187 cited as the CORRECT counter-example.
  // It is correct for the shapes SECRET_PAIR_RES covers; it had no rule for a
  // header-prefixed assignment, so BEARER_RE consumed the NAME and left the
  // VALUE behind:
  //
  //   Bearer MY_PASSKEY_VAR="secret"  ->  [redacted]="secret"
  //
  // The keyword pair rules cannot reach it: they are \b-anchored
  // (\bapi_key\b) and `_` is a word character, so a label inside
  // MY_API_KEY_VAR matches nothing. Found by the shared ordering contract's
  // partial-redaction invariant (#1189), not by review.
  it.each([
    ['Bearer MY_PASSKEY_VAR="s3cretV4lue123456"', "s3cretV4lue123456"],
    ['Bearer SOME_PLAIN_NAME="s3cretV4lue123456"', "s3cretV4lue123456"],
    ["Bearer MY_PASSKEY_VAR=s3cretV4lue123456", "s3cretV4lue123456"],
    ["authorization: MY_CONFIG_VAR=s3cretV4lue123456", "s3cretV4lue123456"],
    ['proof line: Bearer MY_BRIDGE_TOKEN_VAR="s3cretV4lue123456" end', "s3cretV4lue123456"],
  ] as const)("redacts a header-prefixed assignment whole: %s", (input, secret) => {
    expect(sanitizeProofReportMarkdown(input), `value survived in: ${input}`).not.toContain(secret);
  });

  // BEARER_RE is case-SENSITIVE, so a lowercase `bearer NAME=value` passed
  // through COMPLETELY untouched — not even partially redacted.
  it("redacts a lowercase bearer-prefixed assignment", () => {
    const input = 'bearer MY_API_KEY_VAR="s3cretV4lue123456"';
    expect(sanitizeProofReportMarkdown(input)).not.toContain("s3cretV4lue123456");
  });

  // The property, stated directly: a placeholder present while the secret
  // survives means a rule fired and destroyed only part of the span. Output
  // that looks sanitized and is not — the one failure mode a reader cannot
  // spot by eye.
  it.each([
    'Bearer MY_PASSKEY_VAR="s3cretV4lue123456"',
    'Bearer SOME_PLAIN_NAME="s3cretV4lue123456"',
    "Bearer BridgeToken=s3cretV4lue123456",
  ] as const)("never leaves a placeholder beside a surviving secret: %s", (input) => {
    const out = sanitizeProofReportMarkdown(input);
    if (out.includes("[redacted]")) {
      expect(out, `partial redaction — looks sanitized but is not: ${out}`).not.toContain(
        "s3cretV4lue123456",
      );
    }
  });

  // Fence: the new rule requires the assignment to follow the name
  // IMMEDIATELY, so ordinary prose containing "bearer" is untouched.
  it.each([
    "The bearer of this report is the grow owner.",
    "bearer plants showed no stress",
    "Run at step=3 with mode=strict",
    "Verified: rows=42, errors=0",
    "Step 3 — Sensor snapshot: source=manual, captured today (last hour).",
  ] as const)("preserves benign proof prose: %s", (input) => {
    expect(sanitizeProofReportMarkdown(input)).toBe(input);
  });

  it("exposes the UI notice copy", () => {
    expect(PROOF_REPORT_REDACTION_NOTICE.join(" ")).toMatch(/sanitized report/i);
    expect(PROOF_REPORT_REDACTION_NOTICE.join(" ")).toMatch(
      /Raw IDs, payloads, and secrets are excluded/i,
    );
  });
});
