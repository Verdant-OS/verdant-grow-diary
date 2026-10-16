/**
 * Regression hardening for the Sensors page EcoWitt testbench entitlement gate
 * (see sensors-testbench-live-sensor-gate.test.tsx for the primary behavioral pins).
 *
 * Covers tent-selection prerequisites and static wiring so a Free grower cannot
 * see mint/token setup surfaces again when entitlement or tent context is incomplete.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sensors from "@/pages/Sensors";

const SENSORS_PAGE = readFileSync(resolve(process.cwd(), "src/pages/Sensors.tsx"), "utf8");

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

const entitlementState = { liveSensors: false, loading: false, entitlementNull: false };
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: entitlementState.loading,
    lookupFailed: entitlementState.entitlementNull,
    entitlement: entitlementState.entitlementNull
      ? null
      : { capabilities: { liveSensors: entitlementState.liveSensors } },
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

describe("Sensors page — EcoWitt testbench gate hardening", () => {
  beforeEach(() => {
    operatorRoleState.status = "denied";
    entitlementState.liveSensors = false;
    entitlementState.loading = false;
    entitlementState.entitlementNull = false;
    sensorPageState.tentsLoading = false;
    sensorPageState.tentsEmpty = false;
    sensorPageState.tentsError = false;
  });

  it("hides the testbench panel when liveSensors is granted but no tent is selected yet", () => {
    entitlementState.liveSensors = true;
    sensorPageState.tentsEmpty = true;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it("hides the testbench panel when liveSensors is granted but grow tents are still loading", () => {
    entitlementState.liveSensors = true;
    sensorPageState.tentsLoading = true;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it("fails closed when entitlement lookup returns null after loading", () => {
    entitlementState.entitlementNull = true;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });
});

describe("Sensors page — EcoWitt testbench panel wiring (static)", () => {
  it("reads liveSensors from useMyEntitlements with a strict true gate", () => {
    expect(SENSORS_PAGE).toMatch(/useMyEntitlements\s*\(\s*\)/);
    expect(SENSORS_PAGE).toMatch(/capabilities\?\.liveSensors\s*===\s*true/);
  });

  it("mounts SensorsTestbenchPanel only behind canShowTestbench and an active tent", () => {
    expect(SENSORS_PAGE).toMatch(/\{canShowTestbench\s*&&\s*selectedTent\s*&&\s*activeTentId\s*&&/);
    const panelIdx = SENSORS_PAGE.indexOf("<SensorsTestbenchPanel");
    const gateIdx = SENSORS_PAGE.indexOf("canShowTestbench");
    expect(panelIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(gateIdx);
  });
});
