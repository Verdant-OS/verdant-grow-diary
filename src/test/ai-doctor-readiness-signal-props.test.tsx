/**
 * Optional readiness signal props on F (PlantDetailAiDoctorReadiness) and
 * A (AiDoctorContextReadinessPanel). Spec: docs/specs/ai-doctor-readiness-single-summary.md
 * (R8). Default rendering without the prop is covered by the existing suites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReadinessASignal, ReadinessFSignal } from "@/lib/aiDoctorReadinessSummaryRules";

const refetch = vi.hoisted(() => vi.fn());
const currentSensorState = vi.hoisted(() => ({
  status: "success" as "loading" | "error" | "refresh_error" | "success",
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useSensorBridgeHealth", () => ({
  useSensorBridgeHealth: () => ({ data: null }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => {
    const byTent: Record<string, unknown[]> = {};
    const statusByTent: Record<string, string> = {};
    for (const id of tentIds) {
      byTent[id] = [];
      statusByTent[id] = currentSensorState.status;
    }
    return { byTent, statusByTent, refetch };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in signal prop test");
    },
    functions: { invoke: () => Promise.reject(new Error("not allowed")) },
  },
}));

import PlantDetailAiDoctorReadiness from "@/components/PlantDetailAiDoctorReadiness";
import AiDoctorContextReadinessPanel from "@/components/AiDoctorContextReadinessPanel";
import { compileAiDoctorContextFromRows } from "@/lib/aiDoctorEngine";

const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";

function renderF(onReadinessSignal?: (s: ReadinessFSignal) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlantDetailAiDoctorReadiness
          plantId="plant-1"
          growId="grow-1"
          tentId={TENT_ID}
          stage="veg"
          hasPlantPhoto
          onReadinessSignal={onReadinessSignal}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  refetch.mockReset();
  currentSensorState.status = "success";
});

describe("F onReadinessSignal", () => {
  it("reports loading while current sensor reads are pending", async () => {
    currentSensorState.status = "loading";
    const onSignal = vi.fn();
    renderF(onSignal);
    await waitFor(() => expect(onSignal).toHaveBeenCalled());
    const last = onSignal.mock.calls.at(-1)![0] as ReadinessFSignal;
    expect(last.loading).toBe(true);
    expect(last.readError).toBe(false);
  });

  it("reports a read error and a retry that refetches", async () => {
    currentSensorState.status = "error";
    const onSignal = vi.fn();
    renderF(onSignal);
    await waitFor(() => expect(onSignal).toHaveBeenCalled());
    const last = onSignal.mock.calls.at(-1)![0] as ReadinessFSignal;
    expect(last).toMatchObject({ loading: false, readError: true });
    last.retry();
    expect(refetch).toHaveBeenCalled();
  });

  it("reports settled, error-free reads", async () => {
    const onSignal = vi.fn();
    renderF(onSignal);
    await waitFor(() => expect(onSignal).toHaveBeenCalled());
    expect(onSignal.mock.calls.at(-1)![0]).toMatchObject({ loading: false, readError: false });
  });

  it("renders without the prop", () => {
    expect(() => renderF()).not.toThrow();
  });
});

describe("A onReadinessSignal", () => {
  const NOW = new Date("2026-06-10T12:00:00Z");
  const context = compileAiDoctorContextFromRows({
    plant: {
      id: "p1",
      name: "Plant A",
      strain: "Northern Lights",
      stage: "veg",
      grow_id: "g1",
      tent_id: "t1",
    },
    growEvents: [],
    sensorReadings: [],
    now: NOW,
  });

  it("reports the view state the panel renders", async () => {
    const onSignal = vi.fn();
    const { getByTestId } = render(
      <AiDoctorContextReadinessPanel context={context} onReadinessSignal={onSignal} />,
    );
    await waitFor(() => expect(onSignal).toHaveBeenCalled());
    const state = getByTestId("ai-doctor-context-readiness-panel").getAttribute(
      "data-readiness-state",
    );
    expect((onSignal.mock.calls.at(-1)![0] as ReadinessASignal).view).toBe(state);
    expect(state).toBeTruthy();
  });
});
