/**
 * useAiDoctorLiveReview — request lifecycle, fail-closed behavior, no
 * auto-retry. Uses an injected invoke seam (no real Supabase).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAiDoctorLiveReview,
} from "@/hooks/useAiDoctorLiveReview";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";

const packet: AiDoctorReviewRequestPacket = {
  schemaVersion: 1,
  plant: { strain: "x", stage: "veg", medium: "soil", potSize: "5L" },
  readiness: { state: "strong", evidence: [], missing: [] },
  recentEvents: [],
  recentSensorSnapshot: null,
};

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
    renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, invoke }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("transitions idle → loading → result on success", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, result: validResult() },
      error: null,
    });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, invoke }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("result"));
    expect(result.current.result?.confidence).toBe("medium");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("fails closed on HTTP error (no raw error exposed)", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, invoke }),
    );
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
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, invoke }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reason).toBe("invalid");
  });

  it("fails closed on missing-config envelope", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ data: { ok: false, reason: "config" }, error: null });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, invoke }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reason).toBe("config");
  });

  it("retry() runs once per call — no auto-retry loop", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() =>
      useAiDoctorLiveReview({ enabled: true, packet, invoke }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(invoke).toHaveBeenCalledTimes(1);
    // Give any (forbidden) auto-retry timer a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(invoke).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
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
