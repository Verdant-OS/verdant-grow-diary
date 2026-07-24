import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import SubscriberInterestShareCard from "@/components/SubscriberInterestShareCard";
import { buildSubscriberInterestReferralData } from "@/lib/subscriberInterestReferralRules";
import { PRICING_ANALYTICS_EVENT, type PricingAnalyticsPayload } from "@/lib/pricingAnalytics";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else delete (navigator as Navigator & { share?: Navigator["share"] }).share;
});

describe("SubscriberInterestShareCard", () => {
  it("copies the selected-plan URL and emits only allowlisted attribution", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const events: PricingAnalyticsPayload[] = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent<PricingAnalyticsPayload>).detail);
    };
    window.addEventListener(PRICING_ANALYTICS_EVENT, listener);

    render(<SubscriberInterestShareCard planId="pro_annual" />);
    fireEvent.click(screen.getByRole("button", { name: "Share Pro Annual" }));

    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(buildSubscriberInterestReferralData("pro_annual")!.url);
    expect(events).toEqual([
      {
        name: "pricing_interest_share_clicked",
        props: { plan: "pro_annual", source: "copy_link" },
      },
      {
        name: "pricing_interest_share_completed",
        props: { plan: "pro_annual", source: "copy_link" },
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/email|user_?id|token|password/i);
    window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
  });

  it("gives an accessible manual-copy fallback without claiming a reward", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });

    render(<SubscriberInterestShareCard planId="founder_lifetime" />);
    expect(screen.getByLabelText("Paid plan share link")).toHaveAttribute("readonly");
    expect(screen.getByTestId("subscriber-interest-share-card")).toHaveTextContent(
      /no email, personal identifier, referral reward, or reserved spot/i,
    );

    fireEvent.click(screen.getByRole("button", { name: "Share Founder Lifetime" }));
    expect(await screen.findByText(/Select and copy the link above/)).toBeInTheDocument();
  });
});
