/**
 * ActionDetail — the Tent and Plant fields show the record's name, never its
 * raw id. The id stays in the link target only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import ActionDetail from "@/pages/ActionDetail";
import { plantDetailPath, tentDetailPath } from "@/lib/routes";
import {
  ACTION_DETAIL_PLANT_LABEL_FALLBACK,
  ACTION_DETAIL_TENT_LABEL_FALLBACK,
} from "@/constants/actionDetailTargetCopy";

const TENT_ID = "4b036cb8-30cc-48d5-8ad0-07a8ef23c552";
const PLANT_ID = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";

const ROW = {
  id: "aq-1",
  grow_id: "g1",
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  source: "environment_alert",
  action_type: "lower_humidity",
  target_metric: "humidity",
  target_device: null,
  suggested_change: "Review humidity control",
  reason: "Humidity is high.",
  risk_level: "high",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-09-24T10:00:00Z",
  updated_at: "2026-09-24T10:00:00Z",
};

type NameRow = { id: string; name: string; grow_id?: string; is_archived: boolean };
let tentRows: NameRow[] = [];
let plantRows: NameRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: ROW, error: null }),
        then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
          resolve({ data: [ROW], error: null }),
      }),
      in: () => chain,
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: [ROW], error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  const makeNames = (rows: () => NameRow[]) => ({
    select: () => Promise.resolve({ data: rows(), count: rows().length, error: null }),
  });
  const makeGeneric = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => chain,
      in: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return makeActionQueueChain();
        if (table === "tents") return makeNames(() => tentRows);
        if (table === "plants") return makeNames(() => plantRows);
        return makeGeneric();
      },
    },
  };
});

vi.mock("@/store/auth", () => {
  const user = { id: "u1", email: "u@example.com" };
  return { useAuth: () => ({ user }) };
});
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  tentRows = [{ id: TENT_ID, name: "Flower Tent 4x4", grow_id: "g1", is_archived: false }];
  plantRows = [{ id: PLANT_ID, name: "Blue Dream #2", is_archived: false }];
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/actions/aq-1"]}>
      <Routes>
        <Route path="/actions/:actionId" element={<ActionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActionDetail — Tent and Plant fields", () => {
  it("shows the tent and plant names, linked by id", async () => {
    renderDetail();
    const tent = await screen.findByTestId("action-detail-tent-label");
    const plant = await screen.findByTestId("action-detail-plant-label");
    await waitFor(() => {
      expect(tent.querySelector("a")?.textContent).toBe("Flower Tent 4x4");
    });
    expect(plant.querySelector("a")?.textContent).toBe("Blue Dream #2");
    expect(tent.querySelector("a")?.getAttribute("href")).toBe(tentDetailPath(TENT_ID));
    expect(plant.querySelector("a")?.getAttribute("href")).toBe(plantDetailPath(PLANT_ID));
  });

  it("never shows a raw id when the names are not readable", async () => {
    tentRows = [];
    plantRows = [];
    renderDetail();
    const tent = await screen.findByTestId("action-detail-tent-label");
    const plant = await screen.findByTestId("action-detail-plant-label");
    expect(tent.querySelector("a")?.textContent).toBe(ACTION_DETAIL_TENT_LABEL_FALLBACK);
    expect(plant.querySelector("a")?.textContent).toBe(ACTION_DETAIL_PLANT_LABEL_FALLBACK);
    expect(tent.textContent).not.toContain(TENT_ID);
    expect(plant.textContent).not.toContain(PLANT_ID);
    // The id still drives the link.
    expect(tent.querySelector("a")?.getAttribute("href")).toBe(tentDetailPath(TENT_ID));
  });

  it("falls back when a stored name is itself id-shaped", async () => {
    tentRows = [{ id: TENT_ID, name: TENT_ID, grow_id: "g1", is_archived: false }];
    renderDetail();
    const tent = await screen.findByTestId("action-detail-tent-label");
    await screen.findByText("Blue Dream #2");
    expect(tent.querySelector("a")?.textContent).toBe(ACTION_DETAIL_TENT_LABEL_FALLBACK);
  });
});
