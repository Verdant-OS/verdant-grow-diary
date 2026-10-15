import { cleanup, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { PropsWithChildren, ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const GROW_B = "55555555-5555-4555-8555-555555555555";
const TENT_A = "22222222-2222-4222-8222-222222222222";
const TENT_B = "66666666-6666-4666-8666-666666666666";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";

const testState = vi.hoisted(() => ({
  user: { id: "44444444-4444-4444-8444-444444444444" } as { id: string } | null,
  authLoading: false,
  entitlementLoading: false,
  entitlementLookupFailed: false,
  entitlement: {
    displayPlanId: "free",
    effectivePlanId: "free",
    status: "active",
    isActive: true,
    capabilities: {
      maxActiveGrows: 1 as number | null,
      aiCreditsPerGrow: 3 as number | null,
      aiMonthlyCredits: 0,
      liveSensors: false,
      advancedExports: false,
      multiTent: false,
      sensorHistoryDays: 90 as number | null,
      prioritySupport: false,
      blueprint: false,
    },
    degraded: false,
    degradedReason: "null_row_free" as string | null,
    isStaff: false,
    source: "free",
  },
  spendsData: [] as Array<{ weight: number | null; funded_by: string | null }>,
  spendsError: null as Record<string, unknown> | null,
  spendsPendingPromise: null as Promise<{
    data: Array<{ weight: number | null; funded_by: string | null }>;
    error: Record<string, unknown> | null;
  }> | null,
  grantsData: [] as Array<{ credits: number | null; expires_at: string | null }>,
  grantsError: null as Record<string, unknown> | null,
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  grows: [] as Array<Record<string, unknown>>,
  timelineItems: [] as TimelineMemoryItem[],
  calibrationRequests: 0,
  calibrationData: [] as unknown[],
  calibrationError: null as Record<string, unknown> | null,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: testState.user,
    session: null,
    loading: testState.authLoading,
    signOut: async () => {},
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: testState.entitlementLoading,
    lookupFailed: testState.entitlementLookupFailed,
    entitlement: testState.entitlement,
    refetch: async () => false,
  }),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: testState.plants,
    isLoading: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
  useGrowTents: () => ({
    data: testState.tents,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: testState.grows,
    loading: false,
    error: null,
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: testState.timelineItems, isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

vi.mock("@/hooks/useImportedSensorHistory", () => ({
  useImportedSensorHistory: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => ({
    byTent: Object.fromEntries(tentIds.map((id) => [id, []])),
    statusByTent: Object.fromEntries(tentIds.map((id) => [id, "success"])),
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: () => ({
    observations: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "soil_moisture_calibrations") {
        testState.calibrationRequests += 1;
        const query = {
          select: () => query,
          eq: () => query,
          order: () =>
            Promise.resolve({
              data: testState.calibrationData,
              error: testState.calibrationError,
            }),
        };
        return query;
      }
      if (table === "ai_credit_spends") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          then: (resolve: (val: unknown) => unknown) =>
            (
              testState.spendsPendingPromise ??
              Promise.resolve({
                data: testState.spendsData,
                error: testState.spendsError,
              })
            ).then(resolve),
        };
        return chain;
      }
      if (table === "ai_credit_grants") {
        const chain = {
          select: () => chain,
          eq: () =>
            Promise.resolve({
              data: testState.grantsData,
              error: testState.grantsError,
            }),
        };
        return chain;
      }
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
    functions: { invoke: vi.fn() },
  },
}));

import AiDoctorStart from "@/pages/AiDoctorStart";
import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";
import { useSoilMoistureCalibrations } from "@/hooks/useSoilMoistureCalibrations";

const snapshotCard = (when: string): ManualSnapshotTimelineCard =>
  ({
    id: "snap-1",
    title: "Manual sensor snapshot",
    capturedAt: when,
    sourceLabel: "Manual",
    source: "manual",
    tentId: TENT_A,
    plantId: PLANT_ID,
    isTentLevel: false,
    notes: null,
    readings: [],
    severity: "ok",
    warnings: [],
  }) as unknown as ManualSnapshotTimelineCard;

const strongPlant = {
  id: PLANT_ID,
  name: "QA Test",
  strain: "Northern Lights Auto",
  stage: "flower",
  medium: "coco",
  photo: "https://example.test/plant.jpg",
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
  ];
}

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(
    <MemoryRouter initialEntries={["/doctor"]}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderCalibrationHook(queryClient: QueryClient, tentId: string) {
  return renderHook(() => useSoilMoistureCalibrations({ growId: GROW_ID, tentId }), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("PR #2193 review fixes (#2161 & #2009)", () => {
  beforeEach(() => {
    testState.user = { id: "44444444-4444-4444-8444-444444444444" };
    testState.authLoading = false;
    testState.entitlementLoading = false;
    testState.entitlementLookupFailed = false;
    testState.entitlement = {
      displayPlanId: "free",
      effectivePlanId: "free",
      status: "active",
      isActive: true,
      capabilities: { ...FREE_CAPABILITIES },
      degraded: false,
      degradedReason: "null_row_free",
      isStaff: false,
      source: "free",
    };
    testState.spendsData = [];
    testState.spendsError = null;
    testState.spendsPendingPromise = null;
    testState.grantsData = [];
    testState.grantsError = null;
    testState.plants = [{ id: PLANT_ID, name: "QA Test", stage: "flower", tentId: TENT_A }];
    testState.tents = [{ id: TENT_A, name: "QA Test", grow_id: GROW_ID }];
    testState.grows = [{ id: GROW_ID, name: "QA Test" }];
    testState.timelineItems = strongTimeline();
    testState.calibrationRequests = 0;
    testState.calibrationData = [];
    testState.calibrationError = null;
  });

  afterEach(() => cleanup());

  it("hides Free-plan copy and balance while entitlement is still loading (Codex P2 #1)", () => {
    testState.entitlementLoading = true;

    renderWithQueryClient(
      <PlantDetailAiDoctorLiveReview
        plantId={PLANT_ID}
        plant={strongPlant}
        growId={GROW_ID}
        tentId={TENT_A}
        invoke={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("plant-ai-doctor-live-review-free-credit-note")).toBeNull();
    expect(screen.queryByTestId("plant-ai-doctor-live-review-credit-remaining")).toBeNull();
    cleanup();

    rtlRender(
      <MemoryRouter initialEntries={["/doctor"]}>
        <Routes>
          <Route path="/doctor" element={<AiDoctorStart />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("ai-doctor-start-free-credit-note")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-start-credit-remaining")).toBeNull();
  });

  it("waits for grow-scoped usage before showing a balance and hides balance when /doctor has multiple grows without scope (Codex P2 #1, CodeRabbit Major #2)", async () => {
    let resolveSpends!: (value: {
      data: Array<{ weight: number | null; funded_by: string | null }>;
      error: null;
    }) => void;
    testState.spendsPendingPromise = new Promise((resolve) => {
      resolveSpends = resolve;
    });

    renderWithQueryClient(
      <PlantDetailAiDoctorLiveReview
        plantId={PLANT_ID}
        plant={strongPlant}
        growId={GROW_ID}
        tentId={TENT_A}
        invoke={vi.fn()}
      />,
    );

    expect(screen.getByTestId("plant-ai-doctor-live-review-free-credit-note")).toHaveTextContent(
      "Free plan includes 3 AI Doctor credits per grow.",
    );
    expect(screen.queryByTestId("plant-ai-doctor-live-review-credit-remaining")).toBeNull();

    resolveSpends({
      data: [{ weight: 3, funded_by: "allowance" }],
      error: null,
    });

    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-credit-remaining")).toHaveTextContent(
        "0 of 3 AI Doctor credits left for this grow",
      ),
    );
    cleanup();

    testState.spendsPendingPromise = null;
    testState.grows = [
      { id: GROW_ID, name: "Grow A" },
      { id: GROW_B, name: "Grow B" },
    ];

    rtlRender(
      <MemoryRouter initialEntries={["/doctor"]}>
        <Routes>
          <Route path="/doctor" element={<AiDoctorStart />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("ai-doctor-start-free-credit-note")).toHaveTextContent(
      "Free plan includes 3 AI Doctor credits per grow.",
    );
    expect(screen.queryByTestId("ai-doctor-start-credit-remaining")).toBeNull();
  });

  it("includes an honest pack-credit indicator when a Free grower owns unexpired pack credits on both surfaces (Codex P2 #2)", async () => {
    testState.spendsData = [{ weight: 3, funded_by: "allowance" }];
    testState.grantsData = [{ credits: 50, expires_at: null }];

    renderWithQueryClient(
      <PlantDetailAiDoctorLiveReview
        plantId={PLANT_ID}
        plant={strongPlant}
        growId={GROW_ID}
        tentId={TENT_A}
        invoke={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-credit-remaining")).toHaveTextContent(
        "0 of 3 AI Doctor credits left for this grow · pack credits on account",
      ),
    );
    cleanup();

    rtlRender(
      <MemoryRouter initialEntries={["/doctor"]}>
        <Routes>
          <Route path="/doctor" element={<AiDoctorStart />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("ai-doctor-start-credit-remaining")).toHaveTextContent(
        "0 of 3 AI Doctor credits left for this grow · pack credits on account",
      ),
    );
  });

  it("propagates schema_unavailable to existing cached tent queries when a later tent reports PGRST205 (CodeRabbit Major #1)", async () => {
    testState.calibrationError = null;
    testState.calibrationData = [
      {
        id: "cal-1",
        grow_id: GROW_ID,
        tent_id: TENT_A,
        plant_id: null,
        device_id: "probe-1",
        dry_raw: 20,
        wet_raw: 80,
        source: "manual",
        is_active: true,
        created_at: "2026-08-15T00:00:00.000Z",
        updated_at: "2026-08-15T00:00:00.000Z",
      },
    ];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const firstTentA = renderCalibrationHook(queryClient, TENT_A);
    await waitFor(() => expect(firstTentA.result.current.availability).toBe("available"));
    expect(firstTentA.result.current.data).toHaveLength(1);
    expect(testState.calibrationRequests).toBe(1);
    firstTentA.unmount();

    testState.calibrationData = [];
    testState.calibrationError = {
      code: "PGRST205",
      message: "Could not find the table 'public.soil_moisture_calibrations' in the schema cache",
    };

    const tentB = renderCalibrationHook(queryClient, TENT_B);
    await waitFor(() => expect(tentB.result.current.availability).toBe("schema_unavailable"));
    expect(testState.calibrationRequests).toBe(2);
    tentB.unmount();

    const remountedTentA = renderCalibrationHook(queryClient, TENT_A);
    expect(remountedTentA.result.current.availability).toBe("schema_unavailable");
    expect(remountedTentA.result.current.data).toEqual([]);
    expect(testState.calibrationRequests).toBe(2);
  });
});
