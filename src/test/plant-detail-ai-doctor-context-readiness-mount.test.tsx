/**
 * Mount tests for PlantDetailAiDoctorContextReadinessMount.
 *
 * Verifies loading/empty/fallback states, that compiled context flows
 * into AiDoctorContextReadinessPanel, and that no writes/network calls
 * occur during render.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as renderTestingLibrary, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AlertsListStatus } from "@/hooks/useAlertsList";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailAiDoctorContextReadinessMount from "@/components/PlantDetailAiDoctorContextReadinessMount";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in mount render test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in mount render test");
      },
    },
  },
}));

const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((() => {
  throw new Error("fetch not allowed in mount render test");
}) as never);

const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const render = (ui: ReactElement) => renderTestingLibrary(<MemoryRouter>{ui}</MemoryRouter>);

const activityRetry = vi.fn();
const manualRetry = vi.fn();
const tentRetry = vi.fn();
const alertsRetry = vi.fn();
type ReadState = { data?: unknown; isLoading: boolean; isFetching?: boolean; isError?: boolean };

let recentActivityState: ReadState = {
  data: [],
  isLoading: false,
};
let manualLogsState: ReadState = {
  data: [],
  isLoading: false,
};
let alertsState: {
  rows: ReadonlyArray<{ id: string; status?: string }>;
  status?: AlertsListStatus;
  openCount?: number;
} = { rows: [] };
let tentReadingsState: {
  byTent: Record<string, unknown[]>;
  statusByTent: Record<string, string>;
  refreshingByTent?: Record<string, boolean>;
} = { byTent: {}, statusByTent: {} };

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
  usePlantRecentActivity: () => ({ ...recentActivityState, refetch: activityRetry }),
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  PLANT_MANUAL_SENSOR_HISTORY_LIMIT: 30,
  usePlantManualSensorHistory: () => ({ data: undefined, isLoading: false }),
  usePlantManualSensorLogs: () => ({ ...manualLogsState, refetch: manualRetry }),
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({
    status: alertsState.status ?? "ok",
    rows: alertsState.rows,
    // Mirrors the hook: counts come from the uncapped active set, not `rows`.
    openCount: alertsState.openCount ?? alertsState.rows.filter((r) => r.status === "open").length,
    activeCount: alertsState.rows.length,
    error: null,
    reload: alertsRetry,
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => {
    const byTent: Record<string, unknown[]> = {};
    const statusByTent: Record<string, string> = {};
    for (const id of tentIds) {
      byTent[id] = tentReadingsState.byTent[id] ?? [];
      statusByTent[id] = tentReadingsState.statusByTent[id] ?? "success";
    }
    return {
      byTent,
      statusByTent,
      refreshingByTent: tentReadingsState.refreshingByTent ?? {},
      isLoading: false,
      isError: false,
      refetch: tentRetry,
      retryTent: vi.fn(),
    };
  },
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
  recentActivityState = { data: [], isLoading: false };
  manualLogsState = { data: [], isLoading: false };
  alertsState = { rows: [] };
  tentReadingsState = { byTent: {}, statusByTent: {} };
  fetchSpy.mockClear();
  activityRetry.mockReset();
  manualRetry.mockReset();
  tentRetry.mockReset();
  alertsRetry.mockReset();
});

describe("PlantDetailAiDoctorContextReadinessMount — alert read truth", () => {
  const count = () => screen.getByTestId("ai-doctor-context-readiness-panel-count-open-alerts");

  it.each(["idle", "loading"] as const)(
    "withholds a retained alert count while the read is %s",
    (status) => {
      alertsState = { status, rows: [{ id: "stale", status: "open" }], openCount: 8 };
      render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
      expect(count()).toHaveTextContent(/^Loading…$/);
      expect(screen.queryByRole("button", { name: "Retry alerts" })).toBeNull();
      expect(alertsRetry).not.toHaveBeenCalled();
    },
  );

  it.each([0, 8])("shows unavailable instead of a failed count of %s", (openCount) => {
    alertsState = { status: "unavailable", rows: [], openCount };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(count()).toHaveTextContent("Unavailable");
    expect(count()).not.toHaveTextContent(/\d/);
    expect(alertsRetry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry alerts" }));
    expect(alertsRetry).toHaveBeenCalledTimes(1);
    expect(activityRetry).not.toHaveBeenCalled();
    expect(manualRetry).not.toHaveBeenCalled();
    expect(tentRetry).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows no assigned tent even if the previous alert read retained a count", () => {
    alertsState = { status: "ok", rows: [{ id: "stale", status: "open" }], openCount: 8 };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} tentId={null} />);
    expect(count()).toHaveTextContent(/^No assigned tent$/);
    expect(screen.queryByRole("button", { name: "Retry alerts" })).toBeNull();
  });

  it.each([0, 8])("uses the successful uncapped strictly-open count %s", (openCount) => {
    // The capped display rows can all be acknowledged, even when open alerts
    // exist beyond them. Neither their length nor status is the count source.
    alertsState = { status: "ok", rows: [{ id: "ack", status: "acknowledged" }], openCount };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(count().textContent).toBe(String(openCount));
    expect(screen.queryByRole("button", { name: "Retry alerts" })).toBeNull();
  });

  it("recovers from failed reads through retry loading to a successful zero", () => {
    alertsState = { status: "ok", rows: [], openCount: 8 };
    const rendered = render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(count().textContent).toBe("8");
    const rerender = () =>
      rendered.rerender(
        <MemoryRouter>
          <PlantDetailAiDoctorContextReadinessMount {...baseProps} />
        </MemoryRouter>,
      );
    alertsState = { status: "loading", rows: [], openCount: 8 };
    rerender();
    expect(count()).toHaveTextContent(/^Loading…$/);
    alertsState = { status: "unavailable", rows: [], openCount: 0 };
    rerender();
    expect(count()).toHaveTextContent("Unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry alerts" }));
    alertsState = { status: "loading", rows: [], openCount: 0 };
    rerender();
    expect(count()).toHaveTextContent(/^Loading…$/);
    alertsState = { status: "ok", rows: [], openCount: 0 };
    rerender();
    expect(count().textContent).toBe("0");
    expect(alertsRetry).toHaveBeenCalledTimes(1);
    expect(activityRetry).not.toHaveBeenCalled();
    expect(manualRetry).not.toHaveBeenCalled();
    expect(tentRetry).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PlantDetailAiDoctorContextReadinessMount", () => {
  it("renders loading state while hooks resolve", () => {
    recentActivityState = { data: undefined, isLoading: true };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-loading"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-loading").textContent,
    ).toContain("Checking AI Doctor context");
  });

  it("renders the readiness panel with compiled context when data is present", () => {
    recentActivityState = {
      data: [{ entry_at: ago(12 * HOUR), entry_type: "watering" }],
      isLoading: false,
    };
    manualLogsState = {
      data: [
        {
          capturedAt: ago(2 * HOUR),
          source: "manual",
          metrics: { temp_f: 75, humidity_percent: 55, ph: null, ec: null },
        },
      ],
      isLoading: false,
    };
    alertsState = {
      rows: [
        { id: "a1", status: "open" },
        { id: "a2", status: "open" },
      ],
    };

    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-context-readiness-panel")).toBeTruthy();
    // Stage from props flowed through
    expect(screen.getByTestId("ai-doctor-context-readiness-panel-stage").textContent).toBe("veg");
    // Open alerts forwarded
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-count-open-alerts").textContent,
    ).toBe("2");
    // Manual source labeled, no live label
    expect(screen.getByTestId("ai-doctor-context-readiness-panel-source-manual")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-context-readiness-panel-source-live")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    // Sensor context audit panel is mounted near AI Doctor readiness area
    expect(screen.getByTestId("plant-sensor-context-audit-panel")).toBeTruthy();
  });

  it("renders 'Sensor data missing' when no sensor data exists", () => {
    recentActivityState = {
      data: [{ entry_at: ago(12 * HOUR), entry_type: "watering" }],
      isLoading: false,
    };
    manualLogsState = { data: [], isLoading: false };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    expect(panel.getAttribute("data-readiness-state")).toBe("sensor_missing");
  });

  it("routes an unassigned plant to its existing tent-assignment control", () => {
    manualLogsState = { data: [], isLoading: false };

    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} tentId={null} />);

    const recovery = screen.getByTestId("plant-sensor-context-audit-cta-recovery");
    expect(recovery.textContent).toMatch(/Assign this plant to a tent/i);
    expect(
      screen.getByTestId("plant-sensor-context-audit-cta-recovery-link").getAttribute("href"),
    ).toBe("/plants/p1#plant-overview");
    expect(screen.queryByTestId("plant-sensor-context-audit-cta-button")).toBeNull();
  });

  it("renders safe fallback when compilation throws", () => {
    const exploding = {
      [Symbol.iterator]() {
        throw new Error("boom");
      },
    };
    recentActivityState = { data: exploding as unknown as unknown[], isLoading: false };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-fallback"),
    ).toBeTruthy();
  });

  it("surfaces a fresh tent-scoped manual snapshot when plant diary logs are empty", () => {
    const capturedAt = ago(5 * 60 * 1000);
    const tentId = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";
    tentReadingsState = {
      byTent: {
        [tentId]: [
          {
            tent_id: tentId,
            source: "manual",
            quality: "ok",
            metric: "temp_f",
            value: 75,
            captured_at: capturedAt,
          },
          {
            tent_id: tentId,
            source: "manual",
            quality: "ok",
            metric: "humidity",
            value: 60,
            captured_at: capturedAt,
          },
          {
            tent_id: tentId,
            source: "manual",
            quality: "ok",
            metric: "vpd",
            value: 1,
            captured_at: capturedAt,
          },
        ],
      },
      statusByTent: { [tentId]: "success" },
    };
    manualLogsState = { data: [], isLoading: false };

    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} tentId={tentId} />);

    expect(screen.getByTestId("plant-sensor-context-audit-message").textContent).not.toMatch(
      /No plant-level manual sensor snapshots found/,
    );
    expect(screen.getByTestId("plant-sensor-context-audit-latest").textContent).not.toMatch(
      /None/i,
    );
    expect(screen.getByTestId("plant-sensor-context-audit-status").textContent).not.toMatch(
      /Missing/i,
    );
  });

  it("surfaces the remasure 76°F / 58% RH tent save when diary manuals are empty", () => {
    const capturedAt = ago(5 * 60 * 1000);
    const tentId = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";
    tentReadingsState = {
      byTent: {
        [tentId]: [
          {
            tent_id: tentId,
            source: "manual",
            quality: null,
            metric: "temp_f",
            value: 76,
            captured_at: capturedAt,
          },
          {
            tent_id: tentId,
            source: "manual",
            quality: null,
            metric: "humidity",
            value: 58,
            captured_at: capturedAt,
          },
        ],
      },
      statusByTent: { [tentId]: "success" },
    };
    manualLogsState = { data: [], isLoading: false };

    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} tentId={tentId} />);

    expect(screen.getByTestId("plant-sensor-context-audit-message").textContent).not.toMatch(
      /No plant-level manual sensor snapshots found/,
    );
    expect(screen.getByTestId("plant-sensor-context-audit-latest").textContent).not.toMatch(
      /None/i,
    );
  });

  it("static guard: mount source imports no Supabase/network/write helpers", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/PlantDetailAiDoctorContextReadinessMount.tsx", "utf8");
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/actionQueue/i);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/createAlert|insertAlert/);
  });
});

describe("PlantDetailAiDoctorContextReadinessMount — failed reads are not missing evidence", () => {
  const tentId = "604edf84-1040-40e2-a31e-cf67640a981e";
  const props = { ...baseProps, tentId };
  const manualRow = () => ({
    tent_id: tentId,
    source: "manual",
    quality: "ok",
    metric: "temperature_c",
    value: 24,
    captured_at: ago(8 * HOUR),
  });

  function expectNoNormalPreview() {
    expect(screen.queryByTestId("ai-doctor-context-readiness-panel")).toBeNull();
    expect(screen.queryByTestId("plant-sensor-context-audit-panel")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-check-in-preview-panel")).toBeNull();
  }

  it.each(["activity", "plant manuals", "tent manuals"] as const)(
    "does not show missing context after a failed %s read",
    (source) => {
      if (source === "activity") recentActivityState = { isLoading: false, isError: true };
      if (source === "plant manuals") manualLogsState = { isLoading: false, isError: true };
      if (source === "tent manuals") {
        tentReadingsState = { byTent: {}, statusByTent: { [tentId]: "error" } };
      }
      render(<PlantDetailAiDoctorContextReadinessMount {...props} />);
      expect(
        screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-error"),
      ).toHaveAttribute("role", "alert");
      expectNoNormalPreview();
      fireEvent.click(screen.getByRole("button", { name: "Try context read again" }));
      expect(activityRetry).toHaveBeenCalledTimes(1);
      expect(manualRetry).toHaveBeenCalledTimes(1);
      expect(tentRetry).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "does not present a failed tent refresh as current context (cached rows: %s)",
    (hasCachedRows) => {
      tentReadingsState = {
        byTent: { [tentId]: hasCachedRows ? [manualRow()] : [] },
        statusByTent: { [tentId]: "refresh_error" },
      };
      render(<PlantDetailAiDoctorContextReadinessMount {...props} />);
      expect(
        screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-error"),
      ).toBeInTheDocument();
      expectNoNormalPreview();
    },
  );

  it.each(["activity", "plant manuals"] as const)(
    "does not treat failed cached %s as a successful read",
    (source) => {
      const failed = { data: [], isLoading: false, isError: true };
      if (source === "activity") recentActivityState = failed;
      else manualLogsState = failed;
      render(<PlantDetailAiDoctorContextReadinessMount {...props} />);
      expect(
        screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-error"),
      ).toBeInTheDocument();
      expectNoNormalPreview();
    },
  );

  it.each(["activity", "plant manuals", "tent manuals"] as const)(
    "withholds absence claims while an empty %s result refreshes",
    (source) => {
      const refreshing = { data: [], isLoading: false, isFetching: true };
      if (source === "activity") recentActivityState = refreshing;
      if (source === "plant manuals") manualLogsState = refreshing;
      if (source === "tent manuals") {
        tentReadingsState = {
          byTent: { [tentId]: [] },
          statusByTent: { [tentId]: "success" },
          refreshingByTent: { [tentId]: true },
        };
      }
      render(<PlantDetailAiDoctorContextReadinessMount {...props} />);
      expect(
        screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-loading"),
      ).toBeInTheDocument();
      expectNoNormalPreview();
    },
  );

  it("recovers from loading through failure to usable tent history without changing hook order", () => {
    tentReadingsState = { byTent: {}, statusByTent: { [tentId]: "loading" } };
    const rendered = render(<PlantDetailAiDoctorContextReadinessMount {...props} />);
    tentReadingsState = { byTent: {}, statusByTent: { [tentId]: "error" } };
    rendered.rerender(
      <MemoryRouter>
        <PlantDetailAiDoctorContextReadinessMount {...props} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try context read again" }));
    tentReadingsState = {
      byTent: { [tentId]: [manualRow()] },
      statusByTent: { [tentId]: "success" },
    };
    expect(() =>
      rendered.rerender(
        <MemoryRouter>
          <PlantDetailAiDoctorContextReadinessMount {...props} />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("ai-doctor-context-readiness-panel")).toBeInTheDocument();
    expect(screen.getByTestId("plant-sensor-context-audit-latest")).not.toHaveTextContent(/None/i);
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-scope"),
    ).toHaveTextContent(/last 7 days.*current sensor health.*AI Doctor readiness/i);
  });
});
