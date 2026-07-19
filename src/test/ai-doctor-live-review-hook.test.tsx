/**
 * useAiDoctorLiveReview — request lifecycle, fail-closed behavior, no
 * auto-retry. Uses an injected invoke seam (no real Supabase).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAiDoctorLiveReview } from "@/hooks/useAiDoctorLiveReview";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import { buildAiDoctorSessionPersistenceFailureDiagnostic } from "@/lib/aiDoctorSessionPersistenceFailureRules";
import type { Classification } from "@/lib/sensorSnapshotStatusContract";

const packet: AiDoctorReviewRequestPacket = {
  schemaVersion: 1,
  plant: { strain: "x", stage: "veg", medium: "soil", potSize: "5L" },
  readiness: { state: "strong", evidence: [], missing: [] },
  recentEvents: [],
  recentSensorSnapshot: null,
};

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_GROW_ID = "55555555-5555-4555-8555-555555555555";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const FIRST_REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const EVALUATED_AT = "2026-07-18T18:30:00.000Z";

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

describe("useAiDoctorLiveReview", () => {
  it("never auto-fires; status stays idle until start()", async () => {
    const invoke = vi.fn();
    renderHook(() => useAiDoctorLiveReview({ enabled: true, packet, invoke }));
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("transitions idle → loading → result on success", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const { result } = renderHook(() => useAiDoctorLiveReview({ enabled: true, packet, invoke }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("result"));
    expect(result.current.result?.confidence).toBe("medium");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("sends valid grow scope in a transport envelope, not in model context", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const persist = vi.fn().mockResolvedValue({ ok: true, id: "session-1" });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        growId: GROW_ID,
        invoke,
        persist,
        createRequestIdempotencyKey: () => FIRST_REQUEST_ID,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("result"));
    expect(invoke).toHaveBeenCalledWith("ai-doctor-review", {
      body: {
        packet,
        grow_id: GROW_ID,
        idempotency_key: FIRST_REQUEST_ID,
      },
    });
    expect(packet).not.toHaveProperty("grow_id");
    expect(packet).not.toHaveProperty("idempotency_key");
    await waitFor(() => expect(result.current.persistence.status).toBe("saved"));
  });

  it("persists a history-readable diagnosis and exposes the saved session id", async () => {
    const now = vi.fn(() => new Date(EVALUATED_AT));
    const invoke = vi.fn().mockImplementation(async () => {
      expect(now).toHaveBeenCalledTimes(1);
      return {
        data: { ok: true, result: validResult() },
        error: null,
      };
    });
    const persist = vi.fn().mockResolvedValue({ ok: true, id: "session-42" });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        growId: GROW_ID,
        tentId: "tent-1",
        plantId: "plant-1",
        invoke,
        persist,
        createSessionId: () => SESSION_ID,
        now,
        sensorClassification: {
          status: "usable",
          reason: "fresh_accepted",
          isHealthyEvidence: true,
          label: "Latest bridge reading accepted.",
        },
      }),
    );

    act(() => result.current.start());
    await waitFor(() =>
      expect(result.current.persistence).toEqual({
        status: "saved",
        sessionId: "session-42",
      }),
    );

    expect(persist).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        growId: GROW_ID,
        sessionId: SESSION_ID,
        tentId: "tent-1",
        plantId: "plant-1",
        analysis: validResult(),
        rawConfidence: 0.5,
        displayedConfidence: 0.5,
        diagnosis: expect.objectContaining({
          summary: validResult().summary,
          likelyIssue: validResult().likely_issue,
          confidence: 0.5,
          riskLevel: "medium",
        }),
        sensorEvidenceEvaluatedAt: EVALUATED_AT,
      }),
    );
  });

  it("surfaces a structured save failure and retries only persistence", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
      stage: "insert",
      error: { code: "42501", message: "row-level security policy rejected insert" },
      authResolution: "resolved",
      scope: { hasGrowScope: true, hasTentScope: false, hasPlantScope: true },
      fallbackMessage: "insert_failed",
    });
    const persist = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: diagnostic.safeMessage, diagnostic })
      .mockResolvedValueOnce({ ok: true, id: "session-after-retry" });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        growId: GROW_ID,
        plantId: "plant-1",
        invoke,
        persist,
        createSessionId: () => SESSION_ID,
        now: () => new Date(EVALUATED_AT),
        sensorClassification: {
          status: "stale",
          reason: "outside_stale_window",
          isHealthyEvidence: false,
          label: "Latest bridge reading is stale.",
        },
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.persistence.status).toBe("failed"));
    expect(result.current.status).toBe("result");
    expect(result.current.result?.summary).toBe(validResult().summary);
    expect(result.current.canRetrySave).toBe(true);

    act(() => result.current.retrySave());
    await waitFor(() => expect(result.current.persistence.status).toBe("saved"));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0]?.[0]).toMatchObject({
      sessionId: SESSION_ID,
      sensorEvidenceEvaluatedAt: EVALUATED_AT,
    });
    expect(persist.mock.calls[1]?.[0]).toBe(persist.mock.calls[0]?.[0]);
  });

  it("notifies history consumers after persistence even when the initiating view unmounts", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    let resolvePersist: ((value: { ok: true; id: string }) => void) | null = null;
    const persist = vi.fn(
      () =>
        new Promise<{ ok: true; id: string }>((resolve) => {
          resolvePersist = resolve;
        }),
    );
    const onPersisted = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        growId: GROW_ID,
        invoke,
        persist,
        onPersisted,
        createSessionId: () => SESSION_ID,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      resolvePersist?.({ ok: true, id: SESSION_ID });
    });

    await waitFor(() => expect(onPersisted).toHaveBeenCalledWith(SESSION_ID));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps a durable save successful when a cache-refresh callback throws", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const persist = vi.fn().mockResolvedValue({ ok: true, id: SESSION_ID });
    const onPersisted = vi.fn(() => {
      throw new Error("cache refresh failed");
    });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        growId: GROW_ID,
        invoke,
        persist,
        onPersisted,
        createSessionId: () => SESSION_ID,
      }),
    );

    act(() => result.current.start());
    await waitFor(() =>
      expect(result.current.persistence).toEqual({ status: "saved", sessionId: SESSION_ID }),
    );
    expect(result.current.canRetrySave).toBe(false);
    expect(onPersisted).toHaveBeenCalledTimes(1);
  });

  it("keeps the validated result visible when history input preparation fails", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const persist = vi.fn();
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        growId: GROW_ID,
        invoke,
        persist,
        createSessionId: () => {
          throw new Error("secure random unavailable");
        },
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.persistence.status).toBe("failed"));
    expect(result.current.status).toBe("result");
    expect(result.current.result?.summary).toBe(validResult().summary);
    expect(result.current.canRetrySave).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("keeps the result visible and classifies a thrown save failure", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const persist = vi.fn().mockRejectedValue(new Error("network request failed"));
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, growId: GROW_ID, invoke, persist }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.persistence.status).toBe("failed"));
    expect(result.current.status).toBe("result");
    if (result.current.persistence.status === "failed") {
      expect(result.current.persistence.diagnostic.category).toBe("network");
    }
  });

  it("labels persistence as skipped when a successful review has no grow scope", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const persist = vi.fn();
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, invoke, persist }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("result"));
    expect(result.current.persistence).toEqual({
      status: "skipped",
      reason: "missing_grow_scope",
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("fails closed on HTTP error (no raw error exposed)", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const { result } = renderHook(() => useAiDoctorLiveReview({ enabled: true, packet, invoke }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reason).toBe("http");
    expect(result.current.result).toBeNull();
  });

  it("fails closed when server returns contract-invalid content", async () => {
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
    const { result } = renderHook(() => useAiDoctorLiveReview({ enabled: true, packet, invoke }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reason).toBe("invalid");
  });

  it("fails closed on missing-config envelope", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ data: { ok: false, reason: "config" }, error: null });
    const { result } = renderHook(() => useAiDoctorLiveReview({ enabled: true, packet, invoke }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reason).toBe("config");
  });

  it("retry() runs once per call — no auto-retry loop", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useAiDoctorLiveReview({ enabled: true, packet, invoke }));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(invoke).toHaveBeenCalledTimes(1);
    // Give any (forbidden) auto-retry timer a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(invoke).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  });

  it("reuses one request UUID after an invoke error, then retires it on success", async () => {
    const createRequestIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(FIRST_REQUEST_ID)
      .mockReturnValueOnce(SECOND_REQUEST_ID);
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "response lost" } })
      .mockResolvedValue({ data: { ok: true, result: validResult() }, error: null });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        invoke,
        createRequestIdempotencyKey,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("result"));

    expect(createRequestIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map((call) => call[1].body.idempotency_key)).toEqual([
      FIRST_REQUEST_ID,
      FIRST_REQUEST_ID,
    ]);

    act(() => result.current.retry());
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
    expect(invoke.mock.calls[2]?.[1].body.idempotency_key).toBe(SECOND_REQUEST_ID);
  });

  it("reuses the request UUID after a thrown invoke", async () => {
    const createRequestIdempotencyKey = vi.fn(() => FIRST_REQUEST_ID);
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error("network disconnected"))
      .mockResolvedValueOnce({ data: { ok: true, result: validResult() }, error: null });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        invoke,
        createRequestIdempotencyKey,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("result"));

    expect(createRequestIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map((call) => call[1].body.idempotency_key)).toEqual([
      FIRST_REQUEST_ID,
      FIRST_REQUEST_ID,
    ]);
  });

  it("freezes evidence time and persistence context across a delayed ambiguous retry", async () => {
    let currentTime = EVALUATED_AT;
    const now = vi.fn(() => new Date(currentTime));
    const sensorClassification = {
      status: "usable",
      reason: "fresh_accepted",
      isHealthyEvidence: true,
      label: "Latest bridge reading accepted.",
    } as const;
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "response lost" } })
      .mockResolvedValueOnce({ data: { ok: true, result: validResult() }, error: null });
    const persist = vi.fn().mockResolvedValue({ ok: true, id: SESSION_ID });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        growId: GROW_ID,
        tentId: "tent-a",
        plantId: "plant-a",
        sensorClassification,
        invoke,
        persist,
        createRequestIdempotencyKey: () => FIRST_REQUEST_ID,
        createSessionId: () => SESSION_ID,
        now,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    currentTime = "2026-07-19T02:45:00.000Z";
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.persistence.status).toBe("saved"));

    expect(now).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map((call) => call[1].body.idempotency_key)).toEqual([
      FIRST_REQUEST_ID,
      FIRST_REQUEST_ID,
    ]);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        growId: GROW_ID,
        tentId: "tent-a",
        plantId: "plant-a",
        sensorEvidence: sensorClassification,
        sensorEvidenceEvaluatedAt: EVALUATED_AT,
      }),
    );
  });

  it("reuses the request UUID after a client-invalid success payload", async () => {
    const createRequestIdempotencyKey = vi.fn(() => FIRST_REQUEST_ID);
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: true, result: { ...validResult(), immediate_action: "Turn on the pump." } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, result: validResult() }, error: null });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        invoke,
        createRequestIdempotencyKey,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.reason).toBe("invalid"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("result"));

    expect(createRequestIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map((call) => call[1].body.idempotency_key)).toEqual([
      FIRST_REQUEST_ID,
      FIRST_REQUEST_ID,
    ]);
  });

  it("reuses a pending-result UUID so retry can recover the cached response", async () => {
    const createRequestIdempotencyKey = vi.fn(() => FIRST_REQUEST_ID);
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: false, reason: "result_pending" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, result: validResult() }, error: null });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        invoke,
        createRequestIdempotencyKey,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.reason).toBe("result_pending"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("result"));

    expect(createRequestIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map((call) => call[1].body.idempotency_key)).toEqual([
      FIRST_REQUEST_ID,
      FIRST_REQUEST_ID,
    ]);
  });

  it("retains the request UUID for an unknown explicit server failure reason", async () => {
    const createRequestIdempotencyKey = vi.fn(() => FIRST_REQUEST_ID);
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: false, reason: "newer_server_reason" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, result: validResult() }, error: null });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        invoke,
        createRequestIdempotencyKey,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.reason).toBe("invalid"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("result"));

    expect(createRequestIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map((call) => call[1].body.idempotency_key)).toEqual([
      FIRST_REQUEST_ID,
      FIRST_REQUEST_ID,
    ]);
  });

  it("never pairs a retained key with rerendered grow, packet, or evidence context", async () => {
    interface HookProps {
      activePacket: AiDoctorReviewRequestPacket;
      activeGrowId: string;
      activeTentId: string;
      activePlantId: string;
      activeSensor: Classification;
    }
    const otherPacket: AiDoctorReviewRequestPacket = {
      ...packet,
      plant: { ...packet.plant, strain: "different-scope" },
    };
    const initialSensorClassification = {
      status: "stale",
      reason: "outside_stale_window",
      isHealthyEvidence: false,
      label: "Initial scope evidence.",
    } as const;
    const otherSensorClassification = {
      status: "usable",
      reason: "fresh_accepted",
      isHealthyEvidence: true,
      label: "Other scope evidence.",
    } as const;
    const now = vi.fn(() => new Date(EVALUATED_AT));
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "response lost" } })
      .mockResolvedValueOnce({ data: { ok: true, result: validResult() }, error: null });
    const persist = vi.fn().mockResolvedValue({ ok: true, id: SESSION_ID });
    const createRequestIdempotencyKey = vi.fn(() => FIRST_REQUEST_ID);
    const { result, rerender } = renderHook(
      ({ activePacket, activeGrowId, activeTentId, activePlantId, activeSensor }: HookProps) =>
        useAiDoctorLiveReview({
          enabled: true,
          packet: activePacket,
          growId: activeGrowId,
          tentId: activeTentId,
          plantId: activePlantId,
          sensorClassification: activeSensor,
          invoke,
          persist,
          createRequestIdempotencyKey,
          createSessionId: () => SESSION_ID,
          now,
        }),
      {
        initialProps: {
          activePacket: packet,
          activeGrowId: GROW_ID,
          activeTentId: "tent-a",
          activePlantId: "plant-a",
          activeSensor: initialSensorClassification,
        },
      },
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    rerender({
      activePacket: otherPacket,
      activeGrowId: OTHER_GROW_ID,
      activeTentId: "tent-b",
      activePlantId: "plant-b",
      activeSensor: otherSensorClassification,
    });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.persistence.status).toBe("saved"));

    expect(createRequestIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map((call) => call[1].body)).toEqual([
      { packet, grow_id: GROW_ID, idempotency_key: FIRST_REQUEST_ID },
      { packet, grow_id: GROW_ID, idempotency_key: FIRST_REQUEST_ID },
    ]);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        growId: GROW_ID,
        tentId: "tent-a",
        plantId: "plant-a",
        sensorEvidence: initialSensorClassification,
        sensorEvidenceEvaluatedAt: EVALUATED_AT,
      }),
    );
  });

  it("retires a refunded result-recording failure before a manual retry", async () => {
    const createRequestIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce(FIRST_REQUEST_ID)
      .mockReturnValueOnce(SECOND_REQUEST_ID);
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: false, reason: "result_recording_failed" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, result: validResult() }, error: null });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({
        enabled: true,
        packet,
        invoke,
        createRequestIdempotencyKey,
      }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.reason).toBe("result_recording_failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("result"));

    expect(createRequestIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.map((call) => call[1].body.idempotency_key)).toEqual([
      FIRST_REQUEST_ID,
      SECOND_REQUEST_ID,
    ]);
  });

  it("fails closed before invoke when request UUID generation throws or returns invalid data", async () => {
    for (const createRequestIdempotencyKey of [
      vi.fn(() => "invalid"),
      vi.fn(() => {
        throw new Error("secure random unavailable");
      }),
    ]) {
      const invoke = vi.fn();
      const { result, unmount } = renderHook(() =>
        useAiDoctorLiveReview({
          enabled: true,
          packet,
          invoke,
          createRequestIdempotencyKey,
        }),
      );

      act(() => result.current.start());
      await waitFor(() => expect(result.current.reason).toBe("invalid"));
      expect(result.current.result).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("is inert when disabled or packet is null", async () => {
    const invoke = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled, p }: { enabled: boolean; p: typeof packet | null }) =>
        useAiDoctorLiveReview({ enabled, packet: p, invoke }),
      { initialProps: { enabled: false, p: packet } },
    );
    act(() => result.current.start());
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();

    rerender({ enabled: true, p: null });
    act(() => result.current.start());
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();
  });
});
