/**
 * Mount test: PlantDetailAiDoctorLiveReview renders AiCreditLimitNotice
 * (not the generic failure pane) when the adapter returns credit_denied.
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

describe("PlantDetailAiDoctorLiveReview — credit_denied branch", () => {
  it("renders AiCreditLimitNotice instead of generic failure pane", async () => {
    itemsRef.current = strongTimeline();
    const invoke = vi.fn().mockResolvedValue({
      data: {
        ok: false,
        reason: "credit_denied",
        credit: {
          ok: false,
          status: "denied",
          reason: "limit_reached",
          scope: "per_grow",
          scope_used: 3,
          scope_limit: 3,
          remaining: 0,
          plan_id: "free",
        },
      },
      error: null,
    });
    render(
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
    // Generic failure pane must NOT render.
    expect(screen.queryByTestId("plant-ai-doctor-live-review-failure")).toBeNull();
  });
});
