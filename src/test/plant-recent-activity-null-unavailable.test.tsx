import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activityRead = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/quick-log/retractionFilterCompat", () => ({
  selectWithRetractionCompat: vi.fn(async () => activityRead.result),
}));

import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";
import { fetchPlantRecentActivityRows } from "@/hooks/usePlantRecentActivity";

function renderGuidance() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlantDetailWhatsMissing plantId="plant-1" growId="grow-1" stage="veg" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("plant recent activity null response", () => {
  beforeEach(() => {
    activityRead.result = { data: null, error: null };
  });

  it("treats a successful null payload as unavailable at the guidance boundary", async () => {
    renderGuidance();

    await waitFor(() => {
      expect(screen.getByTestId("plant-detail-whats-missing-unavailable")).toBeInTheDocument();
    });
    expect(screen.queryByText("No timeline entries yet")).not.toBeInTheDocument();
    await expect(fetchPlantRecentActivityRows("plant-1")).rejects.toThrow(/unavailable/i);
  });

  it("preserves a true empty array as successful empty history", async () => {
    activityRead.result = { data: [], error: null };
    await expect(fetchPlantRecentActivityRows("plant-1")).resolves.toEqual([]);

    renderGuidance();

    await waitFor(() => {
      expect(screen.getByText("No timeline entries yet")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("plant-detail-whats-missing-unavailable")).not.toBeInTheDocument();
  });
});
