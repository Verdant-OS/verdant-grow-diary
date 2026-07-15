import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mocks.signUp(...args),
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

import Auth from "@/pages/Auth";

const redirectTo =
  "/pricing?plan=pro_annual&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch";

beforeEach(() => {
  mocks.signUp.mockReset();
  mocks.track.mockReset();
  mocks.signUp.mockResolvedValue({
    data: { user: { id: "pending-user" }, session: null },
    error: null,
  });
});

function renderSignup() {
  return render(
    <MemoryRouter
      initialEntries={[`/auth?mode=signup&redirectTo=${encodeURIComponent(redirectTo)}`]}
    >
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/pricing" element={<div data-testid="pricing-return" />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function completeSignupForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "grower@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-horse-battery-staple");
  await user.click(screen.getByLabelText(/I agree to the Terms of Service/));
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

describe("Auth signup acquisition handoff", () => {
  it("opens signup, preserves paid intent through verification, and emits no PII", async () => {
    renderSignup();

    expect(screen.getByRole("tab", { name: "Create account" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await completeSignupForm();

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "grower@example.com",
      password: "correct-horse-battery-staple",
      options: {
        emailRedirectTo: `${window.location.origin}${redirectTo}`,
        data: { verdant_signup_source: "founder_share" },
      },
    });
    expect(mocks.track).toHaveBeenCalledWith("signup_page_view", {
      source: "founder_share",
    });
    expect(mocks.track).toHaveBeenCalledWith("signup_started", {
      source: "founder_share",
    });
    expect(mocks.track).toHaveBeenCalledWith("signup_completed", {
      source: "founder_share",
    });
    expect(mocks.track).toHaveBeenCalledWith("signup_verification_required", {
      source: "founder_share",
    });
    expect(screen.getByRole("status")).toHaveTextContent(/check your inbox/i);
    expect(screen.getByRole("button", { name: "Account created" })).toBeDisabled();
    expect(screen.queryByTestId("pricing-return")).not.toBeInTheDocument();
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(
      /grower@example|password|correct-horse|token|user_?id/i,
    );
  });

  it("continues to the safe return path when signup immediately creates a session", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: { access_token: "test-only" } },
      error: null,
    });
    renderSignup();

    await completeSignupForm();

    expect(await screen.findByTestId("pricing-return")).toBeInTheDocument();
    expect(mocks.track).not.toHaveBeenCalledWith("signup_verification_required", expect.anything());
  });
});
