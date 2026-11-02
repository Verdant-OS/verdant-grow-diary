/**
 * Water and Feed water-temperature fields block Save inline, in the grower's
 * unit, without the generic sensor-band banner or a °C-first message.
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
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test" }], archivedGrows: [] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const FAHRENHEIT_MESSAGE = "Water temperature must be between 14 and 140 °F.";
const CELSIUS_MESSAGE = "Water temperature must be between -10 and 60 °C.";
const GENERIC_BAND = /outside Verdant's accepted sensor bands/;
const CELSIUS_FIRST = /-10 °C and 60 °C/;

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

function expectNoGenericBanner() {
  expect(screen.queryByText(GENERIC_BAND)).toBeNull();
  expect(screen.queryByText(CELSIUS_FIRST)).toBeNull();
  const banner = screen.queryByTestId("qlv2-error");
  if (banner) {
    expect(banner.textContent ?? "").not.toMatch(GENERIC_BAND);
    expect(banner.textContent ?? "").not.toMatch(CELSIUS_FIRST);
  }
}

beforeEach(() => {
  rpcMock.mockReset();
  clearTemperatureUnitPreference();
});
afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("Quick Log water temperature inline gate", () => {
  it("blocks a 150 °F water-log temperature before save", () => {
    saveTemperatureUnitPreference("fahrenheit");
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Water temperature (°F)"), { target: { value: "150" } });

    expect(screen.getByTestId("qlv2-water-temp-error")).toHaveTextContent(FAHRENHEIT_MESSAGE);
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(FAHRENHEIT_MESSAGE);
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    expectNoGenericBanner();

    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(rpcMock).not.toHaveBeenCalled();
    expectNoGenericBanner();
  });

  it("accepts 14 and 140 °F on the water log and rejects 13.9 and 140.1", () => {
    saveTemperatureUnitPreference("fahrenheit");
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    const input = screen.getByLabelText("Water temperature (°F)");

    fireEvent.change(input, { target: { value: "14" } });
    expect(screen.queryByTestId("qlv2-water-temp-error")).toBeNull();
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(input, { target: { value: "140" } });
    expect(screen.queryByTestId("qlv2-water-temp-error")).toBeNull();

    fireEvent.change(input, { target: { value: "13.9" } });
    expect(screen.getByTestId("qlv2-water-temp-error")).toHaveTextContent(FAHRENHEIT_MESSAGE);
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "140.1" } });
    expect(screen.getByTestId("qlv2-water-temp-error")).toHaveTextContent(FAHRENHEIT_MESSAGE);
  });

  it("uses Celsius copy on the water log when that is the preference", () => {
    saveTemperatureUnitPreference("celsius");
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Water temperature (°C)"), { target: { value: "61" } });
    expect(screen.getByTestId("qlv2-water-temp-error")).toHaveTextContent(CELSIUS_MESSAGE);
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    expectNoGenericBanner();
  });

  it("blocks a 150 °F feed-log water temperature before save", () => {
    saveTemperatureUnitPreference("fahrenheit");
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    fireEvent.change(screen.getByLabelText("Nutrient line"), { target: { value: "veg-week-3" } });
    fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value: "750" } });
    fireEvent.change(screen.getByLabelText("Product 1 name"), { target: { value: "Base" } });
    fireEvent.change(screen.getByLabelText("Water (°F)"), { target: { value: "150" } });

    expect(screen.getByTestId("qlv2-feed-water-temp-error")).toHaveTextContent(FAHRENHEIT_MESSAGE);
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(FAHRENHEIT_MESSAGE);
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    expectNoGenericBanner();

    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(rpcMock).not.toHaveBeenCalled();
    expectNoGenericBanner();
  });

  it("keeps the air snapshot on its Fahrenheit message", () => {
    saveTemperatureUnitPreference("fahrenheit");
    renderSheet();
    fireEvent.change(screen.getByLabelText(/^Temp /), { target: { value: "150" } });
    expect(screen.getByTestId("qlv2-temp-error")).toHaveTextContent(
      "Temperature must be between 14 and 140 °F.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
  });
});
