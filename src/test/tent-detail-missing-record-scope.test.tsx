/**
 * A missing tent is one record. The disclosure must not say the account
 * has no tents.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowTent: () => ({
      data: null,
      isLoading: false,
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      refetch: vi.fn(),
    }),
    useGrowPlants: () => ({ data: [] }),
  };
});

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));

vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";

function renderMissingTent() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tents/missing-tent"]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Tent Detail missing record scope", () => {
  it("describes a missing tent as one unavailable record", () => {
    renderMissingTent();
    const disclosure = screen.getByTestId("tent-detail-data-source-disclosure");
    expect(disclosure).toHaveAttribute("data-empty-reason", "unavailable");
    expect(screen.getByTestId("tent-detail-data-source-disclosure-badge")).toHaveAttribute(
      "data-label",
      "Unavailable",
    );
    expect(screen.getByRole("heading", { name: "This tent isn't available" })).toBeVisible();
    expect(
      screen.getByText("No data is shown for it. Your other tents are not affected."),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "No real tents yet" })).not.toBeInTheDocument();
    expect(screen.getByText("Tent not found")).toBeVisible();
  });
});
