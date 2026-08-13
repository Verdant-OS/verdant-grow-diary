/**
 * PlantDetailAiDoctorLiveReview — credits-used cache invalidation on spend.
 *
 * Regression coverage for a real gap: the Plant Detail credits-remaining
 * teaser reads useAiDoctorGrowCreditsUsed's cached total, which had no way
 * to learn that a successful AI Doctor run just spent a credit. Within one
 * session, "low"/"exhausted" could be silently skipped until an unrelated
 * refetch (focus/remount) happened to occur. A successful run must
 * invalidate that exact cached query so the teaser reflects reality.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import { aiDoctorGrowCreditsUsedQueryKey } from "@/hooks/useAiDoctorGrowCreditsUsed";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { client, invalidateSpy };
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

import PlantDetailAiDoctorLiveReview, {
  AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL,
} from "@/components/PlantDetailAiDoctorLiveReview";

const strongPlant = {
  id: "p1",
  name: "Alpha",
  strain: "Northern Lights Auto",
  stage: "flower",
  medium: "coco",
  photo: "https://x/y.jpg",
};

const snapshotCard = (when: string): ManualSnapshotTimelineCard =>
  ({
    id: "snap-1",
    title: "Manual sensor snapshot",
    capturedAt: when,
    sourceLabel: "Manual",
    source: "manual",
    tentId: "t-1",
    plantId: "p-1",
    isTentLevel: false,
    notes: null,
    readings: [],
    severity: "ok",
    warnings: [],
  }) as unknown as ManualSnapshotTimelineCard;

function strongTimeline(): TimelineMemoryItem[] {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  return [
    {
      kind: "manual_sensor_snapshot",
      key: "snap-1",
      occurredAt: recent(2 * 3600_000),
      card: snapshotCard(recent(2 * 3600_000)),
    },
    {
      kind: "diary",
      key: "d-1",
      occurredAt: recent(3 * 3600_000),
      eventType: "watering",
      hasPhoto: false,
      note: "Watered today",
    },
    {
      kind: "diary",
      key: "d-2",
      occurredAt: recent(6 * 3600_000),
      eventType: "feeding",
      hasPhoto: true,
      note: "Light feed",
    },
  ];
}

const validResult = () => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium",
  evidence: ["Tent temp 29C"],
  missing_information: ["No recent VPD snapshot"],
  possible_causes: ["High tent temperature"],
  immediate_action: "Lower tent temperature toward target range.",
  what_not_to_do: "Avoid increasing nutrient strength right now.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold feed schedule, monitor canopy daily.",
  risk_level: "watch",
});

describe("PlantDetailAiDoctorLiveReview — credits-used cache invalidation", () => {
  beforeEach(() => {
    cleanup();
    itemsRef.current = strongTimeline();
  });

  it("invalidates the grow's credits-used query on a successful run", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const { invalidateSpy } = renderWithClient(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={strongPlant}
        growId="g1"
        invoke={invoke}
      />,
    );
    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-validated-label").textContent).toBe(
        AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL,
      ),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: aiDoctorGrowCreditsUsedQueryKey(undefined, "g1"),
      }),
    );
  });

  it("does not invalidate on failure", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const { invalidateSpy } = renderWithClient(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={strongPlant}
        growId="g1"
        invoke={invoke}
      />,
    );
    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-failure")).toBeTruthy(),
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("does not invalidate when no growId scope is present", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const { invalidateSpy } = renderWithClient(
      <PlantDetailAiDoctorLiveReview plantId="p1" plant={strongPlant} invoke={invoke} />,
    );
    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-validated-label").textContent).toBe(
        AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL,
      ),
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
