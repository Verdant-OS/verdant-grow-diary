// Targeted tests for VerificationPendingBanner and the
// isEmailVerificationPending classifier helper.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  isEmailVerificationPending,
  VERIFICATION_PENDING_BANNER_MESSAGE,
} from "@/lib/emailVerificationRules";

const resendMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resend: (a: unknown) => resendMock(a),
    },
  },
}));

import VerificationPendingBanner from "@/components/VerificationPendingBanner";

beforeEach(() => {
  resendMock.mockReset();
});

describe("isEmailVerificationPending", () => {
  it("returns false when user is null/empty", () => {
    expect(isEmailVerificationPending(null)).toBe(false);
    expect(isEmailVerificationPending(undefined)).toBe(false);
    expect(isEmailVerificationPending({})).toBe(false);
  });
  it("returns false when email_confirmed_at is set", () => {
    expect(
      isEmailVerificationPending({ email: "x@a.invalid", email_confirmed_at: "2024-01-01" }),
    ).toBe(false);
  });
  it("returns false when legacy confirmed_at is set", () => {
    expect(isEmailVerificationPending({ email: "x@a.invalid", confirmed_at: "2024-01-01" })).toBe(
      false,
    );
  });
  it("returns false when user_metadata.email_verified is true", () => {
    expect(
      isEmailVerificationPending({
        email: "x@a.invalid",
        user_metadata: { email_verified: true },
      }),
    ).toBe(false);
  });
  it("returns true when user has email but no confirmation timestamp", () => {
    expect(isEmailVerificationPending({ email: "x@a.invalid" })).toBe(true);
  });
});

describe("VerificationPendingBanner", () => {
  it("renders banner copy and resend button", () => {
    render(<VerificationPendingBanner email="x@example.invalid" />);
    expect(screen.getByText(VERIFICATION_PENDING_BANNER_MESSAGE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /resend verification email/i }),
    ).toBeInTheDocument();
  });
  it("calls supabase.auth.resend on click and shows generic success", async () => {
    resendMock.mockResolvedValue({ error: null });
    render(<VerificationPendingBanner email="x@example.invalid" />);
    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    await waitFor(() => expect(resendMock).toHaveBeenCalledTimes(1));
    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "x@example.invalid",
    });
    await screen.findByText(/if that email is eligible/i);
  });
  it("disables resend during cooldown after one attempt", async () => {
    resendMock.mockResolvedValue({ error: null });
    render(<VerificationPendingBanner email="x@example.invalid" />);
    const btn = screen.getByRole("button", { name: /resend verification email/i });
    fireEvent.click(btn);
    await waitFor(() => expect(resendMock).toHaveBeenCalledTimes(1));
    // After resend, the button should now show countdown copy and be disabled.
    await waitFor(() => {
      const post = screen.getByRole("button", { name: /resend available in/i });
      expect(post).toBeDisabled();
    });
  });
  it("shows generic failure copy via role=alert on rejection", async () => {
    resendMock.mockRejectedValue(new Error("nope"));
    render(<VerificationPendingBanner email="x@example.invalid" />);
    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/couldn't send the verification email/i);
  });
});
