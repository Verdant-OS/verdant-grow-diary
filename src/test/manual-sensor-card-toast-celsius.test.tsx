/**
 * Pins the card → preference wiring for the manual snapshot toast (related
 * #2160): a grower whose stored unit is °C sees the saved temperature in °C.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

const TENT = "11111111-1111-4111-8111-111111111111";

describe("manual snapshot toast with a stored °C preference", () => {
  it("shows the saved temperature in °C", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ManualSensorReadingCard tents={[{ id: TENT, name: "Tent A" }]} defaultTentId={TENT} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Manual snapshot saved: 31°C · 40% RH. Source: Manual.",
      ),
    );
  });
});
