import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
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

vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({
  default: ({ growId, tentId }: { growId?: string | null; tentId?: string | null }) => (
    <div data-testid="csv-import-writer" data-grow-id={growId ?? ""} data-tent-id={tentId ?? ""} />
  ),
}));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorTrendChart", () => ({ default: () => null }));

function SensorRouteChangeButton({
  to,
  testId = "sensor-route-change",
}: {
  to?: string;
  testId?: string;
}) {
  const navigate = useNavigate();
  if (!to) return null;
  return (
    <button type="button" data-testid={testId} onClick={() => navigate(to)}>
      Change sensor route
    </button>
  );
}

function renderSensors(
  initialEntry = "/sensors",
  routeChangeTarget?: string,
  routeReturnTarget?: string,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SensorRouteChangeButton to={routeChangeTarget} />
        <SensorRouteChangeButton to={routeReturnTarget} testId="sensor-route-return" />
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
  it("selects the authenticated CSV-import tent and focuses the import card without opening it", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    renderSensors(`/sensors?tentId=${TENT_B}#csv-import`);

    const importAnchor = screen.getByTestId("sensors-csv-import-anchor");
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );
    expect(importAnchor).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("keeps the connected activation tent selected when focusing the manual snapshot form", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    renderSensors(`/sensors?tentId=${TENT_B}&tentIntent=required#manual-reading`);

    const manualReadingAnchor = screen.getByTestId("sensors-manual-reading-anchor");
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );
    expect(manualReadingAnchor).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does not retarget a required snapshot handoff when that tent is unavailable", async () => {
    renderSensors(`/sensors?tentId=${TENT_NOT_OWNED}&tentIntent=required#manual-reading`);

    const unavailable = await screen.findByTestId("sensors-required-tent-unavailable");
    expect(unavailable).toHaveTextContent("Verdant did not switch tents");
    expect(screen.queryByTestId("manual-reading-tent-row")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose Tent B" }));

    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );
  });

  it("hides the previous writer when the mounted page receives a new required intent", async () => {
    renderSensors(
      `/sensors?tentId=${TENT_A}`,
      `/sensors?tentId=${TENT_NOT_OWNED}&tentIntent=required#manual-reading`,
    );
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent A"),
    );

    fireEvent.click(screen.getByTestId("sensor-route-change"));

    await screen.findByTestId("sensors-required-tent-unavailable");
    expect(screen.queryByTestId("manual-reading-tent-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("csv-import-writer")).not.toBeInTheDocument();
  });

  it("does not reuse a prior replacement when the exact-target route is opened again", async () => {
    renderSensors(
      `/sensors?tentId=${TENT_A}&tentIntent=required#manual-reading`,
      "/sensors",
      `/sensors?tentId=${TENT_A}&tentIntent=required#manual-reading`,
    );
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent A"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Tent B" }));
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );

    fireEvent.click(screen.getByTestId("sensor-route-change"));
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );

    fireEvent.click(screen.getByTestId("sensor-route-return"));
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent A"),
    );
  });

  it("returns to conscious selection when a required tent disappears on refetch", async () => {
    Object.assign(growTentsQuery, {
      data: [
        { id: TENT_A, name: "Tent A", growId: "grow-1" },
        { id: TENT_NOT_OWNED, name: "Tent C", growId: "grow-1" },
      ],
    });
    const { rerenderSensors } = renderSensors(
      `/sensors?tentId=${TENT_NOT_OWNED}&tentIntent=required#manual-reading`,
    );

    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent C"),
    );

    Object.assign(growTentsQuery, {
      data: [
        { id: TENT_A, name: "Tent A", growId: "grow-1" },
        { id: TENT_B, name: "Tent B", growId: "grow-1" },
      ],
    });
    rerenderSensors();

    const unavailable = await screen.findByTestId("sensors-required-tent-unavailable");
    expect(unavailable).toHaveTextContent("Verdant did not switch tents");
    expect(screen.queryByTestId("manual-reading-tent-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("csv-import-writer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose Tent B" }));
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );
    expect(screen.getByTestId("csv-import-writer")).toHaveAttribute("data-tent-id", TENT_B);
  });

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
