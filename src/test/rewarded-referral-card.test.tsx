/**
 * RewardedReferralCard + referralShareRules — the rewarded share surface.
 * Separate from the reward-free /invite card (which is test-fenced against
 * referral rewards); this one lives on Settings.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { buildReferralShareData, loadOwnReferralCode } from "@/lib/referralShareRules";
import type { ReferralCodeClient } from "@/lib/referralShareRules";

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  referralCode: "abc234kmn" as string | null,
  userId: "11111111-1111-4111-8111-111111111111" as string | null,
}));

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mocks.referralCode ? { referral_code: mocks.referralCode } : null,
            error: null,
          }),
        }),
      }),
    }),
  },
}));

import RewardedReferralCard from "@/components/RewardedReferralCard";

beforeEach(() => {
  mocks.track.mockReset();
  mocks.referralCode = "abc234kmn";
  mocks.userId = "11111111-1111-4111-8111-111111111111";
});

describe("buildReferralShareData", () => {
  it("targets /auth?mode=signup&ref=<code> — the exact capture location", () => {
    const data = buildReferralShareData("AbC234kmn", "https://verdantgrowdiary.com");
    expect(data?.url).toBe("https://verdantgrowdiary.com/auth?mode=signup&ref=abc234kmn");
    expect(data?.text).toContain("10 AI Doctor credits");
  });

  it("returns null for a bad code or missing origin", () => {
    expect(buildReferralShareData("bad code!", "https://x.example")).toBeNull();
    expect(buildReferralShareData("abc234kmn", "")).toBeNull();
  });
});

describe("loadOwnReferralCode", () => {
  it("returns null on error / missing user instead of throwing", async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error("x") }) }),
        }),
      }),
    } as unknown as ReferralCodeClient;
    expect(await loadOwnReferralCode(failing, "u1")).toBeNull();
    expect(await loadOwnReferralCode(failing, null)).toBeNull();
  });
});

describe("RewardedReferralCard", () => {
  it("renders the referral link + reward copy and fires the view event", async () => {
    render(<RewardedReferralCard />);
    await waitFor(() => expect(screen.getByTestId("rewarded-referral-card")).toBeTruthy());
    const input = screen.getByLabelText("Your referral link") as HTMLInputElement;
    expect(input.value).toContain("/auth?mode=signup&ref=abc234kmn");
    expect(screen.getByTestId("rewarded-referral-card").textContent).toContain(
      "you get 10 AI Doctor credits and they get 10",
    );
    expect(mocks.track).toHaveBeenCalledWith("referral_card_view");
  });

  it("renders a graceful not-ready state when no code exists yet", async () => {
    mocks.referralCode = null;
    render(<RewardedReferralCard />);
    await waitFor(() => expect(screen.getByTestId("rewarded-referral-absent")).toBeTruthy());
    expect(screen.queryByTestId("rewarded-referral-card")).toBeNull();
    expect(mocks.track).not.toHaveBeenCalledWith("referral_card_view");
  });
});
