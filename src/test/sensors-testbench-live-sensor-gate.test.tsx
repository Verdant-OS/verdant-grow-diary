/**
 * Production QA 2026-10-14 (disposable Free account): /sensors rendered the
 * EcoWitt testbench & setup panel (backend URL, ingest endpoint, Mint token,
 * curl/PowerShell copy) to a Free grower. The panel is a live-sensor setup
 * surface, so it mounts only after the server-authoritative
 * live-sensor-entitlement preflight (useLiveSensorServerGate) returns
 * "allowed" (the same canonical-subscription resolution mint-bridge-token
 * and the ingest Edge functions enforce). The client useMyEntitlements
 * capability map, which carries a presentation-only staff lift, is ignored.
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

// Client entitlement map: presentation-only. A staff account resolves
// liveSensors: true here even without a paid subscription.
const entitlementState = { liveSensors: false };
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { liveSensors: entitlementState.liveSensors } },
    refetch: vi.fn(),
  }),
}));

// Server-authoritative preflight (live-sensor-entitlement Edge function).
// `evaluatedTentId` defaults to the scope the page asked for (a settled
// decision for the current tent); a string overrides it.
const serverGate = vi.hoisted(() => ({
  state: "denied" as string,
  result: null as Record<string, unknown> | null,
  evaluatedTentId: undefined as string | null | undefined,
}));
vi.mock("@/hooks/useLiveSensorServerGate", () => ({
  useLiveSensorServerGate: (_surface: string, scope: Record<string, unknown> = {}) => ({
    state: serverGate.state,
    result: serverGate.result,
    evaluatedTentId:
      serverGate.evaluatedTentId === undefined
        ? ((scope.tentId as string | null | undefined) ?? null)
        : serverGate.evaluatedTentId,
    recheck: vi.fn(),
  }),
}));

const ALLOWED_RESULT = {
  ok: true,
  state: "allowed",
  reason: null,
  displayPlanId: "pro_monthly",
};

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
    serverGate.state = "denied";
    serverGate.result = { ok: false, state: "denied", reason: "upgrade_required" };
    serverGate.evaluatedTentId = undefined;
  });

  it("hides the testbench panel when the server preflight denies (Free plan)", () => {
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  // Codex P2 at 79236e8f: loading is pinned independently of denial. The
  // client capability is true and a stale allowed result is present, so only
  // the completed-lookup requirement keeps the panel hidden.
  it("hides the testbench panel while the server preflight is still loading", () => {
    entitlementState.liveSensors = true;
    serverGate.state = "loading";
    serverGate.result = ALLOWED_RESULT;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  // Codex P2 at 79236e8f: useMyEntitlements lifts staff to liveSensors: true,
  // but mint-bridge-token and ingest reject them with upgrade_required.
  it("hides the testbench panel for a staff lift the server rejects", () => {
    entitlementState.liveSensors = true;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it.each(["invalid_request", "network_error"])(
    "hides the testbench panel when the server preflight returns %s",
    (state) => {
      entitlementState.liveSensors = true;
      serverGate.state = state;
      serverGate.result = { ok: false, state, reason: state };
      renderAt("/sensors");
      expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
    },
  );

  // Codex P2 / Copilot at 73d7314c: an allowed decision for another tent, or
  // an unscoped one, must not mount the panel for the active tent.
  it.each([
    ["a different tent", "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70"],
    ["no tent (unscoped)", null],
  ])("hides the testbench panel when the allowed decision was for %s", (_label, evaluated) => {
    serverGate.state = "allowed";
    serverGate.result = ALLOWED_RESULT;
    serverGate.evaluatedTentId = evaluated;
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-testbench-panel")).toBeNull();
  });

  it("shows the testbench panel when the server preflight allows the active tent", () => {
    serverGate.state = "allowed";
    serverGate.result = ALLOWED_RESULT;
    renderAt("/sensors");
    expect(screen.getByTestId("sensors-testbench-panel")).toBeInTheDocument();
  });
});
