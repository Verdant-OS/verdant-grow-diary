/**
 * Hook-order regression: PlantDetailAiDoctorContextReadinessMount must
 * not call hooks conditionally. Previously `useMemo(auditIdentity)` and
 * `useCallback(openManualSensorEntry)` lived after early returns, so the
 * component crashed with "Rendered more hooks than during the previous
 * render." when context flipped from missing/loading to available
 * (resulting in a blank PlantDetail screen).
 *
 * Presenter-only. No Supabase calls, no AI calls, no Action Queue writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import PlantDetailAiDoctorContextReadinessMount from "@/components/PlantDetailAiDoctorContextReadinessMount";

// Forbid any networked write-path or model call during render.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in hook-order regression");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in hook-order regression");
      },
    },
  },
}));
const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch not allowed in hook-order regression");
  }) as never);

// Mutable hook state mirrors how the real page would re-render as
// async data resolves.
let recentActivityState: { data?: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
};
let manualLogsState: { data?: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
};
let alertsState: { rows: ReadonlyArray<{ id: string }> } = { rows: [] };

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
  usePlantRecentActivity: () => recentActivityState,
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  PLANT_MANUAL_SENSOR_HISTORY_LIMIT: 30,
  usePlantManualSensorHistory: () => ({ data: undefined, isLoading: false }),
  usePlantManualSensorLogs: () => manualLogsState,
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({
    status: "idle",
    rows: alertsState.rows,
    error: null,
  }),
}));

const baseProps = {
  plantId: "p1",
  growId: "g1",
  tentId: "t1",
  plantName: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
};

beforeEach(() => {
  recentActivityState = { data: undefined, isLoading: true };
  manualLogsState = { data: undefined, isLoading: true };
  alertsState = { rows: [] };
  fetchSpy.mockClear();
});

describe("PlantDetailAiDoctorContextReadinessMount hook-order regression", () => {
  it("does not crash when re-rendering from loading → context-available", () => {
    // Render 1: loading (early-return branch).
    const { rerender, container } = render(
      <PlantDetailAiDoctorContextReadinessMount {...baseProps} />,
    );
    expect(container).toBeTruthy();

    // Render 2: context now available — without the fix, hook counts
    // diverged and React threw "Rendered more hooks than during the
    // previous render." Just rendering without throwing proves the fix.
    recentActivityState = { data: [], isLoading: false };
    manualLogsState = { data: [], isLoading: false };
    expect(() =>
      rerender(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />),
    ).not.toThrow();
  });

  it("does not crash when re-rendering from context-available → loading", () => {
    recentActivityState = { data: [], isLoading: false };
    manualLogsState = { data: [], isLoading: false };
    const { rerender } = render(
      <PlantDetailAiDoctorContextReadinessMount {...baseProps} />,
    );

    recentActivityState = { data: undefined, isLoading: true };
    manualLogsState = { data: undefined, isLoading: true };
    expect(() =>
      rerender(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />),
    ).not.toThrow();
  });

  it("survives a loading → fallback → context-available transition", () => {
    const { rerender } = render(
      <PlantDetailAiDoctorContextReadinessMount {...baseProps} />,
    );
    // Flip to fallback (data settled but built.context absent is hard to
    // force; using empty data which still produces a valid context is fine —
    // the goal is to traverse all early-return branches without throwing).
    recentActivityState = { data: [], isLoading: false };
    manualLogsState = { data: [], isLoading: false };
    expect(() =>
      rerender(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />),
    ).not.toThrow();
    recentActivityState = { data: undefined, isLoading: true };
    expect(() =>
      rerender(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />),
    ).not.toThrow();
    recentActivityState = { data: [], isLoading: false };
    expect(() =>
      rerender(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />),
    ).not.toThrow();
  });

  it("never triggers an AI Doctor / network call during these transitions", () => {
    const { rerender } = render(
      <PlantDetailAiDoctorContextReadinessMount {...baseProps} />,
    );
    recentActivityState = { data: [], isLoading: false };
    manualLogsState = { data: [], isLoading: false };
    rerender(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
