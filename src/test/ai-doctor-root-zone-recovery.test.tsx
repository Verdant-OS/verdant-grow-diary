import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import type { RootZoneObservationV1 } from "@/lib/rootZoneObservationRules";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

const rootZoneQuery = vi.hoisted(() => ({
  observations: [] as unknown[],
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(async () => undefined),
  useSpy: vi.fn(),
}));

const importedHistoryRefetch = vi.hoisted(() => vi.fn(async () => undefined));
const trackFunnelEvent = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

const timelineItems: { current: TimelineMemoryItem[] } = { current: [] };
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: timelineItems.current, isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

vi.mock("@/hooks/useImportedSensorHistory", () => ({
  useImportedSensorHistory: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: importedHistoryRefetch,
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => ({
    byTent: Object.fromEntries(tentIds.map((tentId) => [tentId, []])),
    statusByTent: Object.fromEntries(tentIds.map((tentId) => [tentId, "success"])),
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: (scope: unknown, limit: number) => {
    rootZoneQuery.useSpy(scope, limit);
    return {
      observations: rootZoneQuery.observations,
      isLoading: rootZoneQuery.isLoading,
      isFetching: rootZoneQuery.isFetching,
      isError: rootZoneQuery.isError,
      error: rootZoneQuery.error,
      refetch: rootZoneQuery.refetch,
    };
  },
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: null }),
}));

import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";
import { AI_DOCTOR_REVIEW_PACKET_ROOT_ZONE_CAP } from "@/lib/aiDoctorReviewRequestPacket";

const PLANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GROW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const plant = {
  id: PLANT_ID,
  name: "Alpha",
  strain: "Northern Lights Auto",
  stage: "flower",
  medium: "coco",
  potSize: "11 L",
  photo: "https://example.test/plant.jpg",
};

const snapshotCard = (capturedAt: string): ManualSnapshotTimelineCard =>
  ({
    id: "snapshot-1",
    title: "Manual sensor snapshot",
    capturedAt,
    sourceLabel: "Manual",
    source: "manual",
    tentId: TENT_ID,
    plantId: PLANT_ID,
    isTentLevel: false,
    notes: null,
    readings: [],
    severity: "ok",
    warnings: [],
  }) as unknown as ManualSnapshotTimelineCard;

function strongTimeline(): TimelineMemoryItem[] {
  const recent = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
  const snapshotAt = recent(60 * 60_000);
  return [
    {
      kind: "manual_sensor_snapshot",
      key: "snapshot-1",
      occurredAt: snapshotAt,
      card: snapshotCard(snapshotAt),
    },
    {
      kind: "diary",
      key: "watering-1",
      occurredAt: recent(2 * 60 * 60_000),
      eventType: "watering",
      hasPhoto: false,
      note: "Watered today",
    },
    {
      kind: "diary",
      key: "feeding-1",
      occurredAt: recent(3 * 60 * 60_000),
      eventType: "feeding",
      hasPhoto: true,
      note: "Light feed",
    },
  ] as TimelineMemoryItem[];
}

const rootZoneObservation: RootZoneObservationV1 = {
  occurredAt: "2026-07-19T12:00:00.000Z",
  eventType: "feeding",
  source: "manual",
  metrics: {
    schemaVersion: 1,
    volumeMl: 700,
    inputPh: 5.9,
    inputEcMsCm: 1.4,
    outputEcMsCm: 1.8,
    runoffMl: 100,
    runoffPh: 6.1,
    runoffEcMsCm: 2,
    waterTempC: 20.5,
    nutrientLine: "flower-week-3",
    products: [{ name: "Base", amount: 2, unit: "mL/L" }],
  },
};

type InvokeFn = (
  name: string,
  init: {
    body: import("@/lib/aiDoctorReviewRequestTransportRules").AiDoctorReviewRequestEnvelope<
      import("@/lib/aiDoctorReviewRequestPacket").AiDoctorReviewRequestPacket
    >;
  },
) => Promise<{ data: unknown; error: unknown }>;

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function mount(
  invoke = vi.fn<InvokeFn>(async () => ({
    data: { ok: false, reason: "http" },
    error: null,
  })),
) {
  renderWithQueryClient(
    <PlantDetailAiDoctorLiveReview
      plantId={PLANT_ID}
      plant={plant}
      growId={GROW_ID}
      tentId={TENT_ID}
      invoke={invoke}
    />,
  );
  return invoke;
}

