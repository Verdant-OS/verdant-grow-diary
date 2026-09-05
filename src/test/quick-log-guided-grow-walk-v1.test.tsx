import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  GROW_WALK_FOLLOW_UP_OPTIONS,
  GROW_WALK_MISSINGNESS_OPTIONS,
  GROW_WALK_RISK_OPTIONS,
  GROW_WALK_VISIT_MODES,
  resolveGrowWalkPlantPrompts,
} from "@/lib/growWalkContracts";

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1", stage: "flowering" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", captured_at: null, source: null, metrics: {} },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

function renderSheet(defaultTargetKey?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey={defaultTargetKey} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => cleanup());

describe("QUICKLOG_GUIDED_GROW_WALK_V1 contracts", () => {
  it("pins the four modes and first-class missingness without conflating blank with healthy", () => {
    expect(GROW_WALK_VISIT_MODES.map(({ label }) => label)).toEqual([
      "Fast Check",
      "Routine Walk",
      "Deep Evidence Walk",
      "Alert Walk",
    ]);
    expect(GROW_WALK_MISSINGNESS_OPTIONS).toEqual([
      "Checked",
      "Concern",
      "Not checked",
      "Not measured",
      "Not applicable",
      "Unknown",
    ]);
    expect(GROW_WALK_RISK_OPTIONS).toEqual(["Routine", "Watch", "Act today", "Urgent"]);
    expect(GROW_WALK_FOLLOW_UP_OPTIONS).toEqual(["24 hours", "72 hours", "Next visit"]);
  });

  it("shows sex only for a relevant plant stage and never for a tent", () => {
    expect(resolveGrowWalkPlantPrompts({ targetType: "plant", stage: "vegetative" })).toEqual({
      showStage: true,
      showSex: false,
    });
    expect(resolveGrowWalkPlantPrompts({ targetType: "plant", stage: "flowering" })).toEqual({
      showStage: true,
      showSex: true,
    });
    expect(resolveGrowWalkPlantPrompts({ targetType: "tent", stage: "flowering" })).toEqual({
      showStage: false,
      showSex: false,
    });
  });
});

describe("Quick Log Field Edition progressive disclosure", () => {
  it("keeps Fast Check as the default useful-note path with no SOP wall", () => {
    renderSheet("plant:plant-1");
    expect(screen.getByTestId("qlv2-visit-mode-fast_check")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-save")).toBeEnabled();
    expect(screen.queryByTestId("qlv2-grow-walk-backbone")).not.toBeInTheDocument();
  });

  it("fails the guided identity closed until a verified target exists", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("qlv2-visit-mode-routine_walk"));
    expect(screen.getByTestId("qlv2-grow-walk-identity-blocked")).toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-grow-walk-backbone")).not.toBeInTheDocument();
  });

  it("reveals the Routine backbone, sensor truth, contextual sex prompt, risk, and follow-up without side effects", () => {
    renderSheet("plant:plant-1");
    fireEvent.click(screen.getByTestId("qlv2-visit-mode-routine_walk"));
    expect(screen.getByTestId("qlv2-grow-walk-backbone")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-grow-walk-nonpersist-disclosure")).toHaveTextContent(
      "Guided control selections (light phase, visit reason, doorway scan, risk, follow-up) apply to this visit only and are not saved. Put anything durable in the accurate note below.",
    );
    expect(screen.getByLabelText("Light phase")).toHaveValue("Unknown");
    expect(screen.getByLabelText("Visit reason")).toHaveValue("Routine check");
    expect(screen.getByLabelText("Doorway scan")).toHaveValue("Not checked");
    expect(screen.getByTestId("quicklog-sensor-snapshot-strip")).toHaveAttribute(
      "data-status",
      "no_data",
    );
    expect(screen.getByTestId("qlv2-grow-walk-sex-prompt")).toBeInTheDocument();
    expect(screen.getByLabelText("Grow walk risk")).toHaveValue("Routine");
    expect(screen.getByLabelText("Grow walk follow-up")).toHaveValue("Next visit");
    expect(
      screen.getByText(/Nothing is sent to the approval-required Action Queue automatically/),
    ).toBeInTheDocument();
  });
});
