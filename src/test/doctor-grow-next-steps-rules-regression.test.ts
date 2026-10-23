/**
 * Supplementary pure-rule regression for #2368 (grow-level next steps on /doctor).
 *
 * Complements doctor-grow-next-steps.test.tsx: pins classifyDoctorNextStepsResponse
 * and resolveDoctorGrowNextStepsTarget edge paths that are easy to break with a
 * one-line change but are not all asserted in the integration file.
 */
import { describe, expect, it } from "vitest";
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";
import {
  classifyDoctorNextStepsResponse,
  resolveDoctorGrowNextStepsTarget,
} from "@/lib/doctorGrowNextStepsRules";

const SAMPLE_CREDIT_DENIAL: AiCreditDenial = {
  ok: false,
  status: "denied",
  reason: "limit_reached",
  scope: "per_grow",
  plan_id: "free",
  remaining: 0,
};

describe("resolveDoctorGrowNextStepsTarget regression (#2368)", () => {
  const grows = [
    { id: "carried", name: "Carried Grow" },
    { id: "active", name: "Active Grow" },
  ];

  it("returns null while carried scope is unresolved even when ids would match", () => {
    expect(
      resolveDoctorGrowNextStepsTarget({
        grows,
        growsLoading: false,
        growsError: null,
        carriedScopeUnresolved: true,
        carriedGrowId: "carried",
        activeGrowId: "active",
      }),
    ).toBeNull();
  });
});

describe("classifyDoctorNextStepsResponse regression (#2368)", () => {
  it("treats server empty as empty, not failed", () => {
    expect(
      classifyDoctorNextStepsResponse({
        ok: true,
        result: { empty: true, analysis: { summary: "ignored when empty" } },
      }),
    ).toEqual({ kind: "empty" });
  });

  it("maps credit denial and upstream exhaustion to distinct outcomes", () => {
    expect(
      classifyDoctorNextStepsResponse({
        ok: false,
        reason: "credit_denied",
        credit: SAMPLE_CREDIT_DENIAL,
      }),
    ).toEqual({
      kind: "credit_denied",
      credit: SAMPLE_CREDIT_DENIAL,
    });
    expect(
      classifyDoctorNextStepsResponse({
        ok: false,
        reason: "upstream_credit_exhausted",
      }),
    ).toEqual({ kind: "upstream_exhausted" });
  });

  it("retains pending for recoverable ai-coach reasons", () => {
    for (const reason of ["result_pending", "credit_rpc"] as const) {
      expect(classifyDoctorNextStepsResponse({ ok: false, reason })).toEqual({
        kind: "pending",
      });
    }
  });

  it("preserves risk_level unknown and sparse confidence capping", () => {
    const outcome = classifyDoctorNextStepsResponse({
      ok: true,
      result: {
        sparse: true,
        analysis: {
          summary: "Thin logs.",
          confidence: "high",
          risk_level: "unknown",
          recommended_actions: [],
          do_not_do: [],
        },
      },
    });
    expect(outcome).toMatchObject({
      kind: "result",
      analysis: {
        summary: "Thin logs.",
        confidence: "low",
        sparse: true,
        riskLevel: "unknown",
      },
    });
  });
});
