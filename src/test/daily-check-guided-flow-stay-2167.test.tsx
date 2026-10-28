import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  INITIAL_DAILY_GROW_CHECK_STATE,
  shouldAdvanceGuidedDailyCheckOnSubmit,
  shouldWarnOnEmptyManualStepNext,
} from "@/lib/dailyGrowCheckRules";

const mockPlants = [
  {
    id: "p1",
    name: "Sour D",
    strain: "Sour Diesel",
    grow_id: "g1",
    tent_id: "t1",
    is_archived: false,
  },
];
const mockTents = [{ id: "t1", name: "Tent A", grow_id: "g1" }];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mockTents, isLoading: false }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mockPlants, isLoading: false }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ activeGrowId: "g1", grows: [{ id: "g1", name: "Grow 1" }] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: ({ onSaved, successMessage }: { onSaved?: () => void; successMessage?: string }) => (
    <div data-testid="mock-manual-card" data-success-message={successMessage ?? ""}>
      <button type="button" data-testid="mock-manual-save" onClick={() => onSaved?.()}>
        Confirm manual snapshot
      </button>
    </div>
  ),
}));
vi.mock("@/components/QuickLog", () => ({
  default: ({
    open,
    onCreated,
    successMessage,
  }: {
    open?: boolean;
    onCreated?: () => void;
    successMessage?: string;
  }) => (
    <div
      data-testid="mock-quicklog"
      data-open={open ? "1" : "0"}
      data-success-message={successMessage ?? ""}
    >
      <button type="button" data-testid="mock-quicklog-submit" onClick={() => onCreated?.()}>
        Save log
      </button>
    </div>
  ),
}));
vi.mock("@/components/PlantStatusStrip", () => ({
  default: () => <div data-testid="mock-status-strip" />,
}));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: () => <div data-testid="mock-alerts-panel" />,
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: () => <div data-testid="mock-actions-panel" />,
}));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div data-testid="mock-onboarding" />,
}));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => <div data-testid="daily-check-all-activities" />,
}));

const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
    error: vi.fn(),
  },
}));

import DailyCheck from "@/pages/DailyCheck";

function renderRoute(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function RouteProbe() {
    const location = useLocation();
    return (
      <div data-testid="route-probe">
        {location.pathname}
        {location.search}
      </div>
    );
  }
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DailyCheck />
        <RouteProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("dailyGrowCheckRules — guided flow submit & empty manual warning (#2167)", () => {
  it("advances in-place during the guided flow when no direct method hint was requested", () => {
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "sensor",
        renderedStep: "manual",
        methodHint: null,
      }),
    ).toBe(true);
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "note",
        renderedStep: "quicklog",
        methodHint: null,
      }),
    ).toBe(true);
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "note",
        renderedStep: "handheld",
        methodHint: null,
      }),
    ).toBe(true);
  });

  it("does not intercept direct ?method=note or ?method=sensor return-navigation shortcuts", () => {
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "sensor",
        renderedStep: "manual",
        methodHint: "sensor",
      }),
    ).toBe(false);
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "note",
        renderedStep: "quicklog",
        methodHint: "note",
      }),
    ).toBe(false);
  });

  it("warns when pressing Next on an empty manual step with pending outcome", () => {
    expect(
      shouldWarnOnEmptyManualStepNext({
        renderedStep: "manual",
        state: INITIAL_DAILY_GROW_CHECK_STATE,
      }),
    ).toBe(true);
    expect(
      shouldWarnOnEmptyManualStepNext({
        renderedStep: "manual",
        state: { ...INITIAL_DAILY_GROW_CHECK_STATE, manual: "added" },
      }),
    ).toBe(false);
    expect(
      shouldWarnOnEmptyManualStepNext({
        renderedStep: "environment",
        state: INITIAL_DAILY_GROW_CHECK_STATE,
      }),
    ).toBe(false);
  });
});

describe("DailyCheck guided flow — stays in flow on step 3 and step 4 (#2167)", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastWarning.mockClear();
  });

  it("clicking Confirm manual snapshot on step 3 stays on /daily-check and advances to step 4 (Quick Log)", () => {
    renderRoute("/daily-check?plantId=p1");

    // Step 1 -> Step 2 (Environment) -> Step 3 (Manual snapshot)
    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    expect(screen.getByText(/Step 2 · Review Current Environment/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(screen.getByText(/Step 3 · Add Manual Sensor Snapshot/i)).toBeInTheDocument();

    // Confirm manual snapshot
    act(() => {
      fireEvent.click(screen.getByTestId("mock-manual-save"));
    });

    // Must remain on /daily-check and advance to Step 4
    expect(screen.getByTestId("route-probe")).toHaveTextContent("/daily-check?plantId=p1");
    expect(screen.getByText(/Step 4 · Quick Log/i)).toBeInTheDocument();
  });

  it("clicking Save log on step 4 stays on /daily-check and advances to step 5 (Handheld Readings)", () => {
    renderRoute("/daily-check?plantId=p1");

    // Step 1 -> Step 2 -> Step 3 -> Skip to Step 4
    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-skip-manual"));
    expect(screen.getByText(/Step 4 · Quick Log/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("daily-grow-check-open-quicklog"));
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1");

    // Save log
    act(() => {
      fireEvent.click(screen.getByTestId("mock-quicklog-submit"));
    });

    // Must remain on /daily-check, close dialog, and advance to Step 5
    expect(screen.getByTestId("route-probe")).toHaveTextContent("/daily-check?plantId=p1");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "0");
    expect(screen.getByText(/Step 5 · Handheld Readings/i)).toBeInTheDocument();
  });

  it("leaving the manual step empty and pressing Next shows a warning while advancing", () => {
    renderRoute("/daily-check?plantId=p1");

    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(screen.getByText(/Step 3 · Add Manual Sensor Snapshot/i)).toBeInTheDocument();

    // Press Next without saving a manual snapshot
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));

    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning.mock.calls[0][0]).toMatch(/no manual snapshot saved/i);
    expect(screen.getByTestId(" daily-grow-check-manual-empty-warning".trim())).toBeInTheDocument();
    expect(screen.getByText(/Step 4 · Quick Log/i)).toBeInTheDocument();
  });
});
