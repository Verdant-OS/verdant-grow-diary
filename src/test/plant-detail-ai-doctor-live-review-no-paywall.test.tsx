/**
 * Regression: AI Doctor must NOT render the /pricing paywall CTA when the
 * server returns credit_denied. The credit-denied branch renders a plain,
 * plan-neutral notice only — no PaywallCta, no /pricing link, no "See plans"
 * button, regardless of the server's plan_id tag (including "free").
 */
import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

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

function buildDenial(planId: string | null) {
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
  const invoke = vi.fn().mockResolvedValue(buildDenial(planId));
  const { container } = render(
    <PlantDetailAiDoctorLiveReview
      plantId="p1"
      plant={strongPlant}
      invoke={invoke}
    />,
  );
  fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
  await waitFor(() =>
    expect(
      screen.getByTestId("plant-ai-doctor-live-review-credit-denied"),
    ).toBeTruthy(),
  );
  return container;
}

function assertNoPaywall(container: HTMLElement) {
  // No PaywallCta-shaped testids.
  expect(container.querySelector('[data-testid*="paywall"]')).toBeNull();
  // No "upsell"-tagged credit notice.
  expect(container.querySelector('[data-kind="upsell"]')).toBeNull();
  // No anchors pointing at /pricing.
  const pricingLinks = Array.from(container.querySelectorAll("a")).filter(
    (a) => (a.getAttribute("href") ?? "").includes("/pricing"),
  );
  expect(pricingLinks).toHaveLength(0);
  // No upsell button copy.
  expect(screen.queryByRole("button", { name: /see plans/i })).toBeNull();
  expect(screen.queryByText(/see plans/i)).toBeNull();
  expect(screen.queryByText(/upgrade/i)).toBeNull();
}

describe("PlantDetailAiDoctorLiveReview — no paywall on credit_denied (regression)", () => {
  it("does not render /pricing CTA when server tags plan_id='free'", async () => {
    const container = await mountAndDeny("free");
    assertNoPaywall(container);
  });

  it("does not render /pricing CTA when server tags plan_id='pro_monthly'", async () => {
    const container = await mountAndDeny("pro_monthly");
    assertNoPaywall(container);
  });

  it("does not render /pricing CTA when server omits plan_id", async () => {
    const container = await mountAndDeny(null);
    assertNoPaywall(container);
  });
});
