import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
  mocks.signUp.mockResolvedValue({ data: { user: null }, error: null });
});

describe("Auth signup acquisition handoff", () => {
  it("opens signup, preserves paid intent through verification, and emits no PII", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[`/auth?mode=signup&redirectTo=${encodeURIComponent(redirectTo)}`]}
      >
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByRole("tab", { name: "Create account" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await user.type(screen.getByLabelText("Email"), "grower@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery-staple");
    await user.click(screen.getByLabelText(/I agree to the Terms of Service/));
    await user.click(screen.getByRole("button", { name: "Create account" }));

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
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(
      /grower@example|password|correct-horse|token|user_?id/i,
    );
  });
});
