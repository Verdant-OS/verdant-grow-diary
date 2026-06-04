/**
 * Plant Detail blocked-state polish: loading, fetch error (retry), not-found.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const refetch = vi.fn().mockResolvedValue({ data: null });

let mockState: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
} = { data: null, isLoading: true, isError: false };

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlant: () => ({ ...mockState, refetch }),
    useGrowTent: () => ({ data: null }),
    getGrowDataMeta: () => ({}),
  };
});

// Minimal mocks for child component imports — these never render in
// loading/error/not-found branches, but the page module imports them.
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));

import PlantDetail from "@/pages/PlantDetail";

function renderAt(id = "p1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/plants/${id}`]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/plants" element={<div>Plants list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Plant Detail blocked states", () => {
  it("renders an accessible loading state", () => {
    mockState = { data: null, isLoading: true, isError: false };
    renderAt();
    const status = screen.getByTestId("plant-detail-loading");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-label", "Loading plant");
  });

  it("renders an error state with a retry CTA that calls refetch", () => {
    mockState = { data: null, isLoading: false, isError: true };
    refetch.mockClear();
    renderAt();
    expect(screen.getByTestId("plant-detail-error")).toBeInTheDocument();
    expect(screen.getByText(/couldn't load this plant/i)).toBeInTheDocument();
    const retry = screen.getByTestId("plant-detail-error-retry");
    expect(retry).toBeInTheDocument();
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
    // Back link present as a safe escape route.
    expect(screen.getByRole("link", { name: /back to plants/i })).toBeInTheDocument();
  });

  it("renders a not-found state with a back link when plant is missing", () => {
    mockState = { data: null, isLoading: false, isError: false };
    renderAt();
    expect(screen.getByText(/plant not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to plants/i })).toBeInTheDocument();
    // Importantly, no implication of live data: data-source disclosure says no data.
    expect(screen.getByTestId("plant-detail-data-source-disclosure")).toBeInTheDocument();
  });

  it("never shows the not-found state while loading or erroring", () => {
    mockState = { data: null, isLoading: true, isError: false };
    const { unmount } = renderAt();
    expect(screen.queryByText(/plant not found/i)).not.toBeInTheDocument();
    unmount();
    mockState = { data: null, isLoading: false, isError: true };
    renderAt();
    expect(screen.queryByText(/plant not found/i)).not.toBeInTheDocument();
  });
});
