/**
 * Sensors page operator-diagnostics wiring test. Verifies the panel
 * appears only when ?operator=1 is set, never displays tokens, and
 * shows no start/listen/control CTA.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sensors from "@/pages/Sensors";

const operatorRoleState: {
  status: "loading" | "granted" | "denied" | "unauthenticated" | "error";
} = { status: "denied" };

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: operatorRoleState.status,
    granted: operatorRoleState.status === "granted",
    error: operatorRoleState.status === "error" ? "role_check_failed" : null,
  }),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({ data: [{ id: "t1", name: "Tent 1", growId: "g1" }] }),
  useGrowSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: [] }) }));
vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({ data: [] }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({
  default: () => null,
}));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));

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

describe("Sensors page — operator diagnostics wiring", () => {
  beforeEach(() => {
    operatorRoleState.status = "denied";
  });

  it("does NOT render the operator diagnostics section by default", () => {
    renderAt("/sensors");
    expect(screen.queryByTestId("sensors-operator-diagnostics")).toBeNull();
    expect(screen.queryByTestId("ecowitt-bridge-troubleshooting-panel")).toBeNull();
  });

  it("does NOT treat ?operator=1 as an operator-role bypass", () => {
    renderAt("/sensors?operator=1");
    expect(screen.queryByTestId("sensors-operator-diagnostics")).toBeNull();
    expect(screen.queryByTestId("ecowitt-bridge-troubleshooting-panel")).toBeNull();
  });

  it.each(["loading", "error", "unauthenticated"] as const)(
    "fails closed while role status is %s",
    (status) => {
      operatorRoleState.status = status;
      renderAt("/sensors?operator=1");
      expect(screen.queryByTestId("sensors-operator-diagnostics")).toBeNull();
    },
  );

  it("renders the troubleshooting panel + audit report only for a verified operator", () => {
    operatorRoleState.status = "granted";
    renderAt("/sensors?operator=1");
    expect(screen.getByTestId("sensors-operator-diagnostics")).toBeTruthy();
    expect(screen.getByTestId("ecowitt-bridge-troubleshooting-panel")).toBeTruthy();
    expect(screen.getByTestId("sensor-ingest-audit-report")).toBeTruthy();
  });

  it("operator section shows 'needs verification' overall when env is unknown", () => {
    operatorRoleState.status = "granted";
    renderAt("/sensors?operator=1");
    const panel = screen.getByTestId("ecowitt-bridge-troubleshooting-panel");
    expect(panel.getAttribute("data-overall")).toBe("unknown");
  });

  it("operator section never shows start/listen/control CTAs or token values", () => {
    operatorRoleState.status = "granted";
    renderAt("/sensors?operator=1");
    const section = screen.getByTestId("sensors-operator-diagnostics");
    const text = section.textContent ?? "";
    expect(text.toLowerCase()).not.toMatch(/start bridge|listen to mqtt|open port|port-?forward/);
    expect(text).not.toMatch(/Bearer [A-Za-z0-9._-]{8,}/);
    expect(text).toMatch(/Use this panel after dry-run/);
  });
});
