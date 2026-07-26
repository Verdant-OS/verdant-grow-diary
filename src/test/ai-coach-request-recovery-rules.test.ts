import { describe, expect, it, vi } from "vitest";
import {
  buildAiCoachRequestSignature,
  resolveAiCoachPendingRequest,
  shouldRetainAiCoachPendingRequest,
  type PendingAiCoachRequest,
} from "@/lib/aiCoachRequestRecoveryRules";

const BASE_IDENTITY = {
  mode: "diagnose" as const,
  growId: "11111111-1111-4111-8111-111111111111",
  question: "What changed?",
  photo: {
    name: "leaf.jpg",
    size: 1_024,
    type: "image/jpeg",
    lastModified: 1_725_000_000_000,
  },
};

describe("AI Coach pending-request recovery rules", () => {
  it("builds a deterministic signature and changes it for every provider-relevant input", () => {
    const signature = buildAiCoachRequestSignature(BASE_IDENTITY);

    expect(buildAiCoachRequestSignature({ ...BASE_IDENTITY })).toBe(signature);
    expect(buildAiCoachRequestSignature({ ...BASE_IDENTITY, mode: "next_steps" })).not.toBe(
      signature,
    );
    expect(buildAiCoachRequestSignature({ ...BASE_IDENTITY, growId: null })).not.toBe(signature);
    expect(buildAiCoachRequestSignature({ ...BASE_IDENTITY, question: "Try again" })).not.toBe(
      signature,
    );
    expect(buildAiCoachRequestSignature({ ...BASE_IDENTITY, photo: null })).not.toBe(signature);
  });

  it("reuses the exact key for the same unresolved request and mints one for changed input", () => {
    const signature = buildAiCoachRequestSignature(BASE_IDENTITY);
    const pending: PendingAiCoachRequest = {
      signature,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      photoUrl: "https://example.invalid/signed-photo",
    };
    const createKey = vi.fn(() => "33333333-3333-4333-8333-333333333333");

    expect(resolveAiCoachPendingRequest(pending, signature, createKey)).toEqual({
      request: pending,
      reused: true,
    });
    expect(createKey).not.toHaveBeenCalled();

    expect(resolveAiCoachPendingRequest(pending, `${signature}:changed`, createKey)).toEqual({
      request: {
        signature: `${signature}:changed`,
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
      },
      reused: false,
    });
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("retains only ambiguous spend outcomes for a same-key retry", () => {
    expect(shouldRetainAiCoachPendingRequest("result_pending")).toBe(true);
    expect(shouldRetainAiCoachPendingRequest("credit_rpc")).toBe(true);
    expect(shouldRetainAiCoachPendingRequest("credit_denied")).toBe(false);
    expect(shouldRetainAiCoachPendingRequest("result_recording_failed")).toBe(false);
    expect(shouldRetainAiCoachPendingRequest("upstream_credit_exhausted")).toBe(false);
  });
});
