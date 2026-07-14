import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import GrowerInvite from "@/pages/GrowerInvite";

beforeEach(() => mocks.track.mockReset());

describe("GrowerInvite page", () => {
  it("renders the referral and account-safety boundaries", () => {
    render(
      <MemoryRouter>
        <GrowerInvite />
      </MemoryRouter>,
    );

    expect(screen.getByText("Invite a grower")).toBeInTheDocument();
    expect(screen.getByText(/opens Verdant Pricing/)).toBeInTheDocument();
    expect(screen.getByText(/never grants access to your grows/)).toBeInTheDocument();
    expect(screen.getByText(/does not promise a reward/)).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith("grower_invite_page_view");
  });
});
