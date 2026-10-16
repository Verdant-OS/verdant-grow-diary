import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { correctionValuesForTimelineAction } from "@/lib/quick-log/quickLogRevisionRules";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-a" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: { ok: true, revision_no: 1 }, error: null })),
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: [], error: null }),
      };
      return query;
    },
  },
}));
vi.mock("@/components/ManualSnapshotTimelineCard", () => ({
  default: () => null,
}));
vi.mock("@/hooks/useQuickLogGroupedTimeline", () => ({
  useQuickLogGroupedTimeline: () => ({
    entries: [
      {
        kind: "grouped",
        occurredAt: "2026-03-15T09:00:00.000Z",
        actionSourceLabel: "Manual",
        environmentSourceLabel: "Manual",
        environment: { id: "env-1" },
        environmentCard: { readings: [] },
        action: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          kind: "note",
          source: "manual",
          plantId: "plant-1",
          tentId: "tent-1",
          occurredAt: "2026-03-15T09:00:00.000Z",
          noteText: "fed",
          aiDoctorPhase1Evidence: {
            diaryEntryId: "diary-feed",
            entryAt: "2026-03-15T09:00:00.000Z",
            plantId: "plant-1",
            tentId: "tent-1",
            growId: "grow-1",
            details: {
              event_type: "feeding",
              nutrients: [{ name: "grow", amount: 2 }],
            },
          },
        },
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";

describe("grouped feeding correction dose", () => {
  it("reads a stored feeding dose from the grouped action evidence", () => {
    expect(
      correctionValuesForTimelineAction({
        kind: "note",
        aiDoctorPhase1Evidence: {
          details: { event_type: "feeding", nutrients: [{ amount: 2 }] },
        },
      }),
    ).toEqual({ kind: "feeding", doseAmount: 2 });
  });

  it("shows that dose in the grouped timeline correction dialog", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogGroupedTimelineSection scope="plant" plantId="plant-1" tentId="tent-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect((screen.getByTestId("quicklog-correct-dose-input") as HTMLInputElement).value).toBe("2");
  });
});
