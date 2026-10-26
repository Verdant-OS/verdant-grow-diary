import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({
    data: { ok: true, revision_no: 2 },
    error: null,
  })),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-a" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
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
vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Revision history is still loading.",
  useQuickLogRevisionBadges: () => ({
    badges: new Map(),
    status: "ok",
    isLoading: false,
  }),
}));

import FeedingHistoryPanel from "@/components/FeedingHistoryPanel";
import QuickLogEntryIntegrityControls from "@/components/QuickLogEntryIntegrityControls";

describe("feeding correction volume", () => {
  it("shows the feeding solution volume in the correction dialog and submits a change", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogEntryIntegrityControls
          handle={{ growEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }}
          correctionValues={{ kind: "feeding", doseAmount: 2, volumeMl: 750 }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    const volume = screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement;
    expect(volume.value).toBe("750");
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-wrong_value"));
    fireEvent.change(volume, { target: { value: "900" } });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    const lastCall = mocks.rpc.mock.calls.at(-1) as
      [string, { p_changes?: { volume_ml?: number } }] | undefined;
    expect(lastCall?.[1]?.p_changes).toEqual(expect.objectContaining({ volume_ml: 900 }));
  });

  it("passes the feeding history solution volume into the correction dialog", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FeedingHistoryPanel
          rawEntries={[
            {
              id: "f1",
              grow_id: "g1",
              plant_id: "p1",
              tent_id: "t1",
              entry_at: "2025-05-10T12:00:00.000Z",
              entry_type: "feeding",
              note: "Fed.",
              details: {
                event_type: "feeding",
                origin_grow_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                watering_amount_ml: 750,
                nutrients: [{ name: "Grow A", amount: 2, unit: "ml/L" }],
              },
            },
          ]}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect((screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement).value).toBe(
      "750",
    );
    expect((screen.getByTestId("quicklog-correct-dose-input") as HTMLInputElement).value).toBe("2");
  });
});
