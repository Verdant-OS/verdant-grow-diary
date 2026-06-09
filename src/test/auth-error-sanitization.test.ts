// Tests for the central auth error sanitization layer + source scans
// guaranteeing /auth and /reset-password never render raw error.message.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  sanitizeAuthError,
  FORBIDDEN_AUTH_ERROR_FRAGMENTS,
  UNKNOWN_AUTH_ERROR,
} from "@/lib/authErrorRules";
import {
  SIGN_IN_FRIENDLY_ERROR,
  SIGN_UP_FRIENDLY_ERROR,
  FORGOT_RATE_LIMIT_ERROR,
  RESET_FAILED_ERROR,
} from "@/lib/passwordResetRules";

const SENSITIVE_ERRORS: Array<{ message: string }> = [
  { message: "Invalid login credentials" },
  { message: "User not found" },
  { message: "User already registered" },
  { message: "Email not confirmed" },
  { message: "Email rate limit exceeded" },
  { message: "Token has expired or is invalid" },
  { message: "JWT expired" },
  { message: "Session missing" },
  { message: "Recovery flow failed" },
  { message: "AuthApiError: bad request" },
];

describe("sanitizeAuthError", () => {
  it("returns the signIn-context friendly copy for every sensitive error", () => {
    for (const e of SENSITIVE_ERRORS) {
      expect(sanitizeAuthError("signIn", e)).toBe(SIGN_IN_FRIENDLY_ERROR);
    }
  });
  it("returns the signUp-context friendly copy for every sensitive error", () => {
    for (const e of SENSITIVE_ERRORS) {
      expect(sanitizeAuthError("signUp", e)).toBe(SIGN_UP_FRIENDLY_ERROR);
    }
  });
  it("returns the forgotPassword-context friendly copy for every sensitive error", () => {
    for (const e of SENSITIVE_ERRORS) {
      expect(sanitizeAuthError("forgotPassword", e)).toBe(FORGOT_RATE_LIMIT_ERROR);
    }
  });
  it("returns the resetPassword-context friendly copy for every sensitive error", () => {
    for (const e of SENSITIVE_ERRORS) {
      expect(sanitizeAuthError("resetPassword", e)).toBe(RESET_FAILED_ERROR);
    }
  });
  it("falls back to a generic unknown copy for unrecognized contexts", () => {
    // @ts-expect-error intentional bad input
    expect(sanitizeAuthError("totally-unknown", new Error("Invalid login credentials"))).toBe(
      UNKNOWN_AUTH_ERROR,
    );
    expect(sanitizeAuthError("unknown", new Error("Invalid login credentials"))).toBe(
      UNKNOWN_AUTH_ERROR,
    );
  });
  it("never returns a string containing any forbidden enumeration/leak fragment", () => {
    const contexts = ["signIn", "signUp", "forgotPassword", "resetPassword", "unknown"] as const;
    for (const ctx of contexts) {
      for (const e of SENSITIVE_ERRORS) {
        const out = sanitizeAuthError(ctx, e);
        for (const re of FORBIDDEN_AUTH_ERROR_FRAGMENTS) {
          expect(out).not.toMatch(re);
        }
      }
    }
  });
  it("handles non-Error inputs without throwing", () => {
    expect(sanitizeAuthError("signIn", null)).toBe(SIGN_IN_FRIENDLY_ERROR);
    expect(sanitizeAuthError("signIn", undefined)).toBe(SIGN_IN_FRIENDLY_ERROR);
    expect(sanitizeAuthError("signIn", { foo: "bar" })).toBe(SIGN_IN_FRIENDLY_ERROR);
    expect(sanitizeAuthError("signIn", "raw string")).toBe(SIGN_IN_FRIENDLY_ERROR);
  });
});

describe("Source scan — /auth and /reset-password never render raw auth errors", () => {
  const AUTH = readFileSync(resolve(__dirname, "../pages/Auth.tsx"), "utf8");
  const RESET = readFileSync(resolve(__dirname, "../pages/ResetPassword.tsx"), "utf8");
  const ALL = AUTH + "\n" + RESET;

  it("does not render error.message directly anywhere", () => {
    expect(ALL).not.toMatch(/\{[^}]*\berror\.message\b[^}]*\}/);
    expect(ALL).not.toMatch(/\{[^}]*\berr\.message\b[^}]*\}/);
  });

  it("routes every Supabase error branch through sanitizeAuthError", () => {
    for (const src of [AUTH, RESET]) {
      const sanitizerCalls = (src.match(/sanitizeAuthError\s*\(/g) ?? []).length;
      expect(sanitizerCalls).toBeGreaterThan(0);
    }
  });

  it("does not log password, token, session, recovery, email, or auth payloads", () => {
    expect(ALL).not.toMatch(
      /console\.(log|warn|error|info|debug)\s*\([^)]*\b(password|token|session|recovery|access_token|refresh_token|email|hash|error)\b/i,
    );
  });

  it("does not import the friendly-copy constants directly into pages (forces sanitizer use)", () => {
    expect(AUTH).not.toMatch(/SIGN_IN_FRIENDLY_ERROR/);
    expect(AUTH).not.toMatch(/SIGN_UP_FRIENDLY_ERROR/);
    expect(AUTH).not.toMatch(/FORGOT_RATE_LIMIT_ERROR/);
    expect(RESET).not.toMatch(/RESET_FAILED_ERROR/);
  });
});
