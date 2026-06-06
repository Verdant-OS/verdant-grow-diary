/**
 * First-tent gate behavior for ManualSensorReadingCard.
 *
 * - Zero active tents → setup-required empty state, no save button.
 * - Active tents present → normal form, save button visible.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

function renderCard(tents: { id: string; name: string }[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ManualSensorReadingCard tents={tents} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManualSensorReadingCard first-tent gate", () => {
  it("shows setup-required state and blocks submission when no active tent", () => {
    renderCard([]);
    expect(screen.getByTestId("manual-reading-first-tent-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("manual-reading-save")).toBeNull();
    // No fabricated live/demo copy.
    const text = screen.getByTestId("manual-reading-first-tent-setup").textContent ?? "";
    expect(text.toLowerCase()).not.toMatch(/live|demo|fake/);
  });

  it("preserves normal flow when an active tent exists", () => {
    renderCard([{ id: "tent-1", name: "Veg tent" }]);
    expect(screen.queryByTestId("manual-reading-first-tent-setup")).toBeNull();
    expect(screen.getByTestId("manual-reading-save")).toBeInTheDocument();
    expect(screen.getByTestId("manual-reading-tent-select")).toBeInTheDocument();
  });
});
