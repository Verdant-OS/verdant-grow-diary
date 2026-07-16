/**
 * Direct unit tests for the CI artifact sanitizer
 * (scripts/sanitize-mcp-rls-artifacts.mjs).
 *
 * The mcp-local-rls workflow uploads vitest-output.log and harness
 * artifacts when the job fails; a failing leakage assertion prints the
 * received payload verbatim. These tests prove the sanitizer's rules
 * cover that free text — not just bare JWT/bearer formats — so values
 * like `refresh_token=xyz` can never survive into an uploaded artifact.
 */
import { describe, it, expect } from "vitest";
import { sanitizeText, REDACTED } from "../../scripts/sanitize-mcp-rls-artifacts.mjs";

describe("sanitize-mcp-rls-artifacts sanitizeText", () => {
  it("redacts JWT-like strings", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4";
    expect(sanitizeText(`token was ${jwt} in the log`)).not.toContain(jwt);
  });

  it("redacts bearer tokens", () => {
    const out = sanitizeText("sent Bearer abcdef1234567890xyz to the API");
    expect(out).not.toContain("abcdef1234567890xyz");
    expect(out).toContain(REDACTED);
  });

  it("redacts Supabase sb_secret_/sb_publishable_ keys", () => {
    const out = sanitizeText("key sb_secret_0123456789abcdef and sb_publishable_fedcba9876543210");
    expect(out).not.toContain("sb_secret_0123456789abcdef");
    expect(out).not.toContain("sb_publishable_fedcba9876543210");
  });

  it("redacts non-JWT refresh/access/bridge token values in query form", () => {
    const out = sanitizeText("callback?refresh_token=xyz123&access_token=shortval&next=/home");
    expect(out).not.toContain("xyz123");
    expect(out).not.toContain("shortval");
    // Keys stay visible so the artifact still says what leaked.
    expect(out).toContain("refresh_token=");
    expect(out).toContain(`refresh_token=${REDACTED}`);
  });

  it("redacts token values in printed JSON payloads", () => {
    const out = sanitizeText(
      '{ "refresh_token": "v1.MjAyNi1wbGFpbi10b2tlbg", "bridge_token": "brg-42-not-a-jwt" }',
    );
    expect(out).not.toContain("v1.MjAyNi1wbGFpbi10b2tlbg");
    expect(out).not.toContain("brg-42-not-a-jwt");
  });

  it("redacts client_secret fields in both spellings", () => {
    const out = sanitizeText('client_secret=s3cr3tvalue and { "client-secret": "other-value" }');
    expect(out).not.toContain("s3cr3tvalue");
    expect(out).not.toContain("other-value");
  });

  it("redacts authorization and cookie header values to end of line", () => {
    const out = sanitizeText(
      ["authorization: Token custom-scheme-value", "cookie: sb=session-cookie-value; a=b"].join(
        "\n",
      ),
    );
    expect(out).not.toContain("custom-scheme-value");
    expect(out).not.toContain("session-cookie-value");
    expect(out).toContain("authorization:");
  });

  it("redacts raw_payload values including nested objects", () => {
    const out = sanitizeText(
      '"raw_payload": {"secret_reading": 12.5, "token": "abc"}, "next_field": 1',
    );
    expect(out).not.toContain("secret_reading");
    expect(out).toContain("raw_payload");
  });

  it("redacts provided env secret values verbatim", () => {
    const out = sanitizeText("connected with key super-local-anon-key-value", [
      "super-local-anon-key-value",
    ]);
    expect(out).not.toContain("super-local-anon-key-value");
    expect(out).toContain(REDACTED);
  });

  it("leaves benign prose and bare key names untouched", () => {
    const text = "sensor rows keep source and quality labels; no refresh_token present";
    expect(sanitizeText(text)).toBe(text);
  });
});
