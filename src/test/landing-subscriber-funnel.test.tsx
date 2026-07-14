import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));
vi.mock("@/components/LeadCaptureForm", () => ({
  default: () => <div data-testid="lead-capture-placeholder" />,
}));
vi.mock("@/components/LandingAuthedOnboardingBridge", () => ({
  default: () => null,
}));

import Landing from "@/pages/Landing";

const APP_SHELL = readFileSync(resolve(__dirname, "../components/AppShell.tsx"), "utf8");

beforeEach(() => {
  mocks.track.mockReset();
});

describe("landing subscriber funnel", () => {
  it("puts a paid-plan path in the header, hero, and final CTA", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    for (const testId of [
      "landing-pricing-cta-header",
      "landing-pricing-cta-hero",
      "landing-pricing-cta-final",
    ]) {
      expect(screen.getByTestId(testId)).toHaveAttribute(
        "href",
        "/pricing?utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
      );
    }
    expect(screen.getAllByText("See Pro & Founder plans")).toHaveLength(2);
    for (const testId of ["landing-signup-cta-hero", "landing-signup-cta-final"]) {
      expect(screen.getByTestId(testId)).toHaveAttribute(
        "href",
        "/auth?mode=signup&utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
      );
    }
  });

  it("measures paid-intent and signup clicks without user data", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("landing-pricing-cta-hero"));
    expect(mocks.track).toHaveBeenCalledWith("landing_pricing_cta_clicked", {
      source: "hero",
    });

    await user.click(screen.getByTestId("landing-signup-cta-hero"));
    expect(mocks.track).toHaveBeenCalledWith("landing_signup_cta_clicked", {
      source: "hero",
    });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/email|user_id|token/i);
  });

  it("sends every AppShell auth check to the public landing, never directly to auth", () => {
    expect(APP_SHELL).toMatch(/useRequireAuth\("\/welcome"\)/);
    expect(APP_SHELL).toMatch(/nav\("\/welcome"/);
    expect(APP_SHELL).not.toMatch(/useRequireAuth\("\/auth"\)/);
  });
});
