/**
 * Production QA 2026-10-14 (disposable Free account): /sensors rendered the
 * EcoWitt testbench & setup panel (backend URL, ingest endpoint, Mint token,
 * curl/PowerShell copy) to a Free grower. The panel is a live-sensor setup
 * surface, so it is shown only when the grower's entitlement carries the
 * `liveSensors` capability (the same capability the ingest Edge functions
 * and the token mint enforce server-side).
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sensors from "@/pages/Sensors";

const operatorRoleState: {
  status: "loading" | "granted" | "denied" | "unauthenticated" | "error";
} = { status: "denied" };

/** Stable tent list — a fresh `[{...}]` every mock call re-fires Sensors'
 *  tent-route reconciliation effect (depends on `tents` identity) and hangs
 *  the Vitest worker under the MemoryRouter harness. */
const STABLE_GROW_TENTS = [
  { id: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f", name: "Tent 1", growId: "g1" },
] as const;

const sensorPageState = {
  tentId: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
  tentsLoading: false,
  tentsError: false,
  readingsLoading: false,
  readingsError: false,
  calibrationLoading: false,
  calibrationError: false,
  calibrationAvailability: "available" as "available" | "schema_unavailable",
  readings: [] as Array<Record<string, unknown>>,
};

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: operatorRoleState.status,
    granted: operatorRoleState.status === "granted",
    error: operatorRoleState.status === "error" ? "role_check_failed" : null,
  }),
}));

// The Sensors page reads active plants for its stage (BUG-006 follow-up).
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [], isError: false }) }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: sensorPageState.tentsLoading ? [] : STABLE_GROW_TENTS,
    isLoading: sensorPageState.tentsLoading,
    isError: sensorPageState.tentsError,
    isSuccess: !sensorPageState.tentsLoading && !sensorPageState.tentsError,
    refetch: vi.fn(),
  }),
  useGrowSensorReadings: () => ({
    data: sensorPageState.readings,
    isLoading: sensorPageState.readingsLoading,
    isError: sensorPageState.readingsError,
    refetch: vi.fn(),
  }),
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
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: [] }) }));
vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({
    data: [],
    availability: sensorPageState.calibrationAvailability,
    isLoading: sensorPageState.calibrationLoading,
    isError: sensorPageState.calibrationError,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({
  default: () => null,
}));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({
  default: () => <div data-testid="sensors-testbench-panel">EcoWitt testbench &amp; setup</div>,
}));

const entitlementState = { liveSensors: false, loading: false };
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: entitlementState.loading,
    lookupFailed: false,
    entitlement: { capabilities: { liveSensors: entitlementState.liveSensors } },
    refetch: vi.fn(),
  }),
}));

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Sensors page — EcoWitt testbench panel entitlement gate", () => {
  beforeEach(() => {
    operatorRoleState.status = "denied";
    entitlementState.liveSensors = false;
    entitlementState.loading = false;
  });

  it("hides the testbench panel from a grower without the liveSensors capability", () => {
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it("hides the testbench panel while the entitlement is still loading", () => {
    entitlementState.loading = true;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it("shows the testbench panel to a grower whose plan carries liveSensors", () => {
    entitlementState.liveSensors = true;
    renderAt("/sensors");
    expect(screen.getByTestId("sensors-testbench-panel")).toBeInTheDocument();
  });
});
