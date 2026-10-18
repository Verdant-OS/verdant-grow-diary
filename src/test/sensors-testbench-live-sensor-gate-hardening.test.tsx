/**
 * Regression hardening for the Sensors page EcoWitt testbench entitlement gate
 * (see sensors-testbench-live-sensor-gate.test.tsx for the primary behavioral pins).
 *
 * Covers tent-selection prerequisites and the server-gate wiring (rendered
 * behavior, not source text) so a Free grower cannot see mint/token setup
 * surfaces again when entitlement or tent context is incomplete.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sensors from "@/pages/Sensors";

const operatorRoleState: {
  status: "loading" | "granted" | "denied" | "unauthenticated" | "error";
} = { status: "denied" };

const STABLE_GROW_TENTS = [
  { id: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f", name: "Tent 1", growId: "g1" },
] as const;

const sensorPageState = {
  tentsLoading: false,
  tentsEmpty: false,
  tentsError: false,
  readings: [] as Array<Record<string, unknown>>,
  calibrationAvailability: "available" as "available" | "schema_unavailable",
};

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: operatorRoleState.status,
    granted: operatorRoleState.status === "granted",
    error: operatorRoleState.status === "error" ? "role_check_failed" : null,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [], isError: false }) }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: sensorPageState.tentsLoading || sensorPageState.tentsEmpty ? [] : STABLE_GROW_TENTS,
    isLoading: sensorPageState.tentsLoading,
    isError: sensorPageState.tentsError,
    isSuccess: !sensorPageState.tentsLoading && !sensorPageState.tentsError,
    refetch: vi.fn(),
  }),
  useGrowSensorReadings: () => ({
    data: sensorPageState.readings,
    isLoading: false,
    isError: false,
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
    isLoading: false,
    isError: false,
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

const entitlementState = { liveSensors: false };
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { liveSensors: entitlementState.liveSensors } },
    refetch: vi.fn(),
  }),
}));

const serverGate = vi.hoisted(() => ({
  state: "denied" as string,
  calls: [] as Array<[string, Record<string, unknown>]>,
}));
vi.mock("@/hooks/useLiveSensorServerGate", () => ({
  useLiveSensorServerGate: (surface: string, scope: Record<string, unknown> = {}) => {
    serverGate.calls.push([surface, scope]);
    return {
      state: serverGate.state,
      result: null,
      evaluatedTentId: (scope.tentId as string | null | undefined) ?? null,
      recheck: vi.fn(),
    };
  },
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

function resetState() {
  operatorRoleState.status = "denied";
  entitlementState.liveSensors = false;
  serverGate.state = "denied";
  serverGate.calls = [];
  sensorPageState.tentsLoading = false;
  sensorPageState.tentsEmpty = false;
  sensorPageState.tentsError = false;
}

describe("Sensors page — EcoWitt testbench gate hardening", () => {
  beforeEach(resetState);

  it("hides the testbench panel when the server allows but no tent is selected yet", () => {
    serverGate.state = "allowed";
    sensorPageState.tentsEmpty = true;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it("hides the testbench panel when the server allows but grow tents are still loading", () => {
    serverGate.state = "allowed";
    sensorPageState.tentsLoading = true;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it("fails closed on an unrecognised server gate state", () => {
    entitlementState.liveSensors = true;
    serverGate.state = "unexpected";
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });
});

// Codex P2 at 79236e8f: these replace source-text regexes over Sensors.tsx
// with rendered behavior, so a commented-out or duplicated gate cannot pass.
describe("Sensors page — EcoWitt testbench server-gate wiring (behavioral)", () => {
  beforeEach(resetState);

  it("queries the live-sensor server preflight scoped to the active tent", () => {
    renderAt("/sensors");
    expect(serverGate.calls).toContainEqual([
      "live_sensor_stream",
      { tentId: STABLE_GROW_TENTS[0].id },
    ]);
  });

  it("follows the server decision, not the client capability map", () => {
    // Client capability false, server allowed: the server is the authority.
    serverGate.state = "allowed";
    renderAt("/sensors");
    expect(screen.getByTestId("sensors-testbench-panel")).toBeInTheDocument();
  });
});
