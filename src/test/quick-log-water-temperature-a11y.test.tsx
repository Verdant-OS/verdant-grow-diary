/**
 * Pins the water-temperature input a11y wiring and the °F-first range copy.
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
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";
import { wateringFormReasonToHelper } from "@/lib/quickLogWateringFormViewModel";
import { feedingFormReasonToHelper } from "@/lib/quickLogFeedingFormViewModel";


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

beforeEach(() => {
  rpcMock.mockReset();
  clearTemperatureUnitPreference();
});
afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("Quick Log water temperature input a11y (#2694 B P2-2)", () => {
  it("water log: aria-invalid and aria-describedby point at the error only while invalid", () => {
    saveTemperatureUnitPreference("fahrenheit");
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    const input = screen.getByLabelText("Water temperature (°F)");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");

    fireEvent.change(input, { target: { value: "150" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "qlv2-water-temp-error");
    expect(screen.getByTestId("qlv2-water-temp-error")).toHaveAttribute("id", "qlv2-water-temp-error");

    fireEvent.change(input, { target: { value: "70" } });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("feed log: aria-invalid and aria-describedby point at the error only while invalid", () => {
    saveTemperatureUnitPreference("fahrenheit");
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    fireEvent.change(screen.getByLabelText("Nutrient line"), { target: { value: "veg-week-3" } });
    fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value: "750" } });
    fireEvent.change(screen.getByLabelText("Product 1 name"), { target: { value: "Base" } });
    const input = screen.getByLabelText("Water (°F)");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");

    fireEvent.change(input, { target: { value: "150" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "qlv2-feed-water-temp-error");
    expect(screen.getByTestId("qlv2-feed-water-temp-error")).toHaveAttribute(
      "id",
      "qlv2-feed-water-temp-error",
    );

    fireEvent.change(input, { target: { value: "70" } });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

describe("server-side range messages are °F-first (#2694 FIX REQUEST item 1)", () => {
  it("save-error temperature_out_of_range", () => {
    expect(quickLogReasonToOperatorMessage("temperature_out_of_range")).toBe(
      "Temperature must be between 14 and 140°F (-10 to 60°C).",
    );
  });
  it("watering helper temperature_out_of_range", () => {
    expect(wateringFormReasonToHelper("temperature_out_of_range")).toBe(
      "Temperature must be between 14 and 140 °F (-10 to 60 °C).",
    );
  });
  it("feeding helper water_temp_c:out_of_range", () => {
    expect(feedingFormReasonToHelper("water_temp_c:out_of_range")).toBe(
      "Water temperature must be between 14 °F and 140 °F (-10 to 60 °C).",
    );
  });
});
