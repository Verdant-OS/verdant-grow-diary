/**
 * Grower bug report 2026-11-03, item 14 (Option A): soil temp, water content,
 * soil EC, CO2 and PPFD on a Quick Log Note save into
 * p_details.manual_sensor_snapshot through the single quicklog_save_manual path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function manualCall() {
  return rpcMock.mock.calls.find((c) => c[0] === "quicklog_save_manual");
}

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "ev-1" }, error: null });
  clearTemperatureUnitPreference();
});
afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("Quick Log structured readings (item 14)", () => {
  it("saves soil, CO2 and PPFD readings in the manual snapshot, °F soil temp as °C", async () => {
    saveTemperatureUnitPreference("fahrenheit");
    renderSheet();
    fireEvent.change(screen.getByTestId("qlv2-soilTemp"), { target: { value: "68" } });
    fireEvent.change(screen.getByTestId("qlv2-vwcPct"), { target: { value: "42" } });
    fireEvent.change(screen.getByTestId("qlv2-soilEcMsCm"), { target: { value: "1.4" } });
    fireEvent.change(screen.getByTestId("qlv2-co2Ppm"), { target: { value: "800" } });
    fireEvent.change(screen.getByTestId("qlv2-ppfd"), { target: { value: "650" } });
    // A reading alone is content: no note text needed.
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(manualCall()).toBeTruthy());
    const payload = manualCall()![1] as { p_details: Record<string, unknown> };
    expect(payload.p_details.manual_sensor_snapshot).toMatchObject({
      soil_temp_c: 20,
      soil_moisture_pct: 42,
      soil_ec_ms_cm: 1.4,
      co2_ppm: 800,
      ppfd: 650,
      source: "manual",
    });
    expect(payload.p_details.manual_provenance).toBeTruthy();
    expect(rpcMock.mock.calls.filter((c) => c[0] === "quicklog_save_manual")).toHaveLength(1);
  });

  it("blocks Save while a reading is not a number", () => {
    renderSheet();
    fireEvent.change(screen.getByPlaceholderText("What did you observe?"), {
      target: { value: "Checked the pots" },
    });
    fireEvent.change(screen.getByTestId("qlv2-co2Ppm"), { target: { value: "high" } });
    expect(screen.getByTestId("qlv2-co2Ppm-error")).toHaveTextContent("Enter a number");
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Fix the soil and light readings before saving.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(manualCall()).toBeUndefined();
  });

  it("keeps an implausible reading but flags it before save", async () => {
    renderSheet();
    fireEvent.change(screen.getByTestId("qlv2-soilEcMsCm"), { target: { value: "1450" } });
    expect(screen.getByTestId("qlv2-soilEcMsCm-flag")).toHaveTextContent("check value");
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(manualCall()).toBeTruthy());
    const payload = manualCall()![1] as { p_details: Record<string, unknown> };
    expect(payload.p_details.manual_sensor_snapshot).toMatchObject({ soil_ec_ms_cm: 1450 });
  });

  it("sends no snapshot when no structured reading is entered", async () => {
    renderSheet();
    fireEvent.change(screen.getByPlaceholderText("What did you observe?"), {
      target: { value: "Leaves look fine" },
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(manualCall()).toBeTruthy());
    const payload = manualCall()![1] as { p_details?: Record<string, unknown> };
    expect(payload.p_details?.manual_sensor_snapshot).toBeUndefined();
  });
});
