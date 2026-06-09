import { describe, it, expect } from "vitest";
import {
  DEFAULT_VERIFICATION_COOLDOWN_MS,
  VERIFICATION_COOLDOWN_HINT,
  canResendVerification,
  formatVerificationCooldown,
  verificationCooldownRemainingMs,
} from "@/lib/emailVerificationRules";

describe("emailVerificationRules", () => {
  it("allows resend when no previous attempt", () => {
    expect(canResendVerification(1_000, null)).toBe(true);
    expect(verificationCooldownRemainingMs(1_000, null)).toBe(0);
  });
  it("blocks resend during cooldown", () => {
    expect(canResendVerification(1_000, 500, 1_000)).toBe(false);
    expect(verificationCooldownRemainingMs(1_000, 500, 1_000)).toBe(500);
  });
  it("re-enables exactly at the cooldown boundary", () => {
    expect(canResendVerification(2_000, 1_000, 1_000)).toBe(true);
    expect(verificationCooldownRemainingMs(2_000, 1_000, 1_000)).toBe(0);
  });
  it("default cooldown is 60s", () => {
    expect(DEFAULT_VERIFICATION_COOLDOWN_MS).toBe(60_000);
  });
  it("formatVerificationCooldown rounds up to seconds, never negative", () => {
    expect(formatVerificationCooldown(59_500)).toBe("Resend available in 60s");
    expect(formatVerificationCooldown(1)).toBe("Resend available in 1s");
    expect(formatVerificationCooldown(0)).toBe("Resend available in 0s");
    expect(formatVerificationCooldown(-1000)).toBe("Resend available in 0s");
    expect(formatVerificationCooldown(NaN)).toBe("Resend available in 0s");
  });
  it("hint copy avoids claiming server-side certainty", () => {
    expect(VERIFICATION_COOLDOWN_HINT).toMatch(/for safety|wait a moment/i);
    expect(VERIFICATION_COOLDOWN_HINT).not.toMatch(/blocked|locked|server/i);
  });
  it("tolerates non-finite inputs (fails open: allows resend)", () => {
    expect(canResendVerification(NaN, 100)).toBe(true);
    expect(canResendVerification(100, Infinity)).toBe(true);
    expect(canResendVerification(100, "x" as unknown as number)).toBe(true);
  });
});
