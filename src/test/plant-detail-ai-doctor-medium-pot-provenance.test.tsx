/**
 * Plant Detail AI Doctor context — medium / pot size pass-through and
 * provenance copy tests.
 *
 * The Plant Detail data source (`useGrowPlant` / `plants` table) does
 * not yet expose `medium` or `pot_size` columns. This test locks two
 * behaviors:
 *  1. When a caller does NOT pass medium / potSize, the readiness panel
 *     keeps the unknown state honest AND renders provenance copy
 *     explaining the field is not available from the profile source
 *     (rather than implying the grower forgot).
 *  2. When a future caller DOES thread medium / potSize through, those
 *     values flow into the compiled AI Doctor context and the unknown
 *     provenance copy disappears.
 *
 * No AI / model / session / Supabase write paths are exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import PlantDetailAiDoctorContextReadinessMount from "@/components/PlantDetailAiDoctorContextReadinessMount";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in medium/pot provenance test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in provenance test");
      },
    },
  },
}));
const fetchSpy = vi
  .spyOn(globalThis, "fetch" as never)
  .mockImplementation((() => {
    throw new Error("fetch not allowed in provenance test");
  }) as never);

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
  usePlantRecentActivity: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  PLANT_MANUAL_SENSOR_HISTORY_LIMIT: 30,
  usePlantManualSensorHistory: () => ({ data: [], isLoading: false }),
  usePlantManualSensorLogs: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({
    status: "idle",
    rows: [],
    error: null,
  }),
}));

beforeEach(() => {
  fetchSpy.mockClear();
});

describe("PlantDetailAiDoctorContextReadinessMount — medium / pot size provenance", () => {
  it("renders unknown-medium / unknown-pot provenance copy when source has no values", () => {
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId="p1"
        growId="g1"
        tentId="t1"
        plantName="Plant A"
        strain="NL"
        stage="veg"
      />,
    );
    const medium = screen.getByTestId(
      "ai-doctor-context-readiness-panel-medium-unavailable",
    );
    const pot = screen.getByTestId(
      "ai-doctor-context-readiness-panel-pot-size-unavailable",
    );
    expect(medium.textContent).toMatch(/not available on this plant profile yet/);
    expect(pot.textContent).toMatch(/not available on this plant profile yet/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes medium / potSize through to the context when caller supplies them", () => {
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId="p1"
        growId="g1"
        tentId="t1"
        plantName="Plant A"
        strain="NL"
        stage="veg"
        medium="coco"
        potSize="11 L"
      />,
    );
    expect(
      screen.queryByTestId(
        "ai-doctor-context-readiness-panel-medium-unavailable",
      ),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        "ai-doctor-context-readiness-panel-pot-size-unavailable",
      ),
    ).toBeNull();
  });

  it("does NOT infer medium / pot size from strain or freeform fields", () => {
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId="p1"
        growId="g1"
        tentId="t1"
        plantName="Plant A"
        // Strain mentions 'Coco' — must not be inferred as medium.
        strain="Coco Loco"
        stage="veg"
      />,
    );
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-medium-unavailable",
      ),
    ).toBeTruthy();
  });

  it("treats blank-only medium / potSize as unknown (no fabrication)", () => {
    render(
      <PlantDetailAiDoctorContextReadinessMount
        plantId="p1"
        growId="g1"
        tentId="t1"
        plantName="Plant A"
        strain="NL"
        stage="veg"
        medium="   "
        potSize=""
      />,
    );
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-medium-unavailable",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "ai-doctor-context-readiness-panel-pot-size-unavailable",
      ),
    ).toBeTruthy();
  });
});
