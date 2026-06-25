// Password reset pure-rule tests.
import { describe, it, expect } from "vitest";
import {
  validateResetEmail,
  validateNewPassword,
  buildResetRedirectUrl,
  getPasswordRequirementStatus,
  GENERIC_RESET_REQUEST_SUCCESS,
  PASSWORD_REQUIREMENTS_HELPER_COPY,
  SIGN_IN_FRIENDLY_ERROR,
  SIGN_UP_FRIENDLY_ERROR,
  FORGOT_RATE_LIMIT_ERROR,
  RESET_FAILED_ERROR,
  MIN_PASSWORD_LENGTH,
} from "@/lib/passwordResetRules";

describe("validateResetEmail", () => {
  it("rejects empty", () => {
    const r = validateResetEmail("");
    expect(r.ok).toBe(false);
    if ("reason" in r) expect(r.reason).toBe("empty");
  });
  it("rejects invalid", () => {
    expect(validateResetEmail("nope").ok).toBe(false);
    expect(validateResetEmail("a@b").ok).toBe(false);
  });
  it("accepts a valid trimmed email", () => {
    const r = validateResetEmail("  grower@verdant.app  ");
    expect(r.ok).toBe(true);
    if ("email" in r) expect(r.email).toBe("grower@verdant.app");
  });
});

describe("validateNewPassword", () => {
  it("rejects empty", () => {
    expect(validateNewPassword("", "").ok).toBe(false);
  });
  it("rejects too short", () => {
    const short = "ab1".repeat(2); // length 6
    const r = validateNewPassword(short, short);
    expect(r.ok).toBe(false);
    if ("reason" in r) expect(r.reason).toBe("too_short");
  });
  it("rejects when missing a letter", () => {
    const r = validateNewPassword("12345678", "12345678");
    expect(r.ok).toBe(false);
    if ("reason" in r) expect(r.reason).toBe("missing_letter");
  });
  it("rejects when missing a number", () => {
    const r = validateNewPassword("abcdefgh", "abcdefgh");
    expect(r.ok).toBe(false);
    if ("reason" in r) expect(r.reason).toBe("missing_number");
  });
  it("rejects mismatched confirmation", () => {
    const r = validateNewPassword("longenough1", "longenough2");
    expect(r.ok).toBe(false);
    if ("reason" in r) expect(r.reason).toBe("mismatch");
  });
  it("accepts a valid pair with letter + number", () => {
    const r = validateNewPassword("longenough1", "longenough1");
    expect(r.ok).toBe(true);
  });
});

describe("getPasswordRequirementStatus", () => {
  it("reports all unmet for empty input", () => {
    const s = getPasswordRequirementStatus("", "");
    expect(s.allMet).toBe(false);
    expect(s.requirements.every((r) => !r.met)).toBe(true);
    expect(s.requirements.map((r) => r.key)).toEqual([
      "minLength",
      "hasLetter",
      "hasNumber",
      "matchesConfirm",
    ]);
  });
  it("flags missing letter / number individually", () => {
    const a = getPasswordRequirementStatus("12345678", "12345678");
    expect(a.requirements.find((r) => r.key === "hasLetter")?.met).toBe(false);
    expect(a.requirements.find((r) => r.key === "hasNumber")?.met).toBe(true);
    const b = getPasswordRequirementStatus("abcdefgh", "abcdefgh");
    expect(b.requirements.find((r) => r.key === "hasLetter")?.met).toBe(true);
    expect(b.requirements.find((r) => r.key === "hasNumber")?.met).toBe(false);
  });
  it("flags mismatched confirm", () => {
    const s = getPasswordRequirementStatus("abcdefg1", "abcdefg2");
    expect(s.requirements.find((r) => r.key === "matchesConfirm")?.met).toBe(false);
    expect(s.allMet).toBe(false);
  });
  it("returns allMet for a valid password and matching confirm", () => {
    const s = getPasswordRequirementStatus("longenough1", "longenough1");
    expect(s.allMet).toBe(true);
    expect(s.requirements.every((r) => r.met)).toBe(true);
  });
  it("is deterministic for the same inputs", () => {
    const a = getPasswordRequirementStatus("abcdefg1", "abcdefg1");
    const b = getPasswordRequirementStatus("abcdefg1", "abcdefg1");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
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

describe("Friendly, non-enumerating copy", () => {
  it("forgot-password success does not reveal account existence", () => {
    expect(GENERIC_RESET_REQUEST_SUCCESS).toMatch(/if an account exists/i);
    expect(GENERIC_RESET_REQUEST_SUCCESS).not.toMatch(
      /sent to|email sent to|user found|no account found|user does not exist|email not registered/i,
    );
  });
  it("sign-in error is friendly and non-enumerating", () => {
    expect(SIGN_IN_FRIENDLY_ERROR).toMatch(/couldn['’]t sign you in/i);
    expect(SIGN_IN_FRIENDLY_ERROR).not.toMatch(
      /no account|email not registered|user does not exist|email not found/i,
    );
  });
  it("sign-up error is friendly and non-enumerating", () => {
    expect(SIGN_UP_FRIENDLY_ERROR).not.toMatch(/already exists|already registered|in use/i);
  });
  it("forgot-password rate-limit copy is generic", () => {
    expect(FORGOT_RATE_LIMIT_ERROR).toMatch(/try again/i);
    expect(FORGOT_RATE_LIMIT_ERROR).not.toMatch(/no account|email not registered/i);
  });
  it("reset-failure copy frames as expired link, not account existence", () => {
    expect(RESET_FAILED_ERROR).toMatch(/expired|new reset email/i);
    expect(RESET_FAILED_ERROR).not.toMatch(/no account|user does not exist/i);
  });
  it("password helper copy does not claim server-side certainty", () => {
    expect(PASSWORD_REQUIREMENTS_HELPER_COPY).toMatch(/locally/i);
    expect(PASSWORD_REQUIREMENTS_HELPER_COPY).not.toMatch(
      /strong password|secure|server approved|guaranteed|breached/i,
    );
  });
});

