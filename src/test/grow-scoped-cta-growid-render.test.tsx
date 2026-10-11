/**
 * GDP-GROW-SCOPED-CTA-GROWID-001 — presenter render pins.
 *
 * Source scans can pass while the rendered Start Check href regresses.
 * These tests assert resolved Link targets in the DOM.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    isError: false,
    isLoading: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [],
    isError: false,
    isLoading: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [] }),
}));

import DailyGrowCheckStatusCard from "@/components/DailyGrowCheckStatusCard";

const GROW = "4cad3cae-1111-4000-8000-000000000001";

describe("grow-scoped Start Check CTA render", () => {
  it("carries growId on Start Check when grow scope is provided", () => {
    render(
      <MemoryRouter>
        <DailyGrowCheckStatusCard growId={GROW} />
      </MemoryRouter>,
    );

    const cta = screen.getByTestId("daily-grow-check-status-cta");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe(`/daily-check?growId=${GROW}`);
  });

  it("keeps global /daily-check when grow scope is absent", () => {
    render(
      <MemoryRouter>
        <DailyGrowCheckStatusCard />
      </MemoryRouter>,
    );

    const cta = screen.getByTestId("daily-grow-check-status-cta");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/daily-check");
  });
});
