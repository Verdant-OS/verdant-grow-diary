import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Sensors from "@/pages/Sensors";

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [
      { id: TENT_A, name: "Tent A", growId: "grow-1" },
      { id: TENT_B, name: "Tent B", growId: "grow-1" },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGrowSensorReadings: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "denied", granted: false, error: null }),
}));

vi.mock("@/hooks/useEcowittIngestAuditProofRows", () => ({
  useEcowittIngestAuditProofRows: () => ({ status: "idle", rows: [] }),
}));

vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({ default: () => null }));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorTrendChart", () => ({ default: () => null }));

function renderSensors() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/sensors"]}>
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Sensors manual reading target handoff", () => {
  it("moves the manual save target when the active tent chip changes", async () => {
    renderSensors();

    const target = screen.getByTestId("manual-reading-tent-row");
    await waitFor(() => expect(target).toHaveTextContent("Saving to: Tent A"));

    fireEvent.click(screen.getByRole("button", { name: "Tent B" }));

    await waitFor(() => expect(target).toHaveTextContent("Saving to: Tent B"));
  });

  it("clears measurements captured for the previous tent when the active tent changes", async () => {
    renderSensors();

    const target = screen.getByTestId("manual-reading-tent-row");
    await waitFor(() => expect(target).toHaveTextContent("Saving to: Tent A"));

    const temperature = screen.getByLabelText(/Air temp/i) as HTMLInputElement;
    fireEvent.change(temperature, { target: { value: "75" } });
    expect(temperature.value).toBe("75");

    fireEvent.click(screen.getByRole("button", { name: "Tent B" }));

    await waitFor(() => expect(target).toHaveTextContent("Saving to: Tent B"));
    expect(temperature.value).toBe("");
  });
});
