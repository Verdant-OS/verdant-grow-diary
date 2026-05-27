/**
 * AUD-007 — Shelly H&T setup card must never sit indefinitely on
 * "Checking setup…". These tests cover the pure view-state resolver and
 * the rendered card across loading / slow / error / missing / ready
 * states (including the retry affordance).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  deriveShellyHtSetupCardViewState,
  SHELLY_HT_SETUP_SLOW_THRESHOLD_MS,
} from "@/lib/shellyHtSetupCardViewStateRules";

describe("AUD-007 deriveShellyHtSetupCardViewState", () => {
  it("returns loading while pending and not yet slow", () => {
    const v = deriveShellyHtSetupCardViewState({
      isPending: true,
      isError: false,
      hasData: false,
      isSlow: false,
    });
    expect(v.state).toBe("loading");
    expect(v.showRetry).toBe(false);
  });

  it("flips to slow once the slow threshold is reached, with a retry", () => {
    const v = deriveShellyHtSetupCardViewState({
      isPending: true,
      isError: false,
      hasData: false,
      isSlow: true,
    });
    expect(v.state).toBe("slow");
    expect(v.showRetry).toBe(true);
    expect(v.message.toLowerCase()).toContain("taking longer");
  });

  it("returns error with retry when the query errored", () => {
    const v = deriveShellyHtSetupCardViewState({
      isPending: false,
      isError: true,
      hasData: false,
      isSlow: false,
    });
    expect(v.state).toBe("error");
    expect(v.showRetry).toBe(true);
  });

  it("returns missing with retry when the query resolved without payload", () => {
    const v = deriveShellyHtSetupCardViewState({
      isPending: false,
      isError: false,
      hasData: false,
      isSlow: false,
    });
    expect(v.state).toBe("missing");
    expect(v.showRetry).toBe(true);
  });

  it("returns ready when payload is present", () => {
    const v = deriveShellyHtSetupCardViewState({
      isPending: false,
      isError: false,
      hasData: true,
      isSlow: false,
    });
    expect(v.state).toBe("ready");
    expect(v.showRetry).toBe(false);
  });

  it("prefers error over pending if both flags are set", () => {
    const v = deriveShellyHtSetupCardViewState({
      isPending: true,
      isError: true,
      hasData: false,
      isSlow: false,
    });
    expect(v.state).toBe("error");
  });

  it("slow threshold is a non-trivial duration to avoid spurious flips", () => {
    expect(SHELLY_HT_SETUP_SLOW_THRESHOLD_MS).toBeGreaterThanOrEqual(2000);
  });
});

// --- Render tests -----------------------------------------------------------

interface MockStatusShape {
  data?: unknown;
  isPending?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  refetch?: () => void;
}

let mockStatus: MockStatusShape = {};
const refetchSpy = vi.fn();

vi.mock("@/hooks/useShellyHtSetupStatus", () => ({
  useShellyHtSetupStatus: () => mockStatus,
}));

import ShellyHtSetupCard from "@/components/ShellyHtSetupCard";

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ShellyHtSetupCard rows={[]} />
    </QueryClientProvider>,
  );
}

describe("AUD-007 ShellyHtSetupCard render", () => {
  beforeEach(() => {
    refetchSpy.mockReset();
    mockStatus = {};
  });

  it("renders an error block with a retry button when the status query errors", () => {
    mockStatus = {
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: refetchSpy,
    };
    renderCard();
    expect(screen.getByTestId("shelly-ht-setup-error")).toBeTruthy();
    const btn = screen.getByTestId("shelly-ht-setup-retry") as HTMLButtonElement;
    btn.click();
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renders a missing-data block with retry when the query resolved with no payload", () => {
    mockStatus = {
      data: undefined,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: refetchSpy,
    };
    renderCard();
    expect(screen.getByTestId("shelly-ht-setup-missing")).toBeTruthy();
    expect(screen.getByTestId("shelly-ht-setup-retry")).toBeTruthy();
  });

  it("renders the loading state only while pending", () => {
    mockStatus = {
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
      refetch: refetchSpy,
    };
    renderCard();
    expect(screen.getByTestId("shelly-ht-setup-loading")).toBeTruthy();
    // No retry button while we're still inside the normal loading window.
    expect(screen.queryByTestId("shelly-ht-setup-retry")).toBeNull();
  });

  it("renders the configured/ready content when payload is present", () => {
    mockStatus = {
      data: {
        configured: false,
        tentAssignedToCaller: false,
        tentId: null,
        tentName: null,
        tokenMask: null,
        webhookUrl: "https://example.supabase.co/functions/v1/shelly-ht-webhook",
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: refetchSpy,
    };
    renderCard();
    expect(screen.queryByTestId("shelly-ht-setup-loading")).toBeNull();
    expect(screen.queryByTestId("shelly-ht-setup-error")).toBeNull();
    expect(screen.queryByTestId("shelly-ht-setup-missing")).toBeNull();
    expect(screen.getByTestId("shelly-ht-setup-headline")).toBeTruthy();
  });
});
