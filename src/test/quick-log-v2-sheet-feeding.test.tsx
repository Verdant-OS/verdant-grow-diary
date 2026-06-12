/**
 * QuickLogV2Sheet — structured feeding integration.
 *
 * Verifies that the Feed action wires through writeFeedingTypedEvent and
 * never touches supabase.rpc / direct table writes from the component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const rpcMock = vi.fn();
const storageRemove = vi.fn().mockResolvedValue({ data: null, error: null });
const storageUpload = vi.fn();
const tableMethods = {
  insert: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: {
      from: () => ({ upload: storageUpload, remove: storageRemove }),
    },
    from: () => tableMethods,
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

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const writeFeedingMock = vi.fn();
vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...a: unknown[]) => writeFeedingMock(...a),
}));

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={onOpenChange}
        defaultTargetKey={defaultTargetKey}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function clickFeed() {
  fireEvent.click(screen.getByRole("button", { name: "Feed" }));
}

function fillRequiredFeedingFields() {
  fireEvent.change(screen.getByLabelText("Nutrient line"), {
    target: { value: "veg-week-3" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 name"), {
    target: { value: "Base A" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 amount"), {
    target: { value: "2" },
  });
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  rpcMock.mockReset();
  storageRemove.mockReset();
  storageUpload.mockReset();
  tableMethods.insert.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  writeFeedingMock.mockReset();
});

describe("QuickLogV2Sheet — structured feeding", () => {
  it("renders the Feed action button", () => {
    renderSheet("plant:plant-1");
    expect(screen.getByRole("button", { name: "Feed" })).toBeInTheDocument();
  });

  it("shows the feeding form only when Feed is selected", () => {
    renderSheet("plant:plant-1");
    expect(screen.queryByTestId("qlv2-feeding-form")).toBeNull();
    clickFeed();
    expect(screen.getByTestId("qlv2-feeding-form")).toBeInTheDocument();
  });

  it("calls writeFeedingTypedEvent exactly once on a valid save", async () => {
    writeFeedingMock.mockResolvedValue({ ok: true, eventId: "evt-1" });
    const { onOpenChange } = renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    clickSave();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Feeding logged."),
    );
    expect(writeFeedingMock).toHaveBeenCalledTimes(1);
    const payload = writeFeedingMock.mock.calls[0][0];
    expect(payload.grow_id).toBe("grow-1");
    expect(payload.tent_id).toBe("tent-1");
    expect(payload.plant_id).toBe("plant-1");
    expect(payload.nutrient_line_id).toBe("veg-week-3");
    expect(payload.products).toEqual([
      { name: "Base A", amount: 2, unit: "ml_per_l" },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(tableMethods.insert).not.toHaveBeenCalled();
  });

  it("maps optional pH/EC/runoff/water-temp fields into the writer payload", async () => {
    writeFeedingMock.mockResolvedValue({ ok: true, eventId: "evt-2" });
    renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    fireEvent.change(screen.getByLabelText("pH"), { target: { value: "6.1" } });
    fireEvent.change(screen.getByLabelText("EC in"), {
      target: { value: "1.6" },
    });
    fireEvent.change(screen.getByLabelText("EC out"), {
      target: { value: "1.9" },
    });
    fireEvent.change(screen.getByLabelText("Runoff (ml)"), {
      target: { value: "250" },
    });
    fireEvent.change(screen.getByLabelText("Runoff pH"), {
      target: { value: "6.4" },
    });
    fireEvent.change(screen.getByLabelText("Runoff EC"), {
      target: { value: "2.1" },
    });
    fireEvent.change(screen.getByLabelText("Water (°C)"), {
      target: { value: "21" },
    });
    clickSave();
    await waitFor(() => expect(writeFeedingMock).toHaveBeenCalledTimes(1));
    const payload = writeFeedingMock.mock.calls[0][0];
    expect(payload.ph).toBe(6.1);
    expect(payload.ec_in).toBe(1.6);
    expect(payload.ec_out).toBe(1.9);
    expect(payload.runoff_ml).toBe(250);
    expect(payload.runoff_ph).toBe(6.4);
    expect(payload.runoff_ec).toBe(2.1);
    expect(payload.water_temp_c).toBe(21);
  });

  it("blocks save when nutrient line is missing", async () => {
    renderSheet("plant:plant-1");
    clickFeed();
    // Skip nutrient line, just fill product.
    fireEvent.change(screen.getByLabelText("Product 1 name"), {
      target: { value: "Base A" },
    });
    clickSave();
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toBeInTheDocument(),
    );
    expect(writeFeedingMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("qlv2-error").textContent).toMatch(/nutrient line/i);
  });

  it("blocks save when no product is provided", async () => {
    renderSheet("plant:plant-1");
    clickFeed();
    fireEvent.change(screen.getByLabelText("Nutrient line"), {
      target: { value: "veg-week-3" },
    });
    clickSave();
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toBeInTheDocument(),
    );
    expect(writeFeedingMock).not.toHaveBeenCalled();
  });

  it("blocks save when an optional metric is non-numeric", async () => {
    renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    fireEvent.change(screen.getByLabelText("pH"), {
      target: { value: "abc" },
    });
    clickSave();
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toBeInTheDocument(),
    );
    expect(writeFeedingMock).not.toHaveBeenCalled();
  });

  it("rejects token-like product payloads before invoking the writer", async () => {
    renderSheet("plant:plant-1");
    clickFeed();
    fireEvent.change(screen.getByLabelText("Nutrient line"), {
      target: { value: "veg-week-3" },
    });
    fireEvent.change(screen.getByLabelText("Product 1 name"), {
      target: { value: "eyJabcdefghij.test" },
    });
    fireEvent.change(screen.getByLabelText("Product 1 amount"), {
      target: { value: "1" },
    });
    clickSave();
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toBeInTheDocument(),
    );
    expect(writeFeedingMock).not.toHaveBeenCalled();
  });

  it("shows failure copy and never closes when the writer fails", async () => {
    writeFeedingMock.mockResolvedValue({ ok: false, reason: "rpc:error" });
    const { onOpenChange } = renderSheet("plant:plant-1");
    clickFeed();
    fillRequiredFeedingFields();
    clickSave();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Could not log feeding. Nothing else was changed.",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(tableMethods.insert).not.toHaveBeenCalled();
  });
});
