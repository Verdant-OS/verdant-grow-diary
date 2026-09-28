/**
 * Grow Room mode judges each tent's VPD by the same stage Alerts use.
 *
 * QA 2026-09-24, BUG-006 follow-up: Alerts, the Dashboard, Sensors, Tent
 * Detail and the Tents list resolve a tent's stage from the grow row, the
 * tent and the active plants in it. Grow Room mode still used `tents.stage`
 * alone, so VPD 0.85 kPa with a Flower plant in a tent marked Veg read
 * "In Veg VPD range" there while Tent Detail read "Below Flower VPD range".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const H = vi.hoisted(() => {
  const TENT_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
  const OTHER_TENT_ID = "8d2e3f4a-5b6c-4d7e-9f0a-1b2c3d4e5f6a";
  const state = {
    tentGrowId: "grow-1" as string | null,
    plants: [] as Array<Record<string, unknown>> | undefined,
    plantsIsError: false,
    grows: [{ id: "grow-1", stage: "veg" }] as Array<{ id: string; stage: string }>,
    growsLoading: false,
    growsError: null as string | null,
  };
  return { TENT_ID, OTHER_TENT_ID, state };
});

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: H.TENT_ID, name: "Veg Tent", grow_id: H.state.tentGrowId, stage: "veg" }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: H.state.plants, isLoading: false, isError: H.state.plantsIsError }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: H.state.grows,
    loading: H.state.growsLoading,
    error: H.state.growsError,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: [], isLoading: false, error: null }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({ urlGrowId: null }),
}));
vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
vi.mock("@/components/GrowRoomQuickActionsCard", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const at = new Date(Date.now() - 5 * 60_000).toISOString();
        const rows =
          table === "sensor_readings"
            ? [
                {
                  tent_id: H.TENT_ID,
                  metric: "vpd_kpa",
                  value: 0.85,
                  ts: at,
                  captured_at: at,
                  created_at: at,
                  source: "manual",
                  quality: "ok",
                  raw_payload: null,
                },
              ]
            : [];
        const query: Record<string, unknown> = {};
        query.in = () => query;
        query.order = () => query;
        query.limit = () => {
          const c: Record<string, unknown> = {
            abortSignal: () => c,
            then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
              Promise.resolve({ data: rows, error: null }).then(r, j),
          };
          return c;
        };
        return query;
      },
    }),
  },
}));

import GrowRoomMode from "@/pages/GrowRoomMode";

function plant(stage: string, over: Record<string, unknown> = {}) {
  return {
    id: "plant-1",
    name: "Aurora",
    grow_id: "grow-1",
    tent_id: H.TENT_ID,
    stage,
    is_archived: false,
    created_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

async function vpdHint(): Promise<string> {
  render(
    <MemoryRouter>
      <GrowRoomMode />
    </MemoryRouter>,
  );
  return (await screen.findByTestId("grow-room-vpd-stage-hint")).textContent ?? "";
}

beforeEach(() => {
  H.state.tentGrowId = "grow-1";
  H.state.plants = [];
  H.state.plantsIsError = false;
  H.state.grows = [{ id: "grow-1", stage: "veg" }];
  H.state.growsLoading = false;
  H.state.growsError = null;
});

describe("Grow Room VPD follows the plants in the tent", () => {
  it("QA repro: VPD 0.85 with a Flower plant in a Veg tent is below the Flower range", async () => {
    H.state.plants = [plant("flower")];
    expect(await vpdHint()).toMatch(/Below Flower VPD range/);
  });

  it("a failed plant refresh keeps the cached plant stages", async () => {
    H.state.plants = [plant("flower")];
    H.state.plantsIsError = true;
    expect(await vpdHint()).toMatch(/Below Flower VPD range/);
  });

  it("a Flower plant naming another grow does not move this tent's stage", async () => {
    H.state.plants = [plant("flower", { grow_id: "grow-2" })];
    expect(await vpdHint()).toMatch(/In Veg VPD range/);
  });

  it("a Flower plant in another tent does not move this tent's stage", async () => {
    H.state.plants = [plant("flower", { tent_id: H.OTHER_TENT_ID })];
    expect(await vpdHint()).toMatch(/In Veg VPD range/);
  });

  it("without a plant signal the tent and grow still decide", async () => {
    expect(await vpdHint()).toMatch(/In Veg VPD range/);
  });

  it("the grow row counts: a Veg tent in a Flower grow is judged by Flower", async () => {
    H.state.grows = [{ id: "grow-1", stage: "flower" }];
    expect(await vpdHint()).toMatch(/Below Flower VPD range/);
  });

  it.each([
    ["the first plant read is pending", () => (H.state.plants = undefined)],
    ["the grows list is loading", () => ((H.state.grows = []), (H.state.growsLoading = true))],
    ["the grows list failed", () => ((H.state.grows = []), (H.state.growsError = "network"))],
  ])("never grades by the tent alone while %s", async (_s, arrange) => {
    arrange();
    expect(await vpdHint()).not.toMatch(/In Veg VPD range/);
  });
});