beforeEach(() => {
  cleanup();
  timelineItems.current = strongTimeline();
  rootZoneQuery.observations = [];
  rootZoneQuery.isLoading = false;
  rootZoneQuery.isFetching = false;
  rootZoneQuery.isError = false;
  rootZoneQuery.error = null;
  rootZoneQuery.refetch.mockReset();
  rootZoneQuery.refetch.mockResolvedValue(undefined);
  rootZoneQuery.useSpy.mockClear();
  importedHistoryRefetch.mockReset();
  importedHistoryRefetch.mockResolvedValue(undefined);
  trackFunnelEvent.mockClear();
});

describe("AI Doctor root-zone history recovery", () => {
  it("blocks review start while root-zone history is loading", () => {
    rootZoneQuery.isLoading = true;
    rootZoneQuery.isFetching = true;
    const invoke = mount();

    const start = screen.getByTestId("plant-ai-doctor-live-review-start") as HTMLButtonElement;
    expect(start).toBeDisabled();
    expect(screen.getByTestId("plant-ai-doctor-live-review")).toHaveAttribute(
      "data-root-zone-recovery-state",
      "loading",
    );

    fireEvent.click(start);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("shows an explicit retry-or-continue decision after an error and cannot invoke", () => {
    rootZoneQuery.isError = true;
    rootZoneQuery.error = new Error("root-zone read failed");
    const invoke = mount();

    expect(screen.getByTestId("plant-ai-doctor-root-zone-history-recovery")).toHaveTextContent(
      /couldn’t load this plant’s recent watering and feeding measurements/i,
    );
    expect(screen.getByTestId("plant-ai-doctor-root-zone-history-retry")).toBeInTheDocument();
    expect(screen.getByTestId("plant-ai-doctor-root-zone-history-continue")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-ai-doctor-live-review-start")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("retries only the root-zone query and never invokes AI Doctor", () => {
    rootZoneQuery.isError = true;
    const invoke = mount();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-root-zone-history-retry"));

    expect(rootZoneQuery.refetch).toHaveBeenCalledTimes(1);
    expect(importedHistoryRefetch).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it("continues only after explicit acknowledgement and sends no root-zone observations", async () => {
    rootZoneQuery.observations = [rootZoneObservation];
    rootZoneQuery.isError = true;
    const invoke = mount();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-root-zone-history-continue"));
    expect(screen.getByTestId("plant-ai-doctor-root-zone-history-omitted")).toHaveTextContent(
      /without recent root-zone history/i,
    );

    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));

    const request = invoke.mock.calls[0][1].body;
    expect(request.grow_id).toBe(GROW_ID);
    expect(request.packet).not.toHaveProperty("recentRootZoneObservations");
    expect(screen.getByTestId("plant-ai-doctor-root-zone-history-omitted")).toBeInTheDocument();
  });

  it("includes successful rows and requests the exact plant/tent/grow context scope", async () => {
    rootZoneQuery.observations = [rootZoneObservation];
    const invoke = mount();

    expect(rootZoneQuery.useSpy).toHaveBeenCalledWith(
      {
        kind: "plant_context",
        plantId: PLANT_ID,
        tentId: TENT_ID,
        growId: GROW_ID,
      },
      AI_DOCTOR_REVIEW_PACKET_ROOT_ZONE_CAP,
    );

    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));

    expect(invoke.mock.calls[0][1].body.packet.recentRootZoneObservations).toEqual([
      {
        at: rootZoneObservation.occurredAt,
        eventType: "feeding",
        source: "manual",
        volumeMl: 700,
        inputPh: 5.9,
        inputEcMsCm: 1.4,
        outputEcMsCm: 1.8,
        runoffMl: 100,
        runoffPh: 6.1,
        runoffEcMsCm: 2,
        waterTempC: 20.5,
        nutrientLine: "flower-week-3",
        products: [{ name: "Base", amount: 2, unit: "mL/L" }],
      },
    ]);
  });
});
