/**
 * UI tests for PlantDetailTimelineEvidenceReadinessLaunch.
 *
 * Verifies:
 *  - Renders the Context Readiness panel before AI Doctor runs.
 *  - Render never triggers fetch / AI / Edge / Supabase writes.
 *  - Missing photo/watering/feeding/sensor-snapshot states surface the
 *    correct operator-action buttons.
 *  - Buttons dispatch existing client UI events / navigate to existing
 *    routes only — no record creation, no AI call.
 *  - Static safety: file imports no Supabase write client, no Edge
 *    Function invoke, no AI/model client, no Action Queue/alert writer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Mock the data hooks BEFORE importing the component.
const recentActivityMock = vi.fn();
const manualLogsMock = vi.fn();
const tentReadingsMock = vi.fn();
const activityRetry = vi.fn();
const manualRetry = vi.fn();
const tentRetry = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string) => recentActivityMock(id),
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: (id: string) => manualLogsMock(id),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (...args: unknown[]) => tentReadingsMock(...args),
}));

import {
  readSensorsTentRouteIntent,
  resolveSensorsTentRouteSelection,
} from "@/lib/sensorRouteTentIntentRules";
import PlantDetailTimelineEvidenceReadinessLaunch from "@/components/PlantDetailTimelineEvidenceReadinessLaunch";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";

const fetchSpy = vi.spyOn(globalThis, "fetch" as never);

const TENT_A = "0094303d-5f4a-444a-8fd2-878dd57be453";
const TENT_B = "604edf84-1040-40e2-a31e-cf67640a981e";
const NOW = new Date("2026-09-12T20:00:00Z");
const EIGHT_HOUR_MANUAL = {
  tent_id: TENT_B,
  captured_at: "2026-09-12T12:00:00Z",
  metric: "temperature_c",
  value: 24,
  source: "manual",
  quality: "ok",
};

interface ReadState {
  data: ReadonlyArray<Record<string, unknown>> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}

function launchElement(tentId: string | null = TENT_B, hasPhoto = false) {
  return (
    <MemoryRouter>
      <PlantDetailTimelineEvidenceReadinessLaunch
        plantId="p1"
        growId="g1"
        tentId={tentId}
        plantName="Plant A"
        strain="NL"
        stage={null}
        hasPlantPhoto={hasPhoto}
      />
    </MemoryRouter>
  );
}

function renderLaunch(
  overrides: {
    hasPhoto?: boolean;
    activity?: ReadonlyArray<Record<string, unknown>>;
    manualLogs?: ReadonlyArray<Record<string, unknown>>;
    activityState?: Partial<ReadState>;
    manualState?: Partial<ReadState>;
    tentRows?: ReadonlyArray<Record<string, unknown>>;
    tentStatus?: "loading" | "error" | "refresh_error" | "success";
    tentRefreshing?: boolean;
    tentId?: string | null;
  } = {},
) {
  recentActivityMock.mockReturnValue({
    data: overrides.activity ?? [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: activityRetry,
    ...overrides.activityState,
  });
  manualLogsMock.mockReturnValue({
    data: overrides.manualLogs ?? [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: manualRetry,
    ...overrides.manualState,
  });
  tentReadingsMock.mockReturnValue({
    byTent: { [TENT_B]: overrides.tentRows ?? [] },
    statusByTent: { [TENT_B]: overrides.tentStatus ?? "success" },
    refreshingByTent: { [TENT_B]: overrides.tentRefreshing ?? false },
    isLoading: overrides.tentStatus === "loading",
    isError: ["error", "refresh_error"].includes(overrides.tentStatus ?? "success"),
    refetch: tentRetry,
    retryTent: vi.fn(),
  });
  return render(
    launchElement(overrides.tentId === undefined ? TENT_B : overrides.tentId, overrides.hasPhoto),
  );
}

beforeEach(() => {
  fetchSpy.mockReset();
  recentActivityMock.mockReset();
  manualLogsMock.mockReset();
  tentReadingsMock.mockReset();
  activityRetry.mockReset();
  manualRetry.mockReset();
  tentRetry.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("PlantDetailTimelineEvidenceReadinessLaunch — mount", () => {
  it("renders the Context Readiness panel before AI Doctor runs", () => {
    renderLaunch();
    expect(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("timeline-evidence-readiness-panel")).toBeInTheDocument();
  });

  it("does not call fetch when rendered", () => {
    renderLaunch();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PlantDetailTimelineEvidenceReadinessLaunch — operator actions", () => {
  it("shows Fast Add Photo when photo is missing", () => {
    renderLaunch({ hasPhoto: false });
    expect(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-action-add-photo"),
    ).toBeInTheDocument();
  });

  it("shows Add Watering when watering history is missing", () => {
    renderLaunch();
    const action = screen.getByTestId(
      "plant-detail-timeline-evidence-readiness-launch-action-add-watering",
    );
    expect(action).toBeInTheDocument();
    expect(action).toHaveAttribute(
      "title",
      "Add recent watering history so AI Doctor can review irrigation frequency and root-zone stress.",
    );
    expect(action.getAttribute("title")).not.toMatch(/dryback/i);
  });

  it("shows Add Feeding when feeding history is missing", () => {
    renderLaunch();
    expect(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-action-add-feeding"),
    ).toBeInTheDocument();
  });

  it("shows Add Sensor Snapshot linking to existing sensors route", () => {
    renderLaunch();
    const el = screen.getByTestId(
      "plant-detail-timeline-evidence-readiness-launch-action-add-sensor-snapshot",
    );
    const href = el.getAttribute("href") ?? el.querySelector("a")?.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/\/sensors/);
  });

  it("Fast Add Photo dispatches the existing QuickLog event without creating records", async () => {
    renderLaunch({ hasPhoto: false });
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    fireEvent.click(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-action-add-photo"),
    );
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, handler);

    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({ suggestPhoto: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Add Watering dispatches exact typed V2 target while Feeding keeps the legacy event", () => {
    renderLaunch();
    const waterEvents: CustomEvent[] = [];
    const legacyEvents: CustomEvent[] = [];
    const waterHandler = (e: Event) => waterEvents.push(e as CustomEvent);
    const legacyHandler = (e: Event) => legacyEvents.push(e as CustomEvent);
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, waterHandler);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, legacyHandler);

    fireEvent.click(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-action-add-watering"),
    );
    fireEvent.click(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-action-add-feeding"),
    );
    window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, waterHandler);
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, legacyHandler);

    expect(waterEvents).toHaveLength(1);
    expect(waterEvents[0].detail).toEqual({ targetKey: "plant:p1", action: "water" });
    expect(legacyEvents).toHaveLength(1);
    expect(legacyEvents[0].detail).toMatchObject({ eventType: "feeding" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hides photo button when a recent photo is already attached", () => {
    renderLaunch({ hasPhoto: true });
    expect(
      screen.queryByTestId("plant-detail-timeline-evidence-readiness-launch-action-add-photo"),
    ).toBeNull();
  });
});


describe("PlantDetailTimelineEvidenceReadinessLaunch — scope and read honesty", () => {
  it("includes an eight-hour assigned-tent manual when plant diary snapshots are empty", () => {
    renderLaunch({ tentRows: [EIGHT_HOUR_MANUAL] });
    expect(
      screen.queryByTestId("timeline-evidence-readiness-missing-no_recent_sensor_snapshot"),
    ).toBeNull();
    expect(screen.getByTestId("timeline-evidence-readiness-source-manual")).toHaveAttribute(
      "data-sample-count",
      "1",
    );
    expect(screen.queryByTestId("timeline-evidence-readiness-source-live")).toBeNull();
    expect(tentReadingsMock).toHaveBeenCalledWith([TENT_B], 50, ["manual"]);
  });

  it("describes historical sensor evidence separately from current sensor health", () => {
    renderLaunch({
      tentRows: [{ ...EIGHT_HOUR_MANUAL, captured_at: "2026-09-10T12:00:00Z" }],
    });
    expect(
      screen.queryByTestId("timeline-evidence-readiness-missing-no_recent_sensor_snapshot"),
    ).toBeNull();
    const scope = screen.getByTestId(
      "plant-detail-timeline-evidence-readiness-launch-scope",
    );
    expect(scope).toHaveTextContent(/plant diary.*assigned tent/i);
    expect(scope).toHaveTextContent(/last 7 days/i);
    expect(scope).toHaveTextContent(/current sensor health.*AI Doctor readiness/i);
  });

  it.each([
    ["other tent", { tent_id: TENT_A }],
    ["live", { source: "live" }],
    ["demo", { source: "demo" }],
    ["invalid quality", { quality: "invalid" }],
    ["implausible temperature", { value: 400 }],
    ["outside historical window", { captured_at: "2026-09-04T12:00:00Z" }],
  ])("does not count %s rows as assigned-tent manual evidence", (_label, patch) => {
    renderLaunch({ tentRows: [{ ...EIGHT_HOUR_MANUAL, ...patch }] });
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-no_recent_sensor_snapshot"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-evidence-readiness-source-manual")).toBeNull();
  });

  it("establishes missing sensor context after all contributing reads succeed empty", () => {
    renderLaunch();
    expect(
      screen.getByTestId("timeline-evidence-readiness-missing-no_recent_sensor_snapshot"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("plant-detail-timeline-evidence-readiness-launch-loading"),
    ).toBeNull();
    expect(
      screen.queryByTestId("plant-detail-timeline-evidence-readiness-launch-error"),
    ).toBeNull();
  });

  it.each([
    ["plant activity", { activityState: { data: undefined, isLoading: true, isFetching: true } }],
    ["plant manuals", { manualState: { data: undefined, isLoading: true, isFetching: true } }],
    ["tent manuals", { tentStatus: "loading" as const }],
    ["unset plant activity", { activityState: { data: undefined } }],
    ["unset plant manuals", { manualState: { data: undefined } }],
    ["refreshing plant activity", { activityState: { data: [], isFetching: true } }],
    ["refreshing plant manuals", { manualState: { data: [], isFetching: true } }],
    ["refreshing tent manuals", { tentRefreshing: true }],
  ])("does not claim absence while %s is unresolved", (_label, overrides) => {
    renderLaunch(overrides);
    expect(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-loading"),
    ).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("timeline-evidence-readiness-panel")).toBeNull();
    expect(
      screen.queryByTestId("plant-detail-timeline-evidence-readiness-launch-actions"),
    ).toBeNull();
  });

  it.each([
    ["plant activity", { activityState: { data: undefined, isError: true } }],
    ["plant manuals", { manualState: { data: undefined, isError: true } }],
    ["tent manuals", { tentStatus: "error" as const }],
    ["cached empty activity", { activityState: { data: [], isError: true } }],
    ["cached empty manuals", { manualState: { data: [], isError: true } }],
    ["cached empty tent manuals", { tentStatus: "refresh_error" as const }],
    [
      "cached usable tent manuals",
      { tentStatus: "refresh_error" as const, tentRows: [EIGHT_HOUR_MANUAL] },
    ],
    [
      "cached usable plant manuals",
      {
        manualState: { isError: true },
        manualLogs: [{
          capturedAt: "2026-09-12T12:00:00Z",
          source: "manual",
          metrics: { temp_f: 75 },
        }],
      },
    ],
  ])("keeps %s failure distinct from absent evidence and retries contributing reads", (_label, overrides) => {
    renderLaunch(overrides);
    expect(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-error"),
    ).toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("timeline-evidence-readiness-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try context read again" }));
    expect(activityRetry).toHaveBeenCalledTimes(1);
    expect(manualRetry).toHaveBeenCalledTimes(1);
    expect(tentRetry).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("recovers from loading and failure without changing hook order or inventing empty context", () => {
    const rendered = renderLaunch({ tentStatus: "loading" });
    expect(
      screen.getByTestId("plant-detail-timeline-evidence-readiness-launch-loading"),
    ).toBeInTheDocument();
    const state = tentReadingsMock.mock.results[0].value;
    tentReadingsMock.mockReturnValue({ ...state, statusByTent: { [TENT_B]: "error" } });
    rendered.rerender(launchElement());
    fireEvent.click(screen.getByRole("button", { name: "Try context read again" }));
    tentReadingsMock.mockReturnValue({
      ...state,
      byTent: { [TENT_B]: [EIGHT_HOUR_MANUAL] },
      statusByTent: { [TENT_B]: "success" },
      isLoading: false,
    });
    expect(() => rendered.rerender(launchElement())).not.toThrow();
    expect(screen.getByTestId("timeline-evidence-readiness-source-manual")).toBeInTheDocument();
    expect(
      screen.queryByTestId("timeline-evidence-readiness-missing-no_recent_sensor_snapshot"),
    ).toBeNull();
  });
});

describe("PlantDetailTimelineEvidenceReadinessLaunch — capture target", () => {
  it.each([
    ["assigned non-default tent", TENT_B, TENT_B],
    ["missing tent", null, null],
    ["malformed tent", "not-a-tent", null],
  ])("preserves exact capture intent for %s", (_label, tentId, expectedSelection) => {
    renderLaunch({ tentId });
    const link = screen.getByRole("link", { name: "Add sensor snapshot for AI Doctor context" });
    const url = new URL(link.getAttribute("href")!, "https://verdant.test");
    expect(url.pathname).toBe("/sensors");
    expect(url.searchParams.get("growId")).toBe("g1");
    expect(url.searchParams.get("tentId")).toBe(expectedSelection);
    expect(url.searchParams.get("tentIntent")).toBe("required");
    expect(url.hash).toBe("#manual-reading");
    const intent = readSensorsTentRouteIntent(url.searchParams);
    expect(
      resolveSensorsTentRouteSelection({
        intent,
        currentTentId: TENT_A,
        tents: [{ id: TENT_A }, { id: TENT_B }],
      }),
    ).toBe(expectedSelection);
    expect(
      resolveSensorsTentRouteSelection({
        intent,
        currentTentId: TENT_A,
        tents: [{ id: TENT_A }],
      }),
    ).toBeNull();
    if (!expectedSelection) expect(tentReadingsMock).toHaveBeenCalledWith([], 50, ["manual"]);
  });
});

describe("PlantDetailTimelineEvidenceReadinessLaunch — static safety", () => {
  const source = readFileSync(
    resolve(__dirname, "../components/PlantDetailTimelineEvidenceReadinessLaunch.tsx"),
    "utf8",
  );

  it("does not import any AI/Edge/Supabase write surfaces", () => {
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase\/client/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/aiDoctorEngine.{0,40}run|invokeAiDoctor|runAiDoctor/);
    expect(source).not.toMatch(/action[_-]?queue/i);
    expect(source).not.toMatch(/createAlert|insertAlert|writeAlert/);
    expect(source).not.toMatch(/raw_payload/);
  });
});
