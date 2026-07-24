import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import FounderShareCard from "@/components/FounderShareCard";
import { FOUNDER_SHARE_URL, buildFounderShareData } from "@/lib/founderShareRules";
import { PRICING_ANALYTICS_EVENT, type PricingAnalyticsPayload } from "@/lib/pricingAnalytics";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else delete (navigator as Navigator & { share?: Navigator["share"] }).share;
});

describe("Founder share acquisition loop", () => {
  it("uses only fixed campaign attribution with no personal identifier", () => {
    const data = buildFounderShareData();
    const url = new URL(data.url);
    expect(url.origin + url.pathname).toBe("https://verdantgrowdiary.com/founder");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: "founder_share",
      utm_medium: "referral",
      utm_campaign: "founder_launch",
    });
    expect(data.url).not.toMatch(/user|email|token|ref(?:errer)?_?id/i);
  });

  it("copies the share link and emits PII-free acquisition events", async () => {
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

    render(<FounderShareCard />);
    fireEvent.click(screen.getByRole("button", { name: "Share Founder page" }));

    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(FOUNDER_SHARE_URL);
    expect(events).toEqual([
      { name: "founder_share_clicked", props: { source: "copy_link" } },
      { name: "founder_share_completed", props: { source: "copy_link" } },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/email|user_id|token|password/i);
    window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
  });

  it("falls back to a calm manual-copy instruction", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<FounderShareCard />);

    fireEvent.click(screen.getByRole("button", { name: "Share Founder page" }));
    expect(await screen.findByText(/Select and copy the link above/)).toBeInTheDocument();
  });
});
