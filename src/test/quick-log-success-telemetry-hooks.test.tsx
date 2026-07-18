import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickLogActivitySave } from "@/hooks/useQuickLogActivitySave";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import { buildAiDoctorQuickLogSavePayload } from "@/lib/aiDoctorManualSaveQuickLogAdapter";
import type { AiDoctorManualSaveDraftOk } from "@/lib/aiDoctorManualSaveDraft";
import { buildDiaryEnvironmentCheckDraft } from "@/lib/ecowittDiaryEnvironmentCheckRules";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const rpcMock = vi.fn();
const win = window as unknown as { gtag?: (...args: unknown[]) => void };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const manualPayload: QuickLogV2SavePayload = {
  p_target_type: "plant",
  p_target_id: "plant-1",
  p_action: "water",
  p_volume_ml: 500,
  p_note: "private grower content",
  p_temperature_c: null,
  p_humidity_pct: null,
  p_vpd_kpa: null,
  p_occurred_at: null,
  p_idempotency_key: "quick-log-idem-1",
};

beforeEach(() => {
  rpcMock.mockReset();
  win.gtag = vi.fn();
});

afterEach(() => {
  delete win.gtag;
});

function quickLogEvents() {
  return (win.gtag as ReturnType<typeof vi.fn>).mock.calls.filter(
    (call) => call[0] === "event" && call[1] === "quick_log_saved",
  );
}

function aiDoctorPayload(): QuickLogV2SavePayload {
  const draft: AiDoctorManualSaveDraftOk = {
    ok: true,
    draft: {
      event_type: "observation",
      source: "ai_doctor_check_in_manual_save",
      note: "AI Doctor receipt text",
      plant_id: "plant-1",
      tent_id: "tent-1",
      grow_id: "grow-1",
      occurred_at: "2026-07-18T12:00:00.000Z",
      details: {
        kind: "ai_doctor_check_in",
        preview_only: true,
        manual_save: true,
        deterministic_engine: true,
        no_live_ai_model: true,
        engine_version: "phase1",
        receipt_version: "v1",
        context_hash: "context-hash",
        context_provenance: {},
        limitations: [],
        engine_output: {
          summary: "Cautious summary",
          likely_issue: "Possible issue",
          confidence: 0.3,
          evidence: [],
          missing_information: [],
          immediate_action: "Observe",
          what_not_to_do: [],
          follow_up_24h: "Re-check",
          recovery_plan_3_day: "Continue logging",
          risk_level: "low",
          action_queue_suggestion_status: null,
        },
      },
    },
    idempotency_key: "ai-doctor-idempotency-1",
  };
  return buildAiDoctorQuickLogSavePayload(draft);
}

function ecowittPayload(): QuickLogV2SavePayload {
  const draft = buildDiaryEnvironmentCheckDraft({
    tentId: "tent-1",
    capturedAt: "2026-07-18T12:00:00.000Z",
    status: "accepted",
    isTestSender: true,
    invalidTest: false,
    stale: false,
    sourceLabel: "local test",
    metricRows: [
      { key: "temp_f", label: "Temperature", status: "accepted", value: 78, reason: "" },
    ],
  });
  if (!draft.eligible || !draft.rpcPayload.p_target_id) {
    throw new Error("expected eligible EcoWitt diary draft");
  }
  return {
    ...draft.rpcPayload,
    p_target_id: draft.rpcPayload.p_target_id,
  };
}

describe("useQuickLogV2Save telemetry", () => {
  it("emits once only after a fresh confirmed RPC success with explicit Quick Log intent", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "event-1", reused: false },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(
        await result.current.save(manualPayload, { telemetryIntent: "watering" }),
      ).toMatchObject({ ok: true, reused: false });
    });

    expect(quickLogEvents()).toEqual([["event", "quick_log_saved", { event_type: "water" }]]);
  });

  it("preserves closed observation and environment UI intent when RPC persistence is note", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "observation-1", reused: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "environment-1", reused: false },
        error: null,
      });
    const notePayload = { ...manualPayload, p_action: "note" as const, p_volume_ml: null };
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      await result.current.save(notePayload, { telemetryIntent: "observation" });
      await result.current.save(notePayload, { telemetryIntent: "environment" });
    });

    expect(quickLogEvents()).toEqual([
      ["event", "quick_log_saved", { event_type: "observation" }],
      ["event", "quick_log_saved", { event_type: "environment" }],
    ]);
  });

  it.each([
    ["AI Doctor", aiDoctorPayload()],
    ["EcoWitt validation diary", ecowittPayload()],
  ])("emits zero calls for a successful non-Quick-Log %s save", async (_label, payload) => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "event-1", reused: false },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      expect(await result.current.save(payload)).toMatchObject({ ok: true, reused: false });
    });

    expect(quickLogEvents()).toHaveLength(0);
  });

  it.each([
    {
      label: "rejected write",
      response: { data: null, error: { message: "write failed" } },
    },
    {
      label: "failed envelope",
      response: { data: { ok: false, reason: "save_failed" }, error: null },
    },
    {
      label: "replay",
      response: {
        data: { ok: true, grow_event_id: "event-1", reused: true },
        error: null,
      },
    },
  ])("emits zero calls for $label", async ({ response }) => {
    rpcMock.mockResolvedValueOnce(response);
    const { result } = renderHook(() => useQuickLogV2Save());

    await act(async () => {
      await result.current.save(manualPayload, { telemetryIntent: "watering" });
    });

    expect(quickLogEvents()).toHaveLength(0);
  });
});

describe("useQuickLogActivitySave telemetry", () => {
  it("emits once from the manual success branch", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "manual-1", reused: false },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogActivitySave());

    await act(async () => {
      await result.current.save({ activityId: "note", growId: "grow-1" });
    });

    expect(quickLogEvents()).toEqual([["event", "quick_log_saved", { event_type: "note" }]]);
  });

  it("emits once from the event success branch and zero for an idempotent callback", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "event-1", reused: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "event-1", reused: true },
        error: null,
      });
    const { result } = renderHook(() => useQuickLogActivitySave());
    const input = {
      activityId: "defoliation" as const,
      growId: "grow-1",
      idempotencyKey: "activity-idem-1",
    };

    await act(async () => {
      await result.current.save(input);
      await result.current.save(input);
    });

    expect(quickLogEvents()).toEqual([["event", "quick_log_saved", { event_type: "defoliation" }]]);
  });

  it("emits zero calls when either activity save branch rejects the write", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "manual failed" } })
      .mockResolvedValueOnce({ data: { ok: false }, error: null });
    const { result } = renderHook(() => useQuickLogActivitySave());

    await act(async () => {
      await result.current.save({ activityId: "note", growId: "grow-1" });
      await result.current.save({
        activityId: "training",
        growId: "grow-1",
        idempotencyKey: "activity-idem-2",
      });
    });

    expect(quickLogEvents()).toHaveLength(0);
  });
});
