/**
 * Codex P2 on #2107: the sensor snapshot gate must reach the Quick Log sheet
 * for every snapshot-bearing action, not only Water. A Note with 500 °F,
 * 150% RH or 11 kPa shows inline errors and keeps Save disabled; Save still
 * goes through the single payload builder / quicklog_save_manual path.
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

function openNote() {
  renderSheet();
}

beforeEach(() => {
  rpcMock.mockReset();
  clearTemperatureUnitPreference();
});
afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("Quick Log sensor snapshot gate on Note", () => {
  it("shows each out-of-range snapshot field inline and disables Save before any click", () => {
    saveTemperatureUnitPreference("fahrenheit");
    openNote();
    fireEvent.change(screen.getByPlaceholderText("What did you observe?"), {
      target: { value: "Leaves look fine" },
    });
    fireEvent.change(screen.getByLabelText(/^Temp /), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("RH (%)"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("VPD (kPa)"), { target: { value: "11" } });
    expect(screen.getByTestId("qlv2-temp-error")).toHaveTextContent(
      "Temperature must be between 14 and 140 °F.",
    );
    expect(screen.getByTestId("qlv2-rh-error")).toHaveTextContent(
      "Humidity must be between 0 and 100%.",
    );
    expect(screen.getByTestId("qlv2-vpd-error")).toHaveTextContent(
      "VPD must be between 0 and 10 kPa.",
    );
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Temperature must be between 14 and 140 °F.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a °F format the save seam cannot convert", () => {
    saveTemperatureUnitPreference("fahrenheit");
    openNote();
    fireEvent.change(screen.getByPlaceholderText("What did you observe?"), {
      target: { value: "Leaves look fine" },
    });
    fireEvent.change(screen.getByLabelText(/^Temp /), { target: { value: "0x10" } });
    expect(screen.getByTestId("qlv2-temp-error")).toHaveTextContent(
      "Temperature must be between 14 and 140 °F.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps Save enabled for an in-range Fahrenheit snapshot", () => {
    saveTemperatureUnitPreference("fahrenheit");
    openNote();
    fireEvent.change(screen.getByPlaceholderText("What did you observe?"), {
      target: { value: "Leaves look fine" },
    });
    fireEvent.change(screen.getByLabelText(/^Temp /), { target: { value: "77" } });
    fireEvent.change(screen.getByLabelText("RH (%)"), { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText("VPD (kPa)"), { target: { value: "1.2" } });
    expect(screen.queryByTestId("qlv2-temp-error")).toBeNull();
    expect(screen.queryByTestId("qlv2-rh-error")).toBeNull();
    expect(screen.queryByTestId("qlv2-vpd-error")).toBeNull();
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Ready to save when this log matches what happened.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);
  });
});
