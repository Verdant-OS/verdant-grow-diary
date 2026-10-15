import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
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
  grantsData: [] as Array<{ credits: number | null; expires_at: string | null }>,
  grantsError: null as Record<string, unknown> | null,
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  grows: [] as Array<Record<string, unknown>>,
  timelineItems: [] as TimelineMemoryItem[],
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
      if (table === "ai_credit_spends") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          then: (resolve: (val: unknown) => unknown) =>
            Promise.resolve({
              data: testState.spendsData,
              error: testState.spendsError,
            }).then(resolve),
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
import PlantDetailAiDoctorLiveReview, {
  AI_DOCTOR_LIVE_REVIEW_UNAVAILABLE_COPY,
} from "@/components/PlantDetailAiDoctorLiveReview";

const snapshotCard = (when: string): ManualSnapshotTimelineCard =>
  ({
    id: "snap-1",
    title: "Manual sensor snapshot",
    capturedAt: when,
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

const validResult = () => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium",
  evidence: ["Tent temp 29C"],
  missing_information: ["No recent VPD snapshot"],
  possible_causes: ["High tent temperature"],
  immediate_action: "Lower tent temperature toward target range.",
  what_not_to_do: "Avoid increasing nutrient strength right now.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold feed schedule, monitor canopy daily.",
  risk_level: "watch",
});

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

describe("AI Doctor surface credit balance and Free 3-credit text (#2161)", () => {
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
      degradedReason: "null_row_free",
      isStaff: false,
      source: "free",
    };
    testState.spendsData = [];
    testState.spendsError = null;
    testState.grantsData = [];
    testState.grantsError = null;
    testState.plants = [{ id: PLANT_ID, name: "QA Test", stage: "flower", tentId: TENT_ID }];
    testState.tents = [{ id: TENT_ID, name: "QA Test", grow_id: GROW_ID }];
    testState.grows = [{ id: GROW_ID, name: "QA Test" }];
    testState.timelineItems = strongTimeline();
  });

  afterEach(() => cleanup());

  it("shows the AI credit balance and Free 3-credit text on PlantDetailAiDoctorLiveReview before running and when unavailable", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: false, reason: "config" },
      error: null,
    });

    renderWithQueryClient(
      <PlantDetailAiDoctorLiveReview
        plantId={PLANT_ID}
        plant={strongPlant}
        growId={GROW_ID}
        tentId={TENT_ID}
        invoke={invoke}
      />,
    );

    const badgeBefore = await screen.findByTestId("plant-ai-doctor-live-review-credit-remaining");
    expect(badgeBefore).toHaveTextContent("3 of 3 AI Doctor credits left for this grow");
    const freeNoteBefore = screen.getByTestId("plant-ai-doctor-live-review-free-credit-note");
    expect(freeNoteBefore).toHaveTextContent("Free plan includes 3 AI Doctor credits per grow.");

    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));

    const failure = await screen.findByTestId("plant-ai-doctor-live-review-failure");
    expect(failure).toHaveTextContent(AI_DOCTOR_LIVE_REVIEW_UNAVAILABLE_COPY);
    expect(screen.getByTestId("plant-ai-doctor-live-review-credit-remaining")).toHaveTextContent(
      "3 of 3 AI Doctor credits left for this grow",
    );
    expect(screen.getByTestId("plant-ai-doctor-live-review-free-credit-note")).toHaveTextContent(
      "Free plan includes 3 AI Doctor credits per grow.",
    );
  });

  it("reflects recorded per-grow allowance usage in the AI Doctor live review credit balance", async () => {
    testState.spendsData = [
      { weight: 1, funded_by: "allowance" },
      { weight: 1, funded_by: "pack" },
    ];
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: false, reason: "config" },
      error: null,
    });

    renderWithQueryClient(
      <PlantDetailAiDoctorLiveReview
        plantId={PLANT_ID}
        plant={strongPlant}
        growId={GROW_ID}
        tentId={TENT_ID}
        invoke={invoke}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-credit-remaining")).toHaveTextContent(
        "2 of 3 AI Doctor credits left for this grow",
      ),
    );
    expect(screen.getByTestId("plant-ai-doctor-live-review-free-credit-note")).toHaveTextContent(
      "Free plan includes 3 AI Doctor credits per grow.",
    );
  });

  it("updates the balance from the post-spend receipt on success while retaining the Free 3-credit text", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        result: validResult(),
        credit: {
          plan_id: "free",
          remaining: 1,
          scope: "per_grow",
          scope_limit: 3,
        },
      },
      error: null,
    });

    renderWithQueryClient(
      <PlantDetailAiDoctorLiveReview
        plantId={PLANT_ID}
        plant={strongPlant}
        growId={GROW_ID}
        tentId={TENT_ID}
        invoke={invoke}
      />,
    );

    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));

    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-credit-remaining")).toHaveTextContent(
        "1 of 3 AI Doctor credits left for this grow",
      ),
    );
    expect(screen.getByTestId("plant-ai-doctor-live-review-free-credit-note")).toHaveTextContent(
      "Free plan includes 3 AI Doctor credits per grow.",
    );
  });

  it("hides the Free 3-credit text for an active paid subscriber", () => {
    testState.entitlement = {
      displayPlanId: "pro_monthly",
      effectivePlanId: "pro_monthly",
      status: "active",
      isActive: true,
      capabilities: {
        ...FREE_CAPABILITIES,
        aiCreditsPerGrow: null,
        aiMonthlyCredits: 100,
      },
      degraded: false,
      degradedReason: null,
      isStaff: false,
      source: "lovable_paddle_subscription",
    };

    renderWithQueryClient(
      <PlantDetailAiDoctorLiveReview
        plantId={PLANT_ID}
        plant={strongPlant}
        growId={GROW_ID}
        tentId={TENT_ID}
        invoke={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("plant-ai-doctor-live-review-free-credit-note")).toBeNull();
  });

  it("shows the AI credit balance and Free 3-credit text on /doctor (AiDoctorStart)", async () => {
    testState.spendsData = [{ weight: 1, funded_by: null }];

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
    await waitFor(() =>
      expect(screen.getByTestId("ai-doctor-start-credit-remaining")).toHaveTextContent(
        "2 of 3 AI Doctor credits left for this grow",
      ),
    );
  });
});
