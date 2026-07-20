/**
 * PlantDetailAiDoctorLiveReview — CSV/current sensor pending/error gating.
 *
 * Review findings: still-loading CSV history or current tent rows must never
 * be treated as a confirmed empty list.
 *
 * Pins:
 *  - while the tent's CSV-history read is in flight, the start button is
 *    held (a click cannot send a packet that silently claims no imported
 *    history exists);
 *  - once rows arrive, the packet sent to the edge invoke carries the
 *    sanitized imported_sensor_history built from those rows;
 *  - a FAILED read requires an explicit retry-or-continue decision before
 *    omission can reach a paid AI request;
 *  - fresh live temp/RH/soil rows reach the packet with no raw payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = rtlRender(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
  return {
    ...view,
    rerenderWithProviders(nextUi: ReactElement) {
      view.rerender(
        <MemoryRouter>
          <QueryClientProvider client={client}>{nextUi}</QueryClientProvider>
        </MemoryRouter>,
      );
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
    functions: { invoke: vi.fn() },
  },
}));

const trackFunnelEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      displayPlanId: "free",
      effectivePlanId: "free",
      status: "active",
      isActive: true,
      capabilities: {},
      degraded: false,
      degradedReason: "null_row_free",
      isStaff: false,
      source: "free",
    },
  }),
}));

const itemsRef: { current: TimelineMemoryItem[] } = { current: [] };
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: itemsRef.current, isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

// Mutable per-test state for the dedicated imported-history read and the
// separately bounded current-source read.
const sensorQueryState = vi.hoisted(() => ({
  csvRows: [] as unknown[],
  csvStatus: "success" as "loading" | "error" | "success",
  csvFetching: false,
  csvRefetch: vi.fn(async () => undefined),
  currentRows: [] as unknown[],
  currentStatus: "success" as "loading" | "error" | "refresh_error" | "success",
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[], _limit: number) => {
    const byTent: Record<string, unknown[]> = {};
    const statusByTent: Record<string, string> = {};
    for (const id of tentIds) {
      byTent[id] =
        sensorQueryState.currentStatus === "success" ||
        sensorQueryState.currentStatus === "refresh_error"
          ? sensorQueryState.currentRows
          : [];
      statusByTent[id] = sensorQueryState.currentStatus;
    }
    return {
      byTent,
      statusByTent,
      isLoading: sensorQueryState.currentStatus === "loading",
      isError:
        sensorQueryState.currentStatus === "error" ||
        sensorQueryState.currentStatus === "refresh_error",
    };
  },
}));

vi.mock("@/hooks/useImportedSensorHistory", () => ({
  useImportedSensorHistory: () => ({
    // TanStack Query intentionally retains successful data when a later
    // refetch fails. Keep that behavior visible to the regressions below.
    data: sensorQueryState.csvRows,
    isLoading: sensorQueryState.csvStatus === "loading",
    isFetching: sensorQueryState.csvStatus === "loading" || sensorQueryState.csvFetching,
    isError: sensorQueryState.csvStatus === "error",
    refetch: sensorQueryState.csvRefetch,
  }),
}));

import PlantDetailAiDoctorLiveReview, {
  AI_DOCTOR_LIVE_REVIEW_HISTORICAL_COPY,
  type PlantDetailAiDoctorLiveReviewProps,
} from "@/components/PlantDetailAiDoctorLiveReview";

const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";
const GROW_ID = "11111111-1111-4111-8111-111111111111";

const snapshotCard = (when: string): ManualSnapshotTimelineCard =>
  ({
    id: "snap-1",
    title: "Manual sensor snapshot",
    capturedAt: when,
    sourceLabel: "Manual",
    source: "manual",
    tentId: "t-1",
    plantId: "p-1",
    isTentLevel: false,
    notes: null,
    readings: [],
    severity: "ok",
    warnings: [],
  }) as unknown as ManualSnapshotTimelineCard;

const strongPlant = {
  id: "p1",
  name: "Alpha",
  strain: "Northern Lights Auto",
  stage: "flower",
  medium: "coco",
  photo: "https://x/y.jpg",
};

function strongTimeline(): TimelineMemoryItem[] {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  return [
    {
      kind: "manual_sensor_snapshot",
      key: "snap-1",
      occurredAt: recent(2 * 3600_000),
      card: snapshotCard(recent(2 * 3600_000)),
    },
    {
      kind: "diary",
      key: "d-1",
      occurredAt: recent(3 * 3600_000),
      eventType: "watering",
      hasPhoto: false,
      note: "Watered today",
    },
    {
      kind: "diary",
      key: "d-2",
      occurredAt: recent(6 * 3600_000),
      eventType: "feeding",
      hasPhoto: true,
      note: "Light feed",
    },
  ] as TimelineMemoryItem[];
}

const csvRows = [
  {
    metric: "temperature_c",
    value: 24,
    captured_at: "2026-06-01T10:00:00.000Z",
    ts: "2026-06-01T10:00:00.000Z",
    source: "csv",
    quality: "ok",
    raw_payload: { csv_import: true },
  },
  {
    metric: "humidity_pct",
    value: 55,
    captured_at: "2026-06-01T10:00:00.000Z",
    ts: "2026-06-01T10:00:00.000Z",
    source: "csv",
    quality: "ok",
    raw_payload: { csv_import: true },
  },
];

const historicalCsvRows = [
  {
    metric: "temperature_c",
    value: 23,
    captured_at: "2026-06-01T10:00:00.000Z",
    ts: "2026-06-01T10:00:00.000Z",
    source: "csv",
    quality: "ok",
    raw_payload: { csv_import: true },
  },
  {
    metric: "temperature_c",
    value: 25,
    captured_at: "2026-06-02T10:00:00.000Z",
    ts: "2026-06-02T10:00:00.000Z",
    source: "csv",
    quality: "ok",
    raw_payload: { csv_import: true },
  },
];

const validResult = () => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium",
  evidence: ["Tent temperature was elevated."],
  missing_information: ["No recent VPD snapshot."],
  possible_causes: ["High tent temperature."],
  immediate_action: "Stabilize temperature and observe.",
  what_not_to_do: "Avoid increasing nutrient strength right now.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold the current feed schedule and monitor daily.",
  risk_level: "watch",
});

type InvokeFn = (
  name: string,
  init: {
    body: import("@/lib/aiDoctorReviewRequestTransportRules").AiDoctorReviewRequestEnvelope<
      import("@/lib/aiDoctorReviewRequestPacket").AiDoctorReviewRequestPacket
    >;
  },
) => Promise<{ data: unknown; error: unknown }>;

function reviewElement(
  invoke: ReturnType<typeof vi.fn<InvokeFn>>,
  tentId = TENT_ID,
  persist?: PlantDetailAiDoctorLiveReviewProps["persist"],
) {
  return (
    <PlantDetailAiDoctorLiveReview
      plantId="p1"
      plant={strongPlant}
      growId={GROW_ID}
      tentId={tentId}
      invoke={invoke}
      persist={persist}
    />
  );
}

function mount(
  invoke = vi.fn<InvokeFn>(async () => ({
    data: { ok: false, reason: "http" },
    error: null,
  })),
) {
  render(reviewElement(invoke));
  return invoke;
}

beforeEach(() => {
  cleanup();
  itemsRef.current = strongTimeline();
  sensorQueryState.csvRows = [];
  sensorQueryState.csvStatus = "success";
  sensorQueryState.csvFetching = false;
  sensorQueryState.csvRefetch.mockReset();
  sensorQueryState.csvRefetch.mockResolvedValue(undefined);
  sensorQueryState.currentRows = [];
  sensorQueryState.currentStatus = "success";
  trackFunnelEvent.mockClear();
});

describe("CSV history pending/error gating", () => {
  it("holds the start button while the CSV-history read is in flight", () => {
    sensorQueryState.csvStatus = "loading";
    mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(start);
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it("holds the start button while cached-empty CSV history is refetching", () => {
    sensorQueryState.csvRows = [];
    sensorQueryState.csvStatus = "success";
    sensorQueryState.csvFetching = true;
    mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it("does not render a disclosure when the allowed packet has no imported history", () => {
    const invoke = mount();

    expect(screen.queryByTestId("ai-doctor-imported-history-disclosure")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends the sanitized imported-history summary once rows arrive", async () => {
    sensorQueryState.csvRows = csvRows;
    const invoke = mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(screen.getByTestId("ai-doctor-imported-history-disclosure")).toBeInTheDocument();
    expect(screen.getByTestId("ai-doctor-imported-history-source-label")).toHaveTextContent(
      "CSV history",
    );
    expect(screen.getByTestId("ai-doctor-imported-history-total-readings")).toHaveTextContent("2");
    expect(screen.getByTestId("ai-doctor-imported-history-date-range")).toHaveTextContent(
      "2026-06-01T10:00:00.000Z",
    );
    expect(screen.getByTestId("ai-doctor-imported-history-metrics")).toHaveTextContent(
      "temperature_c",
    );
    expect(
      screen.getByTestId("ai-doctor-imported-history-missing-live-warning"),
    ).toBeInTheDocument();
    // Disclosure is read-only: merely rendering it never invokes AI Doctor.
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(start);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_doctor_review_started", {
      surface: "standard",
    });
    const request = invoke.mock.calls[0][1].body;
    expect(request.grow_id).toBe(GROW_ID);
    const packet = request.packet as {
      imported_sensor_history: { totalReadings: number } | null;
      missingLiveSensorReadings?: boolean;
    };
    expect(packet.imported_sensor_history?.totalReadings).toBe(2);
    // Manual snapshot + CSV history never count as live.
    expect(packet.missingLiveSensorReadings).toBe(true);
    // Raw rows never enter the packet.
    expect(JSON.stringify(packet)).not.toContain("raw_payload");
  });

  it("requires an explicit decision before a failed read can be omitted", async () => {
    sensorQueryState.csvRows = historicalCsvRows;
    sensorQueryState.csvStatus = "error";
    const invoke = mount();

    expect(screen.getByTestId("plant-ai-doctor-imported-history-recovery")).toHaveTextContent(
      /couldn’t load this tent’s imported sensor history/i,
    );
    expect(screen.queryByTestId("plant-ai-doctor-live-review-start")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(trackFunnelEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-imported-history-continue"));
    expect(screen.getByTestId("plant-ai-doctor-imported-history-omitted")).toHaveTextContent(
      /without imported sensor history/i,
    );

    const start = screen.getByTestId("plant-ai-doctor-live-review-start");
    fireEvent.click(start);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const packet = invoke.mock.calls[0][1].body.packet as {
      imported_sensor_history: unknown;
    };
    expect(packet.imported_sensor_history).toBeNull();
    expect(screen.queryByTestId("ai-doctor-imported-history-disclosure")).toBeNull();
    expect(screen.getByTestId("plant-ai-doctor-imported-history-omitted")).toBeInTheDocument();
  });

  it("retries only the imported-history query and never invokes AI Doctor", () => {
    sensorQueryState.csvStatus = "error";
    const invoke = mount();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-imported-history-retry"));

    expect(sensorQueryState.csvRefetch).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it("restores imported context after a successful query retry", async () => {
    sensorQueryState.csvRows = historicalCsvRows;
    sensorQueryState.csvStatus = "error";
    const invoke = vi.fn<InvokeFn>(async () => ({
      data: { ok: false, reason: "http" },
      error: null,
    }));
    const view = render(reviewElement(invoke));

    fireEvent.click(screen.getByTestId("plant-ai-doctor-imported-history-retry"));
    expect(sensorQueryState.csvRefetch).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();

    sensorQueryState.csvStatus = "success";
    sensorQueryState.csvRows = csvRows;
    view.rerenderWithProviders(reviewElement(invoke));

    expect(screen.queryByTestId("plant-ai-doctor-imported-history-recovery")).toBeNull();
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][1].body.packet.imported_sensor_history?.totalReadings).toBe(2);
  });

  it("keeps an omitted packet frozen when history later succeeds before a model retry", async () => {
    sensorQueryState.csvRows = historicalCsvRows;
    sensorQueryState.csvStatus = "error";
    const invoke = vi.fn<InvokeFn>(async () => ({
      data: { ok: false, reason: "http" },
      error: null,
    }));
    const view = render(reviewElement(invoke));

    fireEvent.click(screen.getByTestId("plant-ai-doctor-imported-history-continue"));
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][1].body.packet.imported_sensor_history).toBeNull();

    sensorQueryState.csvStatus = "success";
    view.rerenderWithProviders(reviewElement(invoke));

    expect(screen.getByTestId("plant-ai-doctor-imported-history-omitted")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-retry"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][1].body.packet.imported_sensor_history).toBeNull();
  });

  it("keeps an included packet frozen when a later history refetch fails", async () => {
    sensorQueryState.csvRows = historicalCsvRows;
    const invoke = vi.fn<InvokeFn>(async () => ({
      data: { ok: false, reason: "http" },
      error: null,
    }));
    const view = render(reviewElement(invoke));

    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][1].body.packet.imported_sensor_history?.totalReadings).toBe(2);
    expect(screen.getByTestId("ai-doctor-imported-history-total-readings")).toHaveTextContent("2");

    sensorQueryState.csvRows = [
      ...historicalCsvRows,
      {
        ...historicalCsvRows[1],
        captured_at: "2026-06-03T10:00:00.000Z",
        ts: "2026-06-03T10:00:00.000Z",
      },
    ];
    sensorQueryState.csvStatus = "error";
    view.rerenderWithProviders(reviewElement(invoke));

    expect(screen.queryByTestId("plant-ai-doctor-imported-history-recovery")).toBeNull();
    expect(screen.queryByTestId("plant-ai-doctor-imported-history-omitted")).toBeNull();
    // The accepted disclosure stays at two readings even though the query now
    // holds three cached rows and reports a failed refetch.
    expect(screen.getByTestId("ai-doctor-imported-history-total-readings")).toHaveTextContent("2");
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-retry"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][1].body.packet.imported_sensor_history?.totalReadings).toBe(2);
  });

  it("does not carry an omission choice into a different tent", () => {
    sensorQueryState.csvStatus = "error";
    const invoke = vi.fn<InvokeFn>(async () => ({
      data: { ok: false, reason: "http" },
      error: null,
    }));
    const view = render(reviewElement(invoke));

    fireEvent.click(screen.getByTestId("plant-ai-doctor-imported-history-continue"));
    expect(screen.getByTestId("plant-ai-doctor-imported-history-omitted")).toBeInTheDocument();

    const otherTentId = "6b2d7f10-3c4e-4d5f-8a01-2b3c4d5e6f88";
    view.rerenderWithProviders(reviewElement(invoke, otherTentId));

    expect(screen.getByTestId("plant-ai-doctor-imported-history-recovery")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-ai-doctor-imported-history-omitted")).toBeNull();
    expect(screen.queryByTestId("plant-ai-doctor-live-review-start")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("clears a completed omitted review when the plant/tent scope changes", async () => {
    sensorQueryState.csvStatus = "error";
    const invoke = vi.fn<InvokeFn>(async () => ({
      data: { ok: true, result: validResult() },
      error: null,
    }));
    const view = render(reviewElement(invoke));

    fireEvent.click(screen.getByTestId("plant-ai-doctor-imported-history-continue"));
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await screen.findByTestId("plant-ai-doctor-live-review-result-wrap");
    expect(screen.getByTestId("plant-ai-doctor-imported-history-omitted")).toBeInTheDocument();

    sensorQueryState.csvStatus = "success";
    sensorQueryState.csvRows = [];
    const otherTentId = "6b2d7f10-3c4e-4d5f-8a01-2b3c4d5e6f88";
    view.rerenderWithProviders(reviewElement(invoke, otherTentId));

    expect(screen.queryByTestId("plant-ai-doctor-live-review-result-wrap")).toBeNull();
    expect(screen.queryByTestId("plant-ai-doctor-imported-history-omitted")).toBeNull();
    expect(screen.getByTestId("plant-ai-doctor-live-review-start")).toBeInTheDocument();
  });

  it("keeps recovery reachable when failed history was the only qualifying context", () => {
    itemsRef.current = [];
    sensorQueryState.csvRows = historicalCsvRows;
    sensorQueryState.csvStatus = "error";
    const invoke = mount();

    expect(screen.getByTestId("plant-ai-doctor-imported-history-recovery")).toBeInTheDocument();
    expect(screen.getByTestId("plant-ai-doctor-live-review-confidence-copy")).toHaveTextContent(
      /remaining context is not enough/i,
    );
    expect(screen.queryByTestId("plant-ai-doctor-live-review-start")).toBeNull();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-imported-history-continue"));

    expect(screen.getByTestId("plant-ai-doctor-imported-history-omitted")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-ai-doctor-live-review-start")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("also holds the start button while current sensor truth is still loading", () => {
    sensorQueryState.currentStatus = "loading";
    mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it("sends fresh live temperature, humidity, and soil values without raw payload", async () => {
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    sensorQueryState.csvRows = historicalCsvRows;
    sensorQueryState.currentRows = [
      {
        metric: "temperature_c",
        value: 25,
        captured_at: capturedAt,
        source: "live",
        raw_payload: { bridge_token: "vbt_do_not_send" },
      },
      {
        metric: "humidity_pct",
        value: 58,
        captured_at: capturedAt,
        source: "live",
        raw_payload: { bridge_token: "vbt_do_not_send" },
      },
      {
        metric: "soil_moisture_pct",
        value: 41,
        captured_at: capturedAt,
        source: "live",
        raw_payload: { bridge_token: "vbt_do_not_send" },
      },
    ];
    const invoke = mount();
    expect(screen.getByTestId("ai-doctor-imported-history-disclosure")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-doctor-imported-history-missing-live-warning")).toBeNull();
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const packet = invoke.mock.calls[0][1].body.packet;
    expect(packet.recentSensorSnapshot?.readings).toEqual([
      { field: "humidity_pct", value: 58, unit: "%" },
      { field: "soil_moisture_pct", value: 41, unit: "%" },
      { field: "temperature_c", value: 25, unit: "°C" },
    ]);
    expect(packet.recentSensorSnapshotAnnotation?.source).toBe("live");
    expect(packet.missingLiveSensorReadings).toBe(false);
    expect(JSON.stringify(packet)).not.toContain("raw_payload");
    expect(JSON.stringify(packet)).not.toContain("vbt_do_not_send");
  });

  it("does not let a successful UI test packet satisfy live AI Doctor context", async () => {
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    sensorQueryState.currentRows = [
      {
        metric: "temperature_c",
        value: 29,
        captured_at: capturedAt,
        source: "live",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test" },
        },
      },
    ];
    const invoke = mount();
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const packet = invoke.mock.calls[0][1].body.packet;
    expect(packet.recentSensorSnapshotAnnotation?.source).toBe("manual");
    expect(packet.missingLiveSensorReadings).toBe(true);
    expect(JSON.stringify(packet)).not.toContain('"value":29');
  });

  it("a failed current read proceeds without inventing a current snapshot", async () => {
    sensorQueryState.currentStatus = "error";
    const invoke = mount();
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const packet = invoke.mock.calls[0][1].body.packet;
    // The existing two-hour diary snapshot remains; no direct current row
    // was fabricated to replace it.
    expect(packet.recentSensorSnapshotAnnotation?.source).toBe("manual");
    expect(packet.missingLiveSensorReadings).toBe(true);
  });

  it("omits cached current rows after their refresh fails", async () => {
    sensorQueryState.currentRows = [
      {
        metric: "temperature_c",
        value: 31,
        captured_at: new Date(Date.now() - 60_000).toISOString(),
        source: "live",
      },
    ];
    sensorQueryState.currentStatus = "refresh_error";
    const invoke = mount();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const packet = invoke.mock.calls[0][1].body.packet;
    expect(packet.missingLiveSensorReadings).toBe(true);
    expect(JSON.stringify(packet)).not.toContain('"value":31');
  });
});

describe("CSV-first historical review eligibility", () => {
  it("keeps the accepted history visible beside the result before the post-value upgrade", async () => {
    sensorQueryState.csvRows = historicalCsvRows;
    const invoke = vi.fn<InvokeFn>(async () => ({
      data: {
        ok: true,
        result: validResult(),
        credit: {
          plan_id: "free",
          remaining: 0,
          scope: "per_grow",
          scope_limit: 3,
        },
      },
      error: null,
    }));
    const persist = vi.fn().mockResolvedValue({ ok: true, id: "session-csv-final-free" });
    render(reviewElement(invoke, TENT_ID, persist));

    const disclosureBeforeStart = screen.getByTestId("ai-doctor-imported-history-disclosure");
    expect(disclosureBeforeStart).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));

    const result = await screen.findByTestId("plant-detail-live-ai-doctor-review-result-preview");
    const disclosureAfterResult = screen.getByTestId("ai-doctor-imported-history-disclosure");
    const paywall = await screen.findByTestId("plant-ai-doctor-post-value-upgrade");
    expect(screen.getByTestId("plant-ai-doctor-history-saved")).toBeInTheDocument();
    expect(disclosureAfterResult).toBe(disclosureBeforeStart);
    expect(
      disclosureAfterResult.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(result.compareDocumentPosition(paywall) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("renders a manual-only limited review and keeps current readiness insufficient", async () => {
    itemsRef.current = [];
    sensorQueryState.csvRows = historicalCsvRows;
    const invoke = mount();

    const root = screen.getByTestId("plant-ai-doctor-live-review");
    expect(root).toHaveAttribute("data-readiness", "insufficient");
    expect(root).toHaveAttribute("data-review-mode", "historical_review");
    expect(screen.getByTestId("plant-ai-doctor-live-review-confidence-copy")).toHaveTextContent(
      AI_DOCTOR_LIVE_REVIEW_HISTORICAL_COPY,
    );
    expect(AI_DOCTOR_LIVE_REVIEW_HISTORICAL_COPY).toContain("not live telemetry");

    // Merely rendering imported history never spends a credit or runs AI.
    expect(invoke).not.toHaveBeenCalled();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start");
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(trackFunnelEvent).toHaveBeenCalledTimes(2);
    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_doctor_review_started", {
      surface: "historical_review",
    });
    expect(trackFunnelEvent).toHaveBeenCalledWith("historical_ai_review_started");

    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-retry")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-retry"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(trackFunnelEvent).toHaveBeenCalledTimes(2);

    const packet = invoke.mock.calls[0][1].body.packet;
    expect(packet.readiness.state).toBe("insufficient");
    expect(packet.imported_sensor_history?.totalReadings).toBe(2);
    expect(packet.missingLiveSensorReadings).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("raw_payload");
  });

  it("stays blocked when two CSV metrics came from only one timestamp", () => {
    itemsRef.current = [];
    sensorQueryState.csvRows = csvRows;
    const invoke = mount();
    expect(screen.queryByTestId("plant-ai-doctor-live-review")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stays blocked when explicit invalid-quality rows span two timestamps", () => {
    itemsRef.current = [];
    sensorQueryState.csvRows = historicalCsvRows.map((row) => ({ ...row, quality: "invalid" }));
    const invoke = mount();
    expect(screen.queryByTestId("plant-ai-doctor-live-review")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stays blocked when a later nonnumeric row is the only second timestamp", () => {
    itemsRef.current = [];
    sensorQueryState.csvRows = [
      ...csvRows,
      {
        ...historicalCsvRows[1],
        value: "not-a-number",
      },
    ];
    const invoke = mount();
    expect(screen.queryByTestId("plant-ai-doctor-live-review")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stays blocked for non-CSV and malformed rows", () => {
    itemsRef.current = [];
    sensorQueryState.csvRows = [
      { ...historicalCsvRows[0], source: "manual" },
      { ...historicalCsvRows[1], captured_at: "not-a-date", ts: "not-a-date" },
    ];
    const invoke = mount();
    expect(screen.queryByTestId("plant-ai-doctor-live-review")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stays blocked without a plant profile even when CSV history is sufficient", () => {
    itemsRef.current = [];
    sensorQueryState.csvRows = historicalCsvRows;
    const invoke = vi.fn<InvokeFn>();
    render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={null}
        growId={GROW_ID}
        tentId={TENT_ID}
        invoke={invoke}
      />,
    );
    expect(screen.queryByTestId("plant-ai-doctor-live-review")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
