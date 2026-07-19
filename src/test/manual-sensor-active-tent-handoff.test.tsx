import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sensors from "@/pages/Sensors";

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const TENT_NOT_OWNED = "33333333-3333-4333-8333-333333333333";
const insertReading = vi.hoisted(() => vi.fn());
const growTentsQuery = vi.hoisted(() => ({
  // `vi.hoisted` runs before module constants; each test supplies its rows.
  data: [],
  isLoading: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => growTentsQuery,
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
  useInsertSensorReading: () => ({ mutateAsync: insertReading, isPending: false }),
}));

vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({ default: () => null }));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorTrendChart", () => ({ default: () => null }));

function renderSensors(initialEntry = "/sensors") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(tree());

  return {
    ...rendered,
    rerenderSensors: () => rendered.rerender(tree()),
  };
}

beforeEach(() => {
  insertReading.mockReset().mockResolvedValue(undefined);
  Object.assign(growTentsQuery, {
    data: [
      { id: TENT_A, name: "Tent A", growId: "grow-1" },
      { id: TENT_B, name: "Tent B", growId: "grow-1" },
    ],
    isLoading: false,
    isError: false,
    isSuccess: true,
  });
});

describe("Sensors manual reading target handoff", () => {
  it("selects an authenticated tent requested by the Timeline route intent", async () => {
    renderSensors(`/sensors?tentId=${TENT_B}`);

    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );
  });

  it("preserves a requested tent through a failed tent query and applies it after retry success", async () => {
    Object.assign(growTentsQuery, {
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
    });
    const { rerenderSensors } = renderSensors(`/sensors?tentId=${TENT_B}`);

    expect(screen.queryByTestId("manual-reading-tent-row")).not.toBeInTheDocument();

    Object.assign(growTentsQuery, {
      data: [
        { id: TENT_A, name: "Tent A", growId: "grow-1" },
        { id: TENT_B, name: "Tent B", growId: "grow-1" },
      ],
      isLoading: false,
      isError: false,
      isSuccess: true,
    });
    rerenderSensors();

    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );
  });

  it("falls back to the default authenticated tent when the route intent is not owned", async () => {
    renderSensors(`/sensors?tentId=${TENT_NOT_OWNED}`);

    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent A"),
    );
  });

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

  it("does not let an earlier tent save clear the newly selected tent draft", async () => {
    let releaseSave: (() => void) | undefined;
    const pendingSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    insertReading.mockReturnValueOnce(pendingSave);
    renderSensors();

    const target = screen.getByTestId("manual-reading-tent-row");
    await waitFor(() => expect(target).toHaveTextContent("Saving to: Tent A"));

    const temperature = screen.getByLabelText(/Air temp/i) as HTMLInputElement;
    fireEvent.change(temperature, { target: { value: "75" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(insertReading).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Tent B" }));
    await waitFor(() => expect(target).toHaveTextContent("Saving to: Tent B"));
    fireEvent.change(temperature, { target: { value: "80" } });

    await act(async () => {
      releaseSave?.();
      await pendingSave;
    });

    expect(temperature.value).toBe("80");
    expect(screen.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
  });
});
