/**
 * PlantDetailAiDoctorLiveReview — gating, loading, success, failure states.
 * No real Supabase calls; useTimelineMemory + invoke are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

const trackFunnelEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = rtlRender(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, queryClient: client };
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

import PlantDetailAiDoctorLiveReview, {
  AI_DOCTOR_HISTORY_SAVED_COPY,
  AI_DOCTOR_HISTORY_SAVE_FAILED_COPY,
  AI_DOCTOR_LIVE_REVIEW_LOADING_COPY,
  AI_DOCTOR_LIVE_REVIEW_FAILURE_COPY,
  AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL,
} from "@/components/PlantDetailAiDoctorLiveReview";
import { buildAiDoctorSessionPersistenceFailureDiagnostic } from "@/lib/aiDoctorSessionPersistenceFailureRules";

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

describe("PlantDetailAiDoctorLiveReview", () => {
  beforeEach(() => {
    cleanup();
    itemsRef.current = [];
    trackFunnelEvent.mockClear();
  });

  it("renders nothing for insufficient readiness", () => {
    itemsRef.current = [];
    render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={{ ...strongPlant, photo: null, strain: null, stage: null, medium: null }}
        invoke={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("plant-ai-doctor-live-review")).toBeNull();
  });

  it("shows loading copy, validated label, and result on success", async () => {
    itemsRef.current = strongTimeline();
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    render(<PlantDetailAiDoctorLiveReview plantId="p1" plant={strongPlant} invoke={invoke} />);
    const root = await screen.findByTestId("plant-ai-doctor-live-review");
    expect(root).toBeTruthy();
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-start"));
    expect(screen.getByTestId("plant-ai-doctor-live-review-loading").textContent).toBe(
      AI_DOCTOR_LIVE_REVIEW_LOADING_COPY,
    );
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-validated-label").textContent).toBe(
        AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL,
      ),
    );
    expect(screen.getByTestId("plant-detail-live-ai-doctor-review-result-preview")).toBeTruthy();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_doctor_review_started", {
      surface: "standard",
    });
    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_doctor_result_received", {
      surface: "standard",
    });
    // No approve/reject buttons rendered.
    expect(screen.queryByText(/approve/i)).toBeNull();
    expect(screen.queryByText(/reject/i)).toBeNull();
  });

  it("shows a durable saved-history receipt and links the exact session", async () => {
    itemsRef.current = strongTimeline();
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const persist = vi.fn().mockResolvedValue({ ok: true, id: "session-42" });
    const { queryClient } = render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={strongPlant}
        growId="g1"
        tentId="t1"
        invoke={invoke}
        persist={persist}
      />,
    );
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));

    const receipt = await screen.findByTestId("plant-ai-doctor-history-saved");
    expect(receipt).toHaveTextContent(AI_DOCTOR_HISTORY_SAVED_COPY);
    expect(screen.getByTestId("plant-ai-doctor-history-saved-link")).toHaveAttribute(
      "href",
      "/doctor/sessions/session-42",
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_doctor_session_saved", {
      surface: "standard",
    });
    expect(
      trackFunnelEvent.mock.calls.filter(([name]) =>
        [
          "ai_doctor_review_started",
          "ai_doctor_result_received",
          "ai_doctor_session_saved",
        ].includes(name),
      ),
    ).toEqual([
      ["ai_doctor_review_started", { surface: "standard" }],
      ["ai_doctor_result_received", { surface: "standard" }],
      ["ai_doctor_session_saved", { surface: "standard" }],
    ]);
    expect(screen.getByTestId("plant-detail-live-ai-doctor-review-result-preview")).toBeTruthy();
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["ai_doctor_sessions"] });
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["timeline_memory"] });
    });
  });

  it("does not count a result that becomes ineligible before it can be displayed", async () => {
    itemsRef.current = strongTimeline();
    let resolveInvoke: ((value: { data: unknown; error: null }) => void) | null = null;
    const invoke = vi.fn(
      () =>
        new Promise<{ data: unknown; error: null }>((resolve) => {
          resolveInvoke = resolve;
        }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = rtlRender(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <PlantDetailAiDoctorLiveReview plantId="p1" plant={strongPlant} invoke={invoke} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
    itemsRef.current = [];
    view.rerender(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <PlantDetailAiDoctorLiveReview
            plantId="p1"
            plant={{ ...strongPlant, photo: null, strain: null, stage: null, medium: null }}
            invoke={invoke}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await act(async () => {
      resolveInvoke?.({ data: { ok: true, result: validResult() }, error: null });
    });

    await waitFor(() => expect(screen.queryByTestId("plant-ai-doctor-live-review")).toBeNull());
    expect(trackFunnelEvent).not.toHaveBeenCalledWith(
      "ai_doctor_result_received",
      expect.anything(),
    );
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("ai_doctor_session_saved", expect.anything());
  });

  it("keeps the result visible, warns on save failure, and retries without rerunning AI", async () => {
    itemsRef.current = strongTimeline();
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
      stage: "insert",
      error: { code: "42501", message: "row-level security rejected insert" },
      authResolution: "resolved",
      scope: { hasGrowScope: true, hasTentScope: true, hasPlantScope: true },
      fallbackMessage: "insert_failed",
    });
    const persist = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: diagnostic.safeMessage, diagnostic })
      .mockResolvedValueOnce({ ok: true, id: "session-after-retry" });
    render(
      <PlantDetailAiDoctorLiveReview
        plantId="p1"
        plant={strongPlant}
        growId="g1"
        tentId="t1"
        invoke={invoke}
        persist={persist}
      />,
    );

    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));

    const warning = await screen.findByTestId("plant-ai-doctor-history-save-failed");
    expect(warning).toHaveTextContent(AI_DOCTOR_HISTORY_SAVE_FAILED_COPY);
    expect(warning).toHaveAttribute("data-failure-category", "rls");
    expect(screen.getByTestId("plant-detail-live-ai-doctor-review-result-preview")).toBeTruthy();

    fireEvent.click(screen.getByTestId("plant-ai-doctor-history-save-retry"));
    expect(await screen.findByTestId("plant-ai-doctor-history-saved-link")).toHaveAttribute(
      "href",
      "/doctor/sessions/session-after-retry",
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(
      trackFunnelEvent.mock.calls.filter(([name]) => name === "ai_doctor_session_saved"),
    ).toEqual([["ai_doctor_session_saved", { surface: "standard" }]]);
  });

  it("shows calm failure copy and offers a single manual retry on error", async () => {
    itemsRef.current = strongTimeline();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } })
      .mockResolvedValueOnce({
        data: { ok: true, result: validResult() },
        error: null,
      });
    render(<PlantDetailAiDoctorLiveReview plantId="p1" plant={strongPlant} invoke={invoke} />);
    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-failure").textContent).toBe(
        AI_DOCTOR_LIVE_REVIEW_FAILURE_COPY,
      ),
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    // Confirm no auto-retry has happened.
    await new Promise((r) => setTimeout(r, 60));
    expect(invoke).toHaveBeenCalledTimes(1);
    // Manual retry → eventual result.
    fireEvent.click(screen.getByTestId("plant-ai-doctor-live-review-retry"));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-validated-label")).toBeTruthy(),
    );
  });

  it("falls into calm failure when server returns contract-invalid content", async () => {
    itemsRef.current = strongTimeline();
    const invoke = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        result: {
          ...validResult(),
          immediate_action: "Turn on the humidifier.",
        },
      },
      error: null,
    });
    render(<PlantDetailAiDoctorLiveReview plantId="p1" plant={strongPlant} invoke={invoke} />);
    fireEvent.click(await screen.findByTestId("plant-ai-doctor-live-review-start"));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-live-review-failure")).toBeTruthy(),
    );
    // No raw imperative text leaked.
    expect(screen.queryByText(/Turn on the humidifier/i)).toBeNull();
    expect(trackFunnelEvent).not.toHaveBeenCalledWith(
      "ai_doctor_result_received",
      expect.anything(),
    );
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("ai_doctor_session_saved", expect.anything());
  });
});
