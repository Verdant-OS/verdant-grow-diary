/**
 * #2172 part 1: after a Feed save, "Log another" reopens on the Feed form, and
 * its recipe prefill comes from the feeding just saved, never the one before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const writeFeedingMock = vi.fn();
vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...a: unknown[]) => writeFeedingMock(...a),
}));

let mockedRows: unknown[] = [];
let mockedUpdatedAt = 0;
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: mockedRows, dataUpdatedAt: mockedUpdatedAt }),
}));

vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const renderResult = render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
  return {
    ...renderResult,
    rerenderSheet: () =>
      renderResult.rerender(
        <QueryClientProvider client={client}>
          <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
        </QueryClientProvider>,
      ),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  writeFeedingMock.mockReset();
  mockedRows = [];
  mockedUpdatedAt = 0;
});

function feeding(id: string, line: string, entryAt: string) {
  return {
    id,
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    event_type: "feeding",
    entry_at: entryAt,
    details: {
      nutrients: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
      nutrient_line_id: line,
    },
  };
}

const lineField = () => screen.getByLabelText("Nutrient line") as HTMLInputElement;

async function saveFeed(line: string) {
  fireEvent.click(screen.getByRole("button", { name: "Feed" }));
  await waitFor(() => expect(lineField().value).toBe("veg-week-3"));
  fireEvent.change(lineField(), { target: { value: line } });
  fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value: "900" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writeFeedingMock).toHaveBeenCalledTimes(1));
  return screen.findByRole("button", { name: /Log another/i });
}

describe("QuickLogV2Sheet — Log another after a Feed save (#2172)", () => {
  it("reopens on the Feed form, prefilled from the feeding just saved", async () => {
    mockedRows = [feeding("feed-1", "veg-week-3", "2026-06-10T12:00:00.000Z")];
    mockedUpdatedAt = 1;
    writeFeedingMock.mockResolvedValue({ ok: true, eventId: "evt-1", reused: false });
    const view = renderSheet();
    const logAnother = await saveFeed("QA seed recipe");

    // The refetch after the save returns the new feeding first.
    mockedRows = [
      feeding("evt-1", "QA seed recipe", "2026-06-11T12:00:00.000Z"),
      feeding("feed-1", "veg-week-3", "2026-06-10T12:00:00.000Z"),
    ];
    mockedUpdatedAt = Date.now() + 60_000;
    fireEvent.click(logAnother);
    view.rerenderSheet();

    await waitFor(() => expect(lineField().value).toBe("QA seed recipe"));
    expect(screen.getByLabelText("Applied volume (ml)")).toHaveValue("");
  });

  it("never prefills the recipe from before the save while the refetch is stale", async () => {
    mockedRows = [feeding("feed-1", "veg-week-3", "2026-06-10T12:00:00.000Z")];
    mockedUpdatedAt = 1;
    writeFeedingMock.mockResolvedValue({ ok: true, eventId: "evt-1", reused: false });
    const view = renderSheet();
    fireEvent.click(await saveFeed("QA seed recipe"));
    view.rerenderSheet();

    // Feed form is shown, but the pre-save recipe is not applied.
    expect(lineField().value).toBe("");
  });
});
