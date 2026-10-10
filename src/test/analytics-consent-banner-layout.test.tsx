/**
 * Layout offset for the analytics consent banner.
 *
 * Proves the banner reserves its measured height while the decision is
 * unset, and clears that reservation once the banner unmounts. Consent
 * storage and the analytics loader are not exercised here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { analyticsConsentBannerOffsetValue } from "@/lib/analyticsConsentBannerLayout";

const state = vi.hoisted(() => ({
  decision: "unset" as "unset" | "granted" | "denied",
  hydrated: true,
  accept: vi.fn(),
  decline: vi.fn(),
}));

vi.mock("@/hooks/useAnalyticsConsent", () => ({
  useAnalyticsConsent: () => ({
    decision: state.decision,
    hydrated: state.hydrated,
    accept: state.accept,
    decline: state.decline,
  }),
}));

import { AnalyticsConsentBanner } from "@/components/AnalyticsConsentBanner";

const OFFSET = "--analytics-consent-banner-offset";
const BANNER_SOURCE = readFileSync(
  resolve(__dirname, "../components/AnalyticsConsentBanner.tsx"),
  "utf8",
);

function stubBannerHeight(height: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 390,
        bottom: height,
        width: 390,
        height,
        toJSON() {
          return {};
        },
      }) as DOMRect,
  );
}

beforeEach(() => {
  state.decision = "unset";
  state.hydrated = true;
  state.accept.mockClear();
  state.decline.mockClear();
  document.documentElement.style.removeProperty(OFFSET);
  vi.restoreAllMocks();
});

describe("analyticsConsentBannerOffsetValue", () => {
  it("rounds a positive height up to a css pixel length", () => {
    expect(analyticsConsentBannerOffsetValue(118.2)).toBe("119px");
    expect(analyticsConsentBannerOffsetValue(93)).toBe("93px");
  });

  it("returns null for empty or non-finite heights", () => {
    expect(analyticsConsentBannerOffsetValue(0)).toBeNull();
    expect(analyticsConsentBannerOffsetValue(-4)).toBeNull();
    expect(analyticsConsentBannerOffsetValue(Number.NaN)).toBeNull();
    expect(analyticsConsentBannerOffsetValue(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("AnalyticsConsentBanner layout", () => {
  it("keeps the consent copy and does not import the analytics loader", () => {
    expect(BANNER_SOURCE).toContain(
      "We use Google Analytics to understand which parts of Verdant growers actually use.",
    );
    expect(BANNER_SOURCE).not.toMatch(/googleAnalyticsLoader|loadGoogleAnalytics/);
  });

  it("publishes the measured height and keeps both actions labelled", () => {
    stubBannerHeight(118.2);
    render(<AnalyticsConsentBanner />);

    expect(screen.getByRole("dialog", { name: "Analytics consent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept analytics" })).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue(OFFSET)).toBe("119px");

    fireEvent.click(screen.getByTestId("analytics-consent-decline"));
    fireEvent.click(screen.getByTestId("analytics-consent-accept"));
    expect(state.decline).toHaveBeenCalledTimes(1);
    expect(state.accept).toHaveBeenCalledTimes(1);
  });

  it("removes the offset when the banner is not shown", () => {
    stubBannerHeight(93);
    const view = render(<AnalyticsConsentBanner />);
    expect(document.documentElement.style.getPropertyValue(OFFSET)).toBe("93px");

    state.decision = "granted";
    view.rerender(<AnalyticsConsentBanner />);
    expect(screen.queryByTestId("analytics-consent-banner")).toBeNull();
    expect(document.documentElement.style.getPropertyValue(OFFSET)).toBe("");
  });

  it("does not render or reserve space before hydration", () => {
    stubBannerHeight(93);
    state.hydrated = false;
    render(<AnalyticsConsentBanner />);
    expect(screen.queryByTestId("analytics-consent-banner")).toBeNull();
    expect(document.documentElement.style.getPropertyValue(OFFSET)).toBe("");
  });
});
