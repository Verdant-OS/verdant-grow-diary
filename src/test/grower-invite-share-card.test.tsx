import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import GrowerInviteShareCard from "@/components/GrowerInviteShareCard";
import { buildGrowerInviteShareData } from "@/lib/growerInviteRules";
import { PRICING_ANALYTICS_EVENT, type PricingAnalyticsPayload } from "@/lib/pricingAnalytics";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else delete (navigator as Navigator & { share?: Navigator["share"] }).share;
});

describe("GrowerInviteShareCard", () => {
  it("copies the fixed invite and emits PII-free events", async () => {
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

    render(<GrowerInviteShareCard />);
    fireEvent.click(screen.getByRole("button", { name: "Share Verdant" }));

    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(buildGrowerInviteShareData().url);
    expect(events).toEqual([
      { name: "grower_invite_share_clicked", props: { source: "copy_link" } },
      { name: "grower_invite_share_completed", props: { source: "copy_link" } },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/email|user_?id|token|password/i);
    window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
  });

  it("provides a manual fallback and makes the privacy boundary explicit", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });

    render(<GrowerInviteShareCard />);
    expect(screen.getByLabelText("Grower invite link")).toHaveAttribute("readonly");
    expect(screen.getByTestId("grower-invite-share-card")).toHaveTextContent(
      /no user ID, email, referral reward, entitlement, or reserved Founder spot/i,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share Verdant" }));
    expect(await screen.findByText(/Select and copy the link above/)).toBeInTheDocument();
  });
});
