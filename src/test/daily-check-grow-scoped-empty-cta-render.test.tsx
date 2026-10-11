/**
 * Daily Check empty-state CTA render pins — grow-scoped navigation.
 *
 * Follow-up to GDP-GROW-SCOPED-CTA-GROWID-001 (#1595): empty and choose
 * helper links must retain ?growId= when grow context is already resolved,
 * matching Dashboard/Timeline continue CTAs.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "4cad3cae-1111-4000-8000-000000000001";
const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";

const H = vi.hoisted(() => ({
  urlGrowId: null as string | null,
  activeGrowId: null as string | null,
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: H.urlGrowId,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: !!H.urlGrowId,
    backHref: undefined,
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ activeGrowId: H.activeGrowId }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: H.tents, isLoading: false }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: H.plants, isLoading: false }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));

vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => null,
}));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => null,
}));
vi.mock("@/components/QuickLog", () => ({
  default: () => null,
}));

import DailyCheck from "@/pages/DailyCheck";

function hrefForTestId(testId: string): string | null {
  const node = screen.getByTestId(testId);
  const anchor = node.tagName === "A" ? node : node.querySelector("a");
  return anchor?.getAttribute("href") ?? null;
}

function renderDailyCheck(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Daily Check grow-scoped empty CTA render", () => {
  beforeEach(() => {
    H.urlGrowId = null;
    H.activeGrowId = null;
    H.plants = [];
    H.tents = [];
  });

  it("carries growId on no-tents empty state when ?growId= is present", () => {
    H.urlGrowId = GROW;
    H.tents = [];
    H.plants = [
      {
        id: "p1",
        name: "Plant",
        grow_id: GROW,
        tent_id: TENT,
        stage: "veg",
        is_archived: false,
      },
    ];

    renderDailyCheck(`/daily-check?growId=${GROW}`);

    expect(screen.getByTestId("daily-grow-check-empty-no-tents-actions")).toBeInTheDocument();
    expect(hrefForTestId("daily-grow-check-add-tent")).toBe(`/tents?growId=${GROW}`);
    expect(hrefForTestId("daily-grow-check-empty-no-tents-go-plants")).toBe(
      `/plants?growId=${GROW}`,
    );
    expect(hrefForTestId("daily-grow-check-empty-no-tents-open-timeline")).toBe(
      `/timeline?growId=${GROW}`,
    );
  });

  it("carries growId on no-plants empty state when ?growId= is present", () => {
    H.urlGrowId = GROW;
    H.tents = [{ id: TENT, name: "Tent", grow_id: GROW }];
    H.plants = [];

    renderDailyCheck(`/daily-check?growId=${GROW}`);

    expect(screen.getByTestId("daily-grow-check-empty-no-plants-actions")).toBeInTheDocument();
    expect(hrefForTestId("daily-grow-check-add-plant")).toBe(`/plants?growId=${GROW}`);
    expect(hrefForTestId("daily-grow-check-empty-no-plants-go-tents")).toBe(
      `/tents?growId=${GROW}`,
    );
    expect(hrefForTestId("daily-grow-check-empty-no-plants-open-sensors")).toBe(
      `/sensors?growId=${GROW}`,
    );
  });

  it("keeps bare paths on no-plants empty state without grow context", () => {
    H.tents = [{ id: TENT, name: "Tent", grow_id: GROW }];
    H.plants = [];

    renderDailyCheck("/daily-check");

    expect(hrefForTestId("daily-grow-check-add-plant")).toBe("/plants");
    expect(hrefForTestId("daily-grow-check-empty-no-plants-go-tents")).toBe("/tents");
    expect(hrefForTestId("daily-grow-check-empty-no-plants-open-sensors")).toBe("/sensors");
  });

  it("carries growId on choose-section helper links when grow scope is active", () => {
    H.urlGrowId = GROW;
    H.tents = [{ id: TENT, name: "Tent", grow_id: GROW }];
    H.plants = [
      {
        id: "p1",
        name: "Plant",
        grow_id: GROW,
        tent_id: TENT,
        stage: "veg",
        is_archived: false,
      },
      {
        id: "p2",
        name: "Second plant",
        grow_id: GROW,
        tent_id: TENT,
        stage: "veg",
        is_archived: false,
      },
    ];

    renderDailyCheck(`/daily-check?growId=${GROW}`);

    expect(screen.getByTestId("daily-grow-check-choose-no-plant")).toBeInTheDocument();
    expect(hrefForTestId("daily-grow-check-choose-no-plant-go-plants")).toBe(
      `/plants?growId=${GROW}`,
    );
    expect(hrefForTestId("daily-grow-check-choose-no-plant-open-timeline")).toBe(
      `/timeline?growId=${GROW}`,
    );
  });
});
