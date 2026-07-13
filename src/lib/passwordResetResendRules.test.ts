import { describe, it, expect } from "vitest";
import {
  DEFAULT_RESET_EMAIL_COOLDOWN_MS,
  RESET_RESEND_COOLDOWN_HINT,
  RESET_RESEND_SUCCESS_MESSAGE,
  RESET_RESEND_FAILURE_MESSAGE,
  canResendResetEmail,
  resetEmailCooldownRemainingMs,
  formatResetEmailCooldown,
  buildResetResendLabel,
} from "@/lib/passwordResetResendRules";

describe("passwordResetResendRules", () => {
  describe("constants", () => {
    it("exposes a one-minute default cooldown", () => {
      expect(DEFAULT_RESET_EMAIL_COOLDOWN_MS).toBe(60_000);
    });

    it("exposes non-empty cooldown hint and messages", () => {
      expect(RESET_RESEND_COOLDOWN_HINT.length).toBeGreaterThan(0);
      expect(RESET_RESEND_SUCCESS_MESSAGE.length).toBeGreaterThan(0);
      expect(RESET_RESEND_FAILURE_MESSAGE.length).toBeGreaterThan(0);
    });
  });

  describe("canResendResetEmail", () => {
    it("allows resend when there is no previous attempt", () => {
      expect(canResendResetEmail(Date.now(), null)).toBe(true);
    });

    it("allows resend after the cooldown expires", () => {
      const now = Date.now();
      expect(
        canResendResetEmail(
          now,
          now - DEFAULT_RESET_EMAIL_COOLDOWN_MS,
          DEFAULT_RESET_EMAIL_COOLDOWN_MS,
        ),
      ).toBe(true);
    });

    it("blocks resend inside the cooldown window", () => {
      const now = Date.now();
      expect(
        canResendResetEmail(
          now,
          now - DEFAULT_RESET_EMAIL_COOLDOWN_MS / 2,
          DEFAULT_RESET_EMAIL_COOLDOWN_MS,
        ),
      ).toBe(false);
    });

    it("falls back to the default cooldown when given an invalid value", () => {
      const now = Date.now();
      expect(
        canResendResetEmail(
          now,
          now - DEFAULT_RESET_EMAIL_COOLDOWN_MS / 2,
          -1,
        ),
      ).toBe(false);
    });
  });

  describe("resetEmailCooldownRemainingMs", () => {
    it("returns zero when there is no previous attempt", () => {
      expect(resetEmailCooldownRemainingMs(Date.now(), null)).toBe(0);
    });

    it("returns zero after the cooldown expires", () => {
      const now = Date.now();
      expect(
        resetEmailCooldownRemainingMs(
          now,
          now - DEFAULT_RESET_EMAIL_COOLDOWN_MS,
          DEFAULT_RESET_EMAIL_COOLDOWN_MS,
        ),
      ).toBe(0);
    });

    it("returns the remaining time inside the cooldown window", () => {
      const now = Date.now();
      const elapsed = DEFAULT_RESET_EMAIL_COOLDOWN_MS / 3;
      const remaining = resetEmailCooldownRemainingMs(
        now,
        now - elapsed,
        DEFAULT_RESET_EMAIL_COOLDOWN_MS,
      );
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(DEFAULT_RESET_EMAIL_COOLDOWN_MS - elapsed + 1);
    });
  });

  describe("formatResetEmailCooldown", () => {
    it("formats remaining seconds", () => {
      expect(formatResetEmailCooldown(5_000)).toBe("Resend available in 5s");
    });

    it("rounds partial seconds up", () => {
      expect(formatResetEmailCooldown(5_400)).toBe("Resend available in 6s");
    });

    it("never shows negative seconds", () => {
      expect(formatResetEmailCooldown(-1_000)).toBe("Resend available in 0s");
    });
  });

  describe("buildResetResendLabel", () => {
    it("shows a busy label when busy", () => {
      expect(buildResetResendLabel(true, 0)).toBe("Sending reset email…");
    });

    it("shows the cooldown label when a cooldown is active", () => {
      expect(buildResetResendLabel(false, 7_000)).toBe("Resend available in 7s");
    });

    it("shows the default label when idle and no cooldown", () => {
      expect(buildResetResendLabel(false, 0)).toBe("Resend reset email");
    });
  });
});
