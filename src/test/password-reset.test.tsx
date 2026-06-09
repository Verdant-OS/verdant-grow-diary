// Password reset pure-rule tests.
import { describe, it, expect } from "vitest";
import {
  validateResetEmail,
  validateNewPassword,
  buildResetRedirectUrl,
  GENERIC_RESET_REQUEST_SUCCESS,
  MIN_PASSWORD_LENGTH,
} from "@/lib/passwordResetRules";

describe("validateResetEmail", () => {
  it("rejects empty", () => {
    const r = validateResetEmail("");
    expect(r.ok).toBe(false);
    if ('reason' in r) expect(r.reason).toBe("empty");
  });
  it("rejects invalid", () => {
    expect(validateResetEmail("nope").ok).toBe(false);
    expect(validateResetEmail("a@b").ok).toBe(false);
  });
  it("accepts a valid trimmed email", () => {
    const r = validateResetEmail("  grower@verdant.app  ");
    expect(r.ok).toBe(true);
    if ('email' in r) expect(r.email).toBe("grower@verdant.app");
  });
});

describe("validateNewPassword", () => {
  it("rejects empty", () => {
    expect(validateNewPassword("", "").ok).toBe(false);
  });
  it("rejects too short", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const r = validateNewPassword(short, short);
    expect(r.ok).toBe(false);
    if ('reason' in r) expect(r.reason).toBe("too_short");
  });
  it("rejects mismatched confirmation", () => {
    const r = validateNewPassword("longenough1", "longenough2");
    expect(r.ok).toBe(false);
    if ('reason' in r) expect(r.reason).toBe("mismatch");
  });
  it("accepts a valid pair", () => {
    const r = validateNewPassword("longenough!", "longenough!");
    expect(r.ok).toBe(true);
  });
});

describe("buildResetRedirectUrl", () => {
  it("targets /reset-password on the given origin", () => {
    expect(buildResetRedirectUrl("https://verdantgrowdiary.com")).toBe(
      "https://verdantgrowdiary.com/reset-password",
    );
    expect(buildResetRedirectUrl("https://verdantgrowdiary.com/")).toBe(
      "https://verdantgrowdiary.com/reset-password",
    );
  });
  it("never contains tokens or secrets", () => {
    const url = buildResetRedirectUrl("https://example.com");
    expect(url).not.toMatch(/token|secret|service_role|access_token/i);
  });
});

describe("Generic success copy", () => {
  it("does not reveal whether an account exists", () => {
    expect(GENERIC_RESET_REQUEST_SUCCESS).toMatch(/if an account exists/i);
    expect(GENERIC_RESET_REQUEST_SUCCESS).not.toMatch(/sent to|email sent to|user found/i);
  });
});
