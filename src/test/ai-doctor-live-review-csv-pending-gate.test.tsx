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
 *  - a FAILED read proceeds by omission, never a fabricated summary/value;
 *  - fresh live temp/RH/soil rows reach the packet with no raw payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
    functions: { invoke: vi.fn() },
  },
}));

const itemsRef: { current: TimelineMemoryItem[] } = { current: [] };
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: itemsRef.current, isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

// Mutable per-test state for the two separately bounded source reads.
const sensorQueryState = vi.hoisted(() => ({
  csvRows: [] as unknown[],
  csvStatus: "success" as "loading" | "error" | "success",
  currentRows: [] as unknown[],
  currentStatus: "success" as "loading" | "error" | "success",
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (
    tentIds: string[],
    _limit: number,
    sourceFilter?: readonly string[] | null,
  ) => {
    const current = sourceFilter?.includes("live") === true;
    const rows = current ? sensorQueryState.currentRows : sensorQueryState.csvRows;
    const status = current ? sensorQueryState.currentStatus : sensorQueryState.csvStatus;
    const byTent: Record<string, unknown[]> = {};
    const statusByTent: Record<string, string> = {};
    for (const id of tentIds) {
      byTent[id] = status === "success" ? rows : [];
      statusByTent[id] = status;
    }
    return {
      byTent,
      statusByTent,
      isLoading: status === "loading",
      isError: status === "error",
    };
  },
}));

import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";

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
    raw_payload: { csv_import: true },
  },
  {
    metric: "humidity_pct",
    value: 55,
    captured_at: "2026-06-01T10:00:00.000Z",
    ts: "2026-06-01T10:00:00.000Z",
    source: "csv",
    raw_payload: { csv_import: true },
  },
];

type InvokeFn = (
  name: string,
  init: {
    body: import("@/lib/aiDoctorReviewRequestTransportRules").AiDoctorReviewRequestEnvelope<
      import("@/lib/aiDoctorReviewRequestPacket").AiDoctorReviewRequestPacket
    >;
  },
) => Promise<{ data: unknown; error: unknown }>;

function mount(
  invoke = vi.fn<InvokeFn>(async () => ({
    data: { ok: false, reason: "http" },
    error: null,
  })),
) {
  render(
    <PlantDetailAiDoctorLiveReview
      plantId="p1"
      plant={strongPlant}
      growId={GROW_ID}
      tentId={TENT_ID}
      invoke={invoke}
      sensorClassificationOverride={null}
    />,
  );
  return invoke;
}

beforeEach(() => {
  cleanup();
  itemsRef.current = strongTimeline();
  sensorQueryState.csvRows = [];
  sensorQueryState.csvStatus = "success";
  sensorQueryState.currentRows = [];
  sensorQueryState.currentStatus = "success";
});

describe("CSV history pending/error gating", () => {
  it("holds the start button while the CSV-history read is in flight", () => {
    sensorQueryState.csvStatus = "loading";
    mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it("sends the sanitized imported-history summary once rows arrive", async () => {
    sensorQueryState.csvRows = csvRows;
    const invoke = mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
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

  it("a failed read proceeds WITHOUT history — omission, not fabrication", async () => {
    sensorQueryState.csvStatus = "error";
    const invoke = mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const packet = invoke.mock.calls[0][1].body.packet as {
      imported_sensor_history: unknown;
    };
    expect(packet.imported_sensor_history).toBeNull();
  });

  it("also holds the start button while current sensor truth is still loading", () => {
    sensorQueryState.currentStatus = "loading";
    mount();
    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it("sends fresh live temperature, humidity, and soil values without raw payload", async () => {
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
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
});
