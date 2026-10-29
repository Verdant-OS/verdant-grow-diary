/**
 * Quick Log Water must not say it is ready, or enable Save, while volume
 * or the manual sensor snapshot is missing or out of range.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  clearTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test" }] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function openWater() {
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
}

beforeEach(() => {
  rpcMock.mockReset();
  clearTemperatureUnitPreference();
});
afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("Quick Log Water save gate", () => {
  it("disables Save and names a negative volume before any click", () => {
    saveTemperatureUnitPreference("fahrenheit");
    openWater();
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "-50" } });
    expect(screen.getByTestId("qlv2-volume-error")).toHaveTextContent(
      "Applied volume must be a positive number of milliliters.",
    );
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Applied volume must be a positive number of milliliters.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("disables Save when volume is empty", () => {
    openWater();
    expect(screen.getByTestId("qlv2-volume-error")).toHaveTextContent(
      "Enter the total water applied before saving.",
    );
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Enter the total water applied before saving.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows each bad snapshot field in the grower's temperature unit", () => {
    saveTemperatureUnitPreference("fahrenheit");
    openWater();
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText(/^Temp /), { target: { value: "999" } });
    fireEvent.change(screen.getByLabelText("RH (%)"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("VPD (kPa)"), { target: { value: "-3" } });
    expect(screen.getByTestId("qlv2-temp-error")).toHaveTextContent(
      "Temperature must be between 14 and 122 °F.",
    );
    expect(screen.getByTestId("qlv2-rh-error")).toHaveTextContent(
      "Humidity must be between 0 and 100%.",
    );
    expect(screen.getByTestId("qlv2-vpd-error")).toHaveTextContent(
      "VPD must be between 0 and 10 kPa.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("qlv2-save-helper").textContent).not.toMatch(/Ready to save/);
  });

  it("keeps Save enabled for a positive volume and in-range Fahrenheit snapshot", () => {
    saveTemperatureUnitPreference("fahrenheit");
    openWater();
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText(/^Temp /), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("RH (%)"), { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText("VPD (kPa)"), { target: { value: "1.2" } });
    expect(screen.queryByTestId("qlv2-temp-error")).toBeNull();
    expect(screen.queryByTestId("qlv2-volume-error")).toBeNull();
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Ready to save when this log matches what happened.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);
  });
});
