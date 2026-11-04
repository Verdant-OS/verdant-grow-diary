/**
 * Review fixes on #2820 (Copilot, 2026-11-04) for grower bug item 14:
 *  1. soil temperature keeps the unit it was typed in when the preference changes;
 *  2. structured readings survive closing and reopening an unsaved Note.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("structured readings review fixes (#2820)", () => {
  it("keeps soil temperature in the unit it was typed in when the preference changes", async () => {
    saveTemperatureUnitPreference("celsius");
    renderSheet();
    fireEvent.change(screen.getByTestId("qlv2-soilTemp"), { target: { value: "20" } });
    act(() => saveTemperatureUnitPreference("fahrenheit"));
    expect(screen.getByLabelText(/Soil temp \(°C\)/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(manualCall()).toBeTruthy());
    const payload = manualCall()![1] as { p_details: Record<string, unknown> };
    expect(payload.p_details.manual_sensor_snapshot).toMatchObject({ soil_temp_c: 20 });
  });

  it("restores readings-only drafts, with the soil unit they were typed in, after close and reopen", async () => {
    saveTemperatureUnitPreference("fahrenheit");
    const first = renderSheet();
    fireEvent.change(screen.getByTestId("qlv2-soilTemp"), { target: { value: "68" } });
    fireEvent.change(screen.getByTestId("qlv2-vwcPct"), { target: { value: "42" } });
    first.unmount();

    saveTemperatureUnitPreference("celsius");
    renderSheet();
    await waitFor(() =>
      expect((screen.getByTestId("qlv2-soilTemp") as HTMLInputElement).value).toBe("68"),
    );
    expect((screen.getByTestId("qlv2-vwcPct") as HTMLInputElement).value).toBe("42");
    expect(screen.getByLabelText(/Soil temp \(°F\)/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(manualCall()).toBeTruthy());
    const payload = manualCall()![1] as { p_details: Record<string, unknown> };
    expect(payload.p_details.manual_sensor_snapshot).toMatchObject({
      soil_temp_c: 20,
      soil_moisture_pct: 42,
    });
  });
});
