/**
 * C (PlantDetailAiDoctorLiveReview): optional onReadinessSignal and
 * hidePreStartConfidenceCopy. Spec: docs/specs/ai-doctor-readiness-single-summary.md
 * (R7a, R8). Mock setup mirrors plant-detail-ai-doctor-live-review.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import type { ReactElement } from "react";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import type { ReadinessCSignal } from "@/lib/aiDoctorReadinessSummaryRules";

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      displayPlanId: "free",
      effectivePlanId: "free",
      status: "active",
      isActive: true,
      capabilities: {},
      degraded: false,
      degradedReason: "null_row_free",
      isStaff: false,
      source: "free",
    },
  }),
}));
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

import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const strongPlant = {
  id: "p1",
  name: "Alpha",
  strain: "Northern Lights Auto",
  stage: "flower",
  medium: "coco",
  photo: "https://x/y.jpg",
};

function timeline(): TimelineMemoryItem[] {
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  return [
    {
      kind: "manual_sensor_snapshot",
      key: "snap-1",
      occurredAt: at(2 * 3600_000),
      card: {
        id: "snap-1",
        title: "Manual sensor snapshot",
        capturedAt: at(2 * 3600_000),
        sourceLabel: "Manual",
        source: "manual",
        tentId: "t-1",
        plantId: "p-1",
        isTentLevel: false,
        notes: null,
        readings: [],
        severity: "ok",
        warnings: [],
      } as unknown as ManualSnapshotTimelineCard,
    },
    {
      kind: "diary",
      key: "d-1",
      occurredAt: at(3 * 3600_000),
      eventType: "watering",
      hasPhoto: false,
      note: "Watered today",
    },
    {
      kind: "diary",
      key: "d-2",
      occurredAt: at(6 * 3600_000),
      eventType: "feeding",
      hasPhoto: true,
      note: "Light feed",
    },
  ];
}

const CONFIDENCE_TEST_ID = "plant-ai-doctor-live-review-confidence-copy";

beforeEach(() => {
  cleanup();
  itemsRef.current = timeline();
});

describe("C onReadinessSignal", () => {
  it("reports hold, gate, context readiness, missing codes and a null sensor", async () => {
    const onSignal = vi.fn();
    render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={strongPlant}
        sensorClassificationOverride={null}
        onReadinessSignal={onSignal}
      />,
    );
    await waitFor(() => expect(onSignal).toHaveBeenCalled());
    const last = onSignal.mock.calls.at(-1)![0] as ReadinessCSignal;
    expect(last.hold).toBe("none");
    expect(last.gate).toBe("standard");
    expect(["partial", "strong"]).toContain(last.ctx);
    expect(Array.isArray(last.missing)).toBe(true);
    expect(last.sensor).toBeNull();
  });

  it("reports a blocked gate when context is insufficient", async () => {
    itemsRef.current = [];
    const onSignal = vi.fn();
    render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={null}
        sensorClassificationOverride={null}
        onReadinessSignal={onSignal}
      />,
    );
    await waitFor(() => expect(onSignal).toHaveBeenCalled());
    const last = onSignal.mock.calls.at(-1)![0] as ReadinessCSignal;
    expect(last.ctx).toBe("insufficient");
    expect(last.gate).toBe("blocked");
    expect(last.missing).toContain("plant-profile");
  });
});

describe("C hidePreStartConfidenceCopy", () => {
  it("hides only the pre-start confidence line when set", () => {
    render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={strongPlant}
        sensorClassificationOverride={null}
        hidePreStartConfidenceCopy
      />,
    );
    expect(screen.queryByTestId(CONFIDENCE_TEST_ID)).toBeNull();
  });

  it("keeps the confidence line by default", () => {
    render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={strongPlant}
        sensorClassificationOverride={null}
      />,
    );
    expect(screen.getByTestId(CONFIDENCE_TEST_ID)).toBeTruthy();
  });
});
