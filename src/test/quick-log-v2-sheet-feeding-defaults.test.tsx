/**
 * QuickLogV2Sheet — Last Feeding Defaults prefill integration.
 *
 * Verifies that when the Feed action is selected and recent feedings exist,
 * the form prefills with safe defaults and shows the "Prefilled from last
 * feeding" label. When no defaults exist, the form stays blank and the
 * label is not shown. Save payload always reflects current form values.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ],
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

const writeFeedingMock = vi.fn();
vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...a: unknown[]) => writeFeedingMock(...a),
}));

let mockedRows: unknown[] = [];
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: mockedRows }),
}));

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={vi.fn()}
        defaultTargetKey="plant:plant-1"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  writeFeedingMock.mockReset();
  mockedRows = [];
});

describe("QuickLogV2Sheet — Last Feeding Defaults", () => {
  it("renders no defaults label when no recent feedings exist", () => {
    mockedRows = [];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(screen.queryByTestId("qlv2-feeding-defaults-label")).toBeNull();
    expect(screen.queryByTestId("qlv2-feeding-review-defaults-flag")).toBeNull();
    expect((screen.getByLabelText("Nutrient line") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Product 1 name") as HTMLInputElement).value).toBe("");
  });

  it("prefills line + product fields and shows the defaults label", async () => {
    mockedRows = [
      {
        id: "feed-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        event_type: "feeding",
        entry_at: "2026-06-10T12:00:00.000Z",
        details: {
          nutrients: [{ name: "Base A", amount: 2.5, unit: "ml_per_l" }],
          nutrient_line_id: "veg-week-3",
        },
      },
    ];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-feeding-defaults-label")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("qlv2-feeding-defaults-label").textContent).toMatch(
      /Prefilled from last feeding/,
    );
    expect((screen.getByLabelText("Nutrient line") as HTMLInputElement).value).toBe("veg-week-3");
    expect((screen.getByLabelText("Product 1 name") as HTMLInputElement).value).toBe("Base A");
    expect((screen.getByLabelText("Product 1 amount") as HTMLInputElement).value).toBe("2.5");

    // Review section should show the defaults-applied flag and the populated preview.
    expect(
      screen.getByTestId("qlv2-feeding-review-defaults-flag"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-feeding-review-defaults-flag").textContent).toMatch(
      /Includes prefilled feeding defaults/,
    );
    expect(
      screen.queryByTestId("qlv2-feeding-review-needs-input"),
    ).toBeNull();
    const review = screen.getByTestId("qlv2-feeding-review");
    expect(review.textContent).toMatch(/veg-week-3/);
    expect(review.textContent).toMatch(/Base A/);
  });

  it("does NOT prefill measured outcome fields (pH/EC/runoff/water temp)", async () => {
    mockedRows = [
      {
        id: "feed-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        event_type: "feeding",
        entry_at: "2026-06-10T12:00:00.000Z",
        details: {
          nutrients: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
          nutrient_line_id: "veg-week-3",
          ph: 6.1,
          ec: 1.6,
          runoff_ph: 6.4,
          runoff_ec: 2.1,
          runoff_ml: 250,
        },
      },
    ];
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-feeding-defaults-label")).toBeInTheDocument(),
    );
    // Expand the optional metrics group so the inputs are mounted/visible.
    expect((screen.getByLabelText("pH") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("EC in") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("EC out") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Runoff (ml)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Runoff pH") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Runoff EC") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Water (°C)") as HTMLInputElement).value).toBe("");
  });

  it("save payload uses current form values, not stale hidden defaults", async () => {
    mockedRows = [
      {
        id: "feed-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        event_type: "feeding",
        entry_at: "2026-06-10T12:00:00.000Z",
        details: {
          nutrients: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
          nutrient_line_id: "veg-week-3",
        },
      },
    ];
    writeFeedingMock.mockResolvedValue({ ok: true, eventId: "evt-1" });
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Nutrient line") as HTMLInputElement).value).toBe(
        "veg-week-3",
      ),
    );
    // User edits the prefilled values before saving.
    fireEvent.change(screen.getByLabelText("Nutrient line"), {
      target: { value: "flower-week-1" },
    });
    fireEvent.change(screen.getByLabelText("Product 1 amount"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writeFeedingMock).toHaveBeenCalledTimes(1));
    const payload = writeFeedingMock.mock.calls[0][0];
    expect(payload.nutrient_line_id).toBe("flower-week-1");
    expect(payload.products).toEqual([
      { name: "Base A", amount: 3, unit: "ml_per_l" },
    ]);
  });
});
