/**
 * Tent Detail blocked-state polish: loading, fetch error (retry), not-found.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const refetch = vi.fn().mockResolvedValue({ data: null });

let mockState: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: null,
  isLoading: true,
  isError: false,
};

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowTent: () => ({ ...mockState, refetch }),
    useGrowPlants: () => ({ data: [] }),
  };
});

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));

vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";

function renderAt(id = "t1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/tents/${id}`]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
          <Route path="/tents" element={<div>Tents list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Tent Detail blocked states", () => {
  it("renders an accessible loading state", () => {
    mockState = { data: null, isLoading: true, isError: false };
    renderAt();
    const status = screen.getByTestId("tent-detail-loading");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-label", "Loading tent");
  });

  it("renders an error state with a retry CTA that calls refetch", () => {
    mockState = { data: null, isLoading: false, isError: true };
    refetch.mockClear();
    renderAt();
    expect(screen.getByTestId("tent-detail-error")).toBeInTheDocument();
    expect(screen.getByText(/couldn't load this tent/i)).toBeInTheDocument();
    const retry = screen.getByTestId("tent-detail-error-retry");
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /back to tents/i })).toBeInTheDocument();
  });

  it("renders a not-found state with a back link when tent is missing", () => {
    mockState = { data: null, isLoading: false, isError: false };
    renderAt();
    expect(screen.getByText(/tent not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to tents/i })).toBeInTheDocument();
    expect(screen.getByTestId("tent-detail-data-source-disclosure")).toBeInTheDocument();
  });

  it("never shows the not-found state while loading or erroring", () => {
    mockState = { data: null, isLoading: true, isError: false };
    const { unmount } = renderAt();
    expect(screen.queryByText(/tent not found/i)).not.toBeInTheDocument();
    unmount();
    mockState = { data: null, isLoading: false, isError: true };
    renderAt();
    expect(screen.queryByText(/tent not found/i)).not.toBeInTheDocument();
  });
});
