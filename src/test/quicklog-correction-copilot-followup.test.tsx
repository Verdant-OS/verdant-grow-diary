import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("@/hooks/useQuickLogGroupedTimeline", () => ({
  useQuickLogGroupedTimeline: () => ({
    entries: [
      {
        kind: "action",
        occurredAt: "2026-03-15T09:00:00.000Z",
        actionSourceLabel: "Manual",
        action: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          kind: "water",
          source: "manual",
          plantId: "plant-1",
          tentId: "tent-1",
          occurredAt: "2026-03-15T09:00:00.000Z",
          noteText: null,
          volumeMl: 500,
        },
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import {
  correctionValuePropsFromDiaryDetails,
  correctionValuesForTimelineDiaryEntry,
} from "@/lib/quick-log/quickLogRevisionRules";

describe("Copilot follow-up: editor values", () => {
  it("reads a legacy flat watering amount into the correction dialog", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "watering",
        watering_amount_ml: 400,
      }),
    ).toEqual({ kind: "watering", volumeMl: 400 });
  });

  it("reads sensor values from a real V2 observation whose readings live on the environment row", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(
        {
          plant_id: "plant-a",
          entry_at: "2026-07-25T13:03:28.000Z",
          details: {
            event_type: "observation",
            source: "manual",
            feeding: null,
            watering: null,
            photo_url: null,
            quick_log_version: 2,
            linked_grow_event_id: "bf0a684e-a96e-472c-af8f-e38a54a8332c",
          },
        },
        [
          // #2118 Codex r4326795521: a linked observation resolves its readings
          // through its loaded spine root, never a borrowed same-time sibling.
          {
            id: "bf0a684e-a96e-472c-af8f-e38a54a8332c",
            event_type: "observation",
            source: "manual",
            plant_id: "plant-a",
            occurred_at: "2026-07-25T13:03:28.000Z",
            created_at: "2026-07-25T13:03:28.123456+00:00",
          },
          {
            id: "env-sibling",
            event_type: "environment",
            source: "manual",
            plant_id: "plant-a",
            occurred_at: "2026-07-25T13:03:28.000Z",
            created_at: "2026-07-25T13:03:28.123456+00:00",
            environment_events: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
          },
        ],
      ),
    ).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
    });
  });

  it("shows the stored watering volume in the history correction dialog", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RecentQuickLogActivityPanel
          rawEntries={[
            {
              id: "diary-water",
              entry_at: "2026-03-15T09:00:00.000Z",
              note: "watered",
              details: {
                event_type: "watering",
                origin_grow_event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
                watering: { volume_ml: 500 },
              },
            },
          ]}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect((screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement).value).toBe(
      "500",
    );
  });

  it("shows the stored watering volume in the grouped timeline correction dialog", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogGroupedTimelineSection scope="plant" plantId="plant-1" tentId="tent-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect((screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement).value).toBe(
      "500",
    );
  });
});
