/**
 * Tents list card subtitle: a blank brand or size is left out, so the card
 * never shows a dangling " · " or an empty line. Uses the same
 * formatTentHeaderDescription helper as the Tent Detail header.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const H = vi.hoisted(() => {
  const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
  const makeTent = (brand: string | null, size: string | null) => ({
    id: TENT_ID,
    name: "Subtitle Tent",
    brand,
    size,
    stage: "veg",
    light: { on: true, schedule: "18/6", wattage: 240 },
    alertCount: 0,
    growId: null,
  });
  return { TENT_ID, makeTent, state: { tents: [makeTent("Gorilla", "4x4")] } };
});

vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "idle", snapshot: null }),
  useLatestSensorSnapshotsByTent: () => ({}),
}));
vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowTents: () => ({
      data: H.state.tents,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGrowPlants: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
    getGrowDataMeta: () => ({ isDemoData: false, dataSource: "supabase", sourceReason: "live" }),
  };
});
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => ({
    byTent: Object.fromEntries(tentIds.map((id) => [id, []])),
    statusByTent: Object.fromEntries(tentIds.map((id) => [id, "success"])),
    refreshingByTent: Object.fromEntries(tentIds.map((id) => [id, false])),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useManualSnapshotTimelineCards", () => ({
  useManualSnapshotTimelineCards: () => ({
    cards: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useTentManualSnapshotBatch: (_ownerId: string | null, tentIds: string[]) => ({
    byTent: Object.fromEntries(
      tentIds.map((id) => [id, { cards: [], status: "success", unavailableReason: null }]),
    ),
    error: null,
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: null,
  }),
}));
vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));

import Tents from "@/pages/Tents";

function subtitle(): string | null {
  const heading = screen.getByRole("heading", { name: "Subtitle Tent" });
  const p = heading.parentElement?.querySelector("p");
  return p ? p.textContent : null;
}

describe("Tents list card subtitle", () => {
  afterEach(() => {
    H.state.tents = [H.makeTent("Gorilla", "4x4")];
  });

  it.each([
    ["Gorilla", "4x4", "Gorilla · 4x4"],
    ["Gorilla", "", "Gorilla"],
    [null, "4x4", "4x4"],
    ["  ", null, null],
  ])("brand %j, size %j → %j", (brand, size, expected) => {
    H.state.tents = [H.makeTent(brand, size)];
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    expect(subtitle()).toBe(expected);
  });
});
