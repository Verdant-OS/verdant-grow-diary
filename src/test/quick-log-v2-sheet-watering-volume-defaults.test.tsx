/**
 * QuickLogV2Sheet — last watering volume prefill integration.
 *
 * Proves: prior plant watering volume prefills Volume (ml); no prior volume
 * leaves the field empty (fail closed); Feed form stays unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));

let mockedWateringRows: unknown[] = [];
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: mockedWateringRows }),
}));

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const renderResult = render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
  return {
    ...renderResult,
    rerenderSheet: () =>
      renderResult.rerender(
        <QueryClientProvider client={client}>
          <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
        </QueryClientProvider>,
      ),
  };
}

beforeEach(() => {
  mockedWateringRows = [];
});

describe("QuickLogV2Sheet — last watering volume prefill", () => {
  it("leaves Volume empty when no prior watering volume exists", () => {
    mockedWateringRows = [];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    expect(screen.queryByTestId("qlv2-watering-volume-defaults-label")).toBeNull();
    expect((screen.getByLabelText("Volume (ml)") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("qlv2-missing-volume-help")).toBeInTheDocument();
  });

  it("prefills Volume from the plant's most recent watering volume", async () => {
    mockedWateringRows = [
      {
        id: "water-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        event_type: "watering",
        entry_at: "2026-06-10T12:00:00.000Z",
        details: {
          event_type: "watering",
          watering_amount_ml: 200,
        },
      },
    ];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-watering-volume-defaults-label")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("qlv2-watering-volume-defaults-label").textContent).toMatch(
      /Prefilled from last watering/,
    );
    expect((screen.getByLabelText("Volume (ml)") as HTMLInputElement).value).toBe("200");
    expect(screen.queryByTestId("qlv2-missing-volume-help")).toBeNull();
  });

  it("does not invent a preset volume when prior waterings lack ml", async () => {
    mockedWateringRows = [
      {
        id: "water-no-ml",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        event_type: "watering",
        entry_at: "2026-06-10T12:00:00.000Z",
        details: { event_type: "watering" },
      },
    ];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    expect((screen.getByLabelText("Volume (ml)") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("qlv2-watering-volume-defaults-label")).toBeNull();
  });

  it("does not erase a grower-typed volume when defaults arrive late", async () => {
    const { rerenderSheet } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "750" } });

    mockedWateringRows = [
      {
        id: "water-late",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        event_type: "watering",
        entry_at: "2026-06-10T12:00:00.000Z",
        details: { event_type: "watering", watering_amount_ml: 200 },
      },
    ];
    rerenderSheet();
    await waitFor(() =>
      expect((screen.getByLabelText("Volume (ml)") as HTMLInputElement).value).toBe("750"),
    );
    expect(screen.queryByTestId("qlv2-watering-volume-defaults-label")).toBeNull();
  });

  it("does not change the Feed form when watering volume defaults exist", async () => {
    mockedWateringRows = [
      {
        id: "water-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        event_type: "watering",
        entry_at: "2026-06-10T12:00:00.000Z",
        details: { event_type: "watering", watering_amount_ml: 200 },
      },
    ];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(screen.queryByTestId("qlv2-feeding-defaults-label")).toBeNull();
    expect((screen.getByLabelText("Nutrient line") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Applied volume (ml)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Product 1 name") as HTMLInputElement).value).toBe("");
  });
});
