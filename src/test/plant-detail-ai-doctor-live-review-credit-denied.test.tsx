/**
 * Regression: PlantDetailAiDoctorLiveReview restores the Free-only upgrade
 * path at a server-confirmed AI Doctor credit denial. Paid/founder/unknown
 * denials remain plan-neutral and never expose an upgrade CTA.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

const { trackFunnelEvent } = vi.hoisted(() => ({
  trackFunnelEvent: vi.fn(),
}));

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
    functions: { invoke: vi.fn() },
  },
}));

const itemsRef: { current: TimelineMemoryItem[] } = { current: [] };
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: itemsRef.current, isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      displayPlanId: "free",
      effectivePlanId: "free",
      status: "unknown",
      isActive: false,
      capabilities: {},
      degraded: false,
      degradedReason: null,
    },
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";

const strongPlant = {
  id: "p1",
  name: "Alpha",
  strain: "Northern Lights Auto",
  stage: "flower",
  medium: "coco",
  photo: "https://x/y.jpg",
};

function strongTimeline(): TimelineMemoryItem[] {
  const now = Date.now();
  const recent = (ms: number) => new Date(now - ms).toISOString();
  return [
    {
      kind: "diary",
      key: "d-1",
      occurredAt: recent(3 * 3600_000),
      eventType: "watering",
    } as unknown as TimelineMemoryItem,
    {
      kind: "diary",
      key: "d-2",
      occurredAt: recent(6 * 3600_000),
      eventType: "feeding",
    } as unknown as TimelineMemoryItem,
  ];
}

describe("PlantDetailAiDoctorLiveReview — credit_denied branch", () => {
  beforeEach(() => {
    trackFunnelEvent.mockClear();
  });

  function denial(planId: string | null) {
    return {
      data: {
        ok: false,
        reason: "credit_denied",
        credit: {
          ok: false,
          status: "denied",
          reason: "limit_reached",
          scope: planId === "free" ? "per_grow" : "per_month",
          scope_used: 3,
          scope_limit: 3,
          remaining: 0,
          plan_id: planId,
        },
      },
      error: null,
    };
  }

  async function mountAndDeny(planId: string | null) {
    itemsRef.current = strongTimeline();
    const invoke = vi.fn().mockResolvedValue(denial(planId));
    render(<PlantDetailAiDoctorLiveReview plantId="p1" plant={strongPlant} invoke={invoke} />);
    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-credit-denied")).toBeTruthy(),
    );
  }

  it("offers Free growers a return-safe pricing CTA and records the funnel view", async () => {
    await mountAndDeny("free");
    expect(screen.getByTestId("plant-ai-doctor-live-review-credit-denied")).toHaveAttribute(
      "data-kind",
      "upsell",
    );
    expect(
      screen.getByTestId("plant-ai-doctor-live-review-credit-denied-paywall-link"),
    ).toHaveAttribute("href", "/pricing?returnTo=%2Fplants%2Fp1");
    expect(trackFunnelEvent).toHaveBeenCalledWith("paywall_viewed", {
      surface: "ai_doctor_limit",
    });
    // Generic failure pane must NOT render.
    expect(screen.queryByTestId("plant-ai-doctor-live-review-failure")).toBeNull();
  });

  it.each(["pro_monthly", "founder_lifetime", null])(
    "keeps a %s denial plan-neutral with no pricing CTA",
    async (planId) => {
      await mountAndDeny(planId);
      expect(screen.getByTestId("plant-ai-doctor-live-review-credit-denied")).not.toHaveAttribute(
        "data-kind",
        "upsell",
      );
      expect(
        screen.queryByTestId("plant-ai-doctor-live-review-credit-denied-paywall-link"),
      ).toBeNull();
      expect(trackFunnelEvent).not.toHaveBeenCalled();
    },
  );
});
