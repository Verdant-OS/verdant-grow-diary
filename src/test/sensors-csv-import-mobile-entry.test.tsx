/**
 * VER-332: the #csv-import deep link misses when the tent list resolves
 * before sensor readings, because the hash effect runs against the loading
 * shell and does not retry when #csv-import mounts.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sensors from "@/pages/Sensors";

configure({ asyncUtilTimeout: 1000 });

const TENT_A = "11111111-1111-4111-8111-111111111111";
const GROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const growTentsQuery = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string; growId: string }>,
  isLoading: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
}));

const readingsQuery = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: true,
  isError: false,
  isSuccess: false,
  refetch: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "sensors-csv-entry-owner" }, loading: false, session: null }),
}));

vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [], isError: false }) }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => growTentsQuery,
  useGrowSensorReadings: () => readingsQuery,
}));
vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
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
    availability: "available",
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
vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({
  default: ({ growId, tentId }: { growId?: string | null; tentId?: string | null }) => (
    <button
      type="button"
      data-testid="csv-import-writer"
      data-grow-id={growId ?? ""}
      data-tent-id={tentId ?? ""}
    >
      Import historical data
    </button>
  ),
}));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorTrendChart", () => ({ default: () => null }));
vi.mock("@/hooks/useLiveSensorServerGate", () => ({
  useLiveSensorServerGate: () => ({
    state: "denied",
    result: null,
    evaluatedTentId: null,
    recheck: vi.fn(),
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [],
    loading: false,
    error: null,
    activeGrowId: null,
    activeGrow: null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const scrollIntoView = vi.hoisted(() => vi.fn());

function RouteJump({ to }: { to?: string }) {
  const navigate = useNavigate();
  if (!to) return null;
  return (
    <button type="button" data-testid="sensor-route-jump" onClick={() => navigate(to)}>
      Open import
    </button>
  );
}

function renderSensors(initialEntry: string, jumpTo?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <RouteJump to={jumpTo} />
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(tree());
  return { ...rendered, rerenderSensors: () => rendered.rerender(tree()) };
}

function settleReadings() {
  readingsQuery.isLoading = false;
  readingsQuery.isSuccess = true;
}

beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  growTentsQuery.data = [{ id: TENT_A, name: "Tent A", growId: GROW_A }];
  growTentsQuery.isLoading = false;
  growTentsQuery.isError = false;
  growTentsQuery.isSuccess = true;
  readingsQuery.data = [];
  readingsQuery.isLoading = false;
  readingsQuery.isError = false;
  readingsQuery.isSuccess = true;
});

describe("Sensors CSV import mobile entry and deep link", () => {
  it("scrolls to #csv-import after a fast tent response once readings mount the importer", async () => {
    readingsQuery.isLoading = true;
    readingsQuery.isSuccess = false;
    const view = renderSensors("/sensors#csv-import");

    expect(await screen.findByTestId("sensors-grow-data-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("sensors-csv-import-anchor")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toHaveAttribute("id", "csv-import");

    settleReadings();
    view.rerenderSensors();

    const anchor = await screen.findByTestId("sensors-csv-import-anchor");
    await waitFor(() => expect(anchor).toHaveFocus(), { timeout: 800 });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByTestId("csv-import-writer")).toHaveAttribute("data-tent-id", TENT_A);
    expect(screen.getByTestId("csv-import-writer")).toHaveAttribute("data-grow-id", GROW_A);
    expect(screen.getByTestId("csv-import-writer")).toHaveTextContent("Import historical data");
  });

  it("scrolls to #csv-import when an in-app jump happens while readings are still loading", async () => {
    readingsQuery.isLoading = true;
    readingsQuery.isSuccess = false;
    const view = renderSensors("/sensors", "/sensors#csv-import");

    expect(await screen.findByTestId("sensors-grow-data-loading")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sensor-route-jump"));
    expect(screen.queryByTestId("sensors-csv-import-anchor")).not.toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();

    settleReadings();
    view.rerenderSensors();

    const anchor = await screen.findByTestId("sensors-csv-import-anchor");
    await waitFor(() => expect(anchor).toHaveFocus(), { timeout: 800 });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("puts Import CSV above the importer and focuses that anchor from the keyboard", async () => {
    renderSensors("/sensors");

    const entry = await screen.findByRole("button", { name: "Import CSV" });
    const anchor = screen.getByTestId("sensors-csv-import-anchor");
    expect(entry.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(anchor.className).toMatch(/focus-visible:ring-2/);
    expect(screen.getByTestId("csv-import-writer")).toHaveTextContent("Import historical data");

    entry.focus();
    fireEvent.click(entry);

    await waitFor(() => expect(anchor).toHaveFocus(), { timeout: 800 });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByTestId("csv-import-writer")).toHaveAttribute("data-tent-id", TENT_A);
  });
});
