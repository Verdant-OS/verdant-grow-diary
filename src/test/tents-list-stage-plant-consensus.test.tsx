/**
 * The Tents list judges each tent's readings by the same stage Alerts use.
 *
 * QA 2026-09-24, BUG-006 follow-up: Alerts, the scoped Dashboard, the Sensors
 * page and Tent Detail resolve a tent's stage from the grow row, the tent and
 * the active plants in it, but the Tents list environment strip still used
 * `tents.stage` alone. With one Flower plant in a tent still marked Veg, a
 * 0.85 kPa VPD showed a healthy chip on the Tents list although Tent Detail
 * reads the same value as "Below Flower VPD range".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const H = vi.hoisted(() => {
  const TENT_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
  const OTHER_TENT_ID = "8d2e3f4a-5b6c-4d7e-9f0a-1b2c3d4e5f6a";
  const capturedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const state = {
    tentGrowId: "grow-1" as string | null,
    plants: [] as Array<Record<string, unknown>> | undefined,
    plantsIsError: false,
    grows: [{ id: "grow-1", stage: "veg" }] as Array<{ id: string; stage: string }>,
    growsLoading: false,
    growsError: null as string | null,
  };
  return { TENT_ID, OTHER_TENT_ID, capturedAt, state };
});

vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowTents: () => ({
    data: [
      {
        id: H.TENT_ID,
        name: "Veg Tent",
        brand: "Gorilla",
        size: "4x4",
        stage: "veg",
        light: { on: true, schedule: "18/6", wattage: 240 },
        alertCount: 0,
        growId: H.state.tentGrowId,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGrowPlants: () => ({
    data: H.state.plants,
    isLoading: false,
    isError: H.state.plantsIsError,
    refetch: vi.fn(),
  }),
  getGrowDataMeta: () => ({ isDemoData: false, dataSource: "supabase", sourceReason: "live" }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: () => ({
    byTent: {
      [H.TENT_ID]: [
        {
          id: "vpd-1",
          tent_id: H.TENT_ID,
          ts: H.capturedAt,
          captured_at: H.capturedAt,
          metric: "vpd_kpa",
          value: 0.85,
          source: "manual",
        },
      ],
    },
    statusByTent: { [H.TENT_ID]: "success" },
    refreshingByTent: { [H.TENT_ID]: false },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useManualSnapshotTimelineCards", () => ({
  useTentManualSnapshotBatch: () => ({ byTent: {}, error: null }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: null,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: H.state.grows,
    loading: H.state.growsLoading,
    error: H.state.growsError,
    refresh: vi.fn(),
  }),
}));
// Dialog/menu/breadcrumbs pull in unrelated reads; the strip stays real.
vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));

import Tents from "@/pages/Tents";

function plant(stage: string, over: Record<string, unknown> = {}) {
  return {
    id: "plant-1",
    name: "Aurora",
    strain: "Test cultivar",
    tentId: H.TENT_ID,
    growId: "grow-1",
    stage,
    isArchived: false,
    ...over,
  };
}

/** The rendered VPD chip's grade: green (ok), amber (warn) or red (bad). */
function vpdChipGrade(): "ok" | "warn" | "bad" {
  const metric = screen.getByTestId(`tents-list-metric-${H.TENT_ID}-vpd`);
  const chip = metric.firstElementChild as HTMLElement;
  expect(chip).toHaveTextContent("0.85");
  if (chip.className.includes("--success")) return "ok";
  if (chip.className.includes("--warning")) return "warn";
  return "bad";
}

function renderTents() {
  return render(
    <MemoryRouter>
      <Tents />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  H.state.tentGrowId = "grow-1";
  H.state.plants = [];
  H.state.plantsIsError = false;
  H.state.grows = [{ id: "grow-1", stage: "veg" }];
  H.state.growsLoading = false;
  H.state.growsError = null;
});

describe("Tents list stage follows the plants in the tent", () => {
  it("QA repro: VPD 0.85 with a Flower plant in a Veg tent is not graded as in range", () => {
    H.state.plants = [plant("flower")];
    renderTents();
    expect(vpdChipGrade()).toBe("warn");
  });

  it("a failed plant refresh keeps the cached plant stages", () => {
    H.state.plants = [plant("flower")];
    H.state.plantsIsError = true;
    renderTents();
    expect(vpdChipGrade()).toBe("warn");
  });

  it("a Flower plant naming another grow does not move this tent's stage", () => {
    H.state.plants = [plant("flower", { growId: "grow-2" })];
    renderTents();
    expect(vpdChipGrade()).toBe("ok");
  });

  it("a Flower plant in another tent does not move this tent's stage", () => {
    H.state.plants = [plant("flower", { tentId: H.OTHER_TENT_ID })];
    renderTents();
    expect(vpdChipGrade()).toBe("ok");
  });

  it.each([
    ["pending", false],
    ["failed with no data", true],
  ])("never grades by the tent and grow alone while the first plant read is %s", (_s, isError) => {
    // Codex review on #1683: with no plant rows yet, a Flower plant may be in
    // this Veg tent, so 0.85 kPa must not be graded as in the Veg range.
    H.state.plants = undefined;
    H.state.plantsIsError = isError;
    renderTents();
    expect(vpdChipGrade()).not.toBe("ok");
  });

  it("without a plant signal the tent and grow still decide", () => {
    renderTents();
    expect(vpdChipGrade()).toBe("ok");
  });

  it("the grow row counts: a Veg tent in a Flower grow is judged by Flower", () => {
    H.state.grows = [{ id: "grow-1", stage: "flower" }];
    renderTents();
    expect(vpdChipGrade()).toBe("warn");
  });

  it.each([
    ["loading", true, null],
    ["failed", false, "network"],
  ])("never grades by the tent alone while the grows list is %s", (_s, loading, error) => {
    H.state.grows = [];
    H.state.growsLoading = loading;
    H.state.growsError = error;
    renderTents();
    expect(vpdChipGrade()).not.toBe("ok");
  });

  it("a tent with no grow has nothing to wait for while the grows list loads", () => {
    H.state.tentGrowId = null;
    H.state.grows = [];
    H.state.growsLoading = true;
    renderTents();
    expect(vpdChipGrade()).toBe("ok");
  });
});
