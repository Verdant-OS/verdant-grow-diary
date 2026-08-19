import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
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
import {
  consumePendingOAuthPostAuthRedirect,
  OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY,
} from "@/lib/oauthPostAuthRedirectRules";

const founderRedirectTo =
  "/pricing?plan=pro_annual&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch";
const csvRedirectTo = "/onboarding?intent=csv_history";

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

function renderSignupSearch(search: string) {
  return render(
    <MemoryRouter initialEntries={[search]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/pricing" element={<div data-testid="pricing-return" />} />
        <Route path="/onboarding" element={<div data-testid="onboarding-return" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderSignup(redirectTo = founderRedirectTo) {
  return renderSignupSearch(`/auth?mode=signup&redirectTo=${encodeURIComponent(redirectTo)}`);
}

function renderLandingToAuth() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Link
        to="/auth?mode=signup&utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch"
        data-testid="landing-signup-cta-handoff"
      >
        Create a free account
      </Link>
      <Auth />
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
  it("activates signup and preserves landing attribution after client navigation", async () => {
    const user = userEvent.setup();
    renderLandingToAuth();

    const signupLink = screen.getByTestId("landing-signup-cta-handoff");
    expect(signupLink).toHaveAttribute(
      "href",
      "/auth?mode=signup&utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
    );

    await user.click(signupLink);

    expect(await screen.findByRole("tab", { name: "Create account" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("form", { name: "Create account" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    await waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith("signup_page_view", {
        source: "landing_page",
      }),
    );
  });

  it("keeps the exact landing CTA attribution out of auth.users metadata", async () => {
    renderSignupSearch(
      "/auth?mode=signup&utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
    );

    completeSignupForm();

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ data: { marketing_opt_in: false } }),
      }),
    );
    expect(JSON.stringify(mocks.signUp.mock.calls)).not.toContain("verdant_signup_source");
    expect(
      JSON.parse(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ source: "landing_page" });
  });

  it("queues attribution separately so signup metadata cannot block account creation", async () => {
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
        emailRedirectTo: `${window.location.origin}${founderRedirectTo}`,
        data: { marketing_opt_in: false },
      },
    });
    const pending = window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY);
    expect(pending).not.toBeNull();
    expect(JSON.parse(pending ?? "{}")).toMatchObject({ source: "founder_share" });
    expect(JSON.stringify(mocks.signUp.mock.calls)).not.toContain("verdant_signup_source");
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
  }, 15_000);

  it("carries an explicit marketing opt-in through confirmation-required signup", async () => {
    renderSignup();

    completeSignupForm({ marketingOptIn: true });

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { marketing_opt_in: true },
        }),
      }),
    );
    expect(
      JSON.parse(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ source: "founder_share" });
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
    expect(consumePendingOAuthPostAuthRedirect()).toBe(founderRedirectTo);
    expect(consumePendingOAuthPostAuthRedirect()).toBeNull();
  });

  it("preserves only the fixed CSV onboarding intent across a Google OAuth redirect", async () => {
    renderSignup(csvRedirectTo);

    fireEvent.click(screen.getByTestId("auth-google-signup"));

    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledTimes(1));
    expect(consumePendingOAuthPostAuthRedirect()).toBe(csvRedirectTo);
  });

  it("clears the one-shot OAuth target when Google returns a session without redirecting", async () => {
    mocks.oauth.mockResolvedValue({ error: null, redirected: false });
    renderSignup(csvRedirectTo);

    fireEvent.click(screen.getByTestId("auth-google-signup"));

    expect(await screen.findByTestId("onboarding-return")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
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

  it("clears queued attribution when signup fails", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Database error saving new user" },
    });
    renderSignupSearch(
      "/auth?mode=signup&utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
    );

    completeSignupForm();

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).toBeNull(),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent("Database error saving new user");
  });

  it("clears stale queued attribution before a direct signup", async () => {
    window.sessionStorage.setItem(
      OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY,
      JSON.stringify({ source: "founder_share", capturedAt: Date.now() }),
    );
    renderSignupSearch("/auth?mode=signup");

    completeSignupForm();

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).toBeNull();
  });

  it("preserves a sanitized referral without reintroducing acquisition metadata", async () => {
    renderSignupSearch("/auth?mode=signup&ref=ABCDEF1234");

    completeSignupForm();

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { verdant_ref_code: "abcdef1234", marketing_opt_in: false },
        }),
      }),
    );
    expect(JSON.stringify(mocks.signUp.mock.calls)).not.toContain("verdant_signup_source");
  });
});
