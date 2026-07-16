import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  track: vi.fn(),
  oauth: vi.fn(),
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
vi.mock("@/integrations/lovable/index", () => ({
  lovable: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mocks.oauth(...args),
    },
  },
}));

import Auth from "@/pages/Auth";
import { OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY } from "@/lib/oauthSignupAcquisitionRules";

const redirectTo =
  "/pricing?plan=pro_annual&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch";

beforeEach(() => {
  mocks.signUp.mockReset();
  mocks.track.mockReset();
  mocks.oauth.mockReset();
  mocks.oauth.mockResolvedValue({ error: null, redirected: true });
  window.sessionStorage.clear();
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

function completeSignupForm({ marketingOptIn = false } = {}) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "grower@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct-horse-battery-staple" },
  });
  fireEvent.click(screen.getByLabelText(/I agree to the Terms of Service/));
  if (marketingOptIn) {
    fireEvent.click(screen.getByLabelText(/Send me occasional product updates/i));
  }
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("Auth signup acquisition handoff", () => {
  it("opens signup, preserves paid intent through verification, and emits no PII", async () => {
    renderSignup();

    expect(screen.getByRole("tab", { name: "Create account" })).toHaveAttribute(
      "data-state",
      "active",
    );
    completeSignupForm();

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "grower@example.com",
      password: "correct-horse-battery-staple",
      options: {
        emailRedirectTo: `${window.location.origin}${redirectTo}`,
        data: { verdant_signup_source: "founder_share", marketing_opt_in: false },
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

  it("carries an explicit marketing opt-in through confirmation-required signup", async () => {
    renderSignup();

    completeSignupForm({ marketingOptIn: true });

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: {
            verdant_signup_source: "founder_share",
            marketing_opt_in: true,
          },
        }),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/check your inbox/i);
  });

  it("retains the fixed signup source across a Google OAuth redirect without PII", async () => {
    renderSignup();

    fireEvent.click(screen.getByTestId("auth-google-signup"));

    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledTimes(1));
    expect(mocks.oauth).toHaveBeenCalledWith("google", {
      redirect_uri: window.location.origin,
    });
    const pending = window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY);
    expect(pending).not.toBeNull();
    expect(JSON.parse(pending ?? "{}")).toMatchObject({ source: "founder_share" });
    expect(pending).not.toMatch(/email|token|user_?id|grower@example/i);
  });

  it("continues to the safe return path when signup immediately creates a session", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: { access_token: "test-only" } },
      error: null,
    });
    renderSignup();

    completeSignupForm();

    expect(await screen.findByTestId("pricing-return")).toBeInTheDocument();
    expect(mocks.track).not.toHaveBeenCalledWith("signup_verification_required", expect.anything());
  });
});
