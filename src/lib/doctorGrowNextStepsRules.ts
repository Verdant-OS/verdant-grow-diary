/**
 * Pure rules for the grow-level "Next steps" card on /doctor.
 *
 * Owner decision (2026-10-22): next steps run at GROW scope for the grower's
 * current grow, which is named on screen. A plant is never chosen implicitly;
 * plant reviews keep their explicit choice. No React, no Supabase, no clock.
 */
import type { AiCreditedOutcome } from "@/lib/aiCreditedResponseAdapter";
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";
import { shouldRetainAiCoachPendingRequest } from "@/lib/aiCoachRequestRecoveryRules";
import { DOCTOR_GROW_NEXT_STEPS_FALLBACK_GROW_NAME } from "@/constants/doctorGrowNextStepsCopy";

export interface DoctorGrowNextStepsGrow {
  id: string;
  name?: string | null;
}

export interface DoctorGrowNextStepsTarget {
  growId: string;
  growName: string;
}

/**
 * Which grow the card offers next steps for, or null when none can be named.
 *
 * A pending or failed grows read yields null: an unknown answer is never
 * presented as "no grow". A validated carried grow (from the page's URL scope)
 * wins over the stored active grow so the card matches the page's context.
 * While a carried scope is still being checked, or its check failed, there is
 * no target: falling back to the active grow would spend a credit on a grow
 * the link did not ask for.
 */
export function resolveDoctorGrowNextStepsTarget(input: {
  grows: readonly DoctorGrowNextStepsGrow[] | null | undefined;
  growsLoading: boolean;
  growsError: unknown;
  carriedScopeUnresolved?: boolean;
  carriedGrowId?: string | null;
  activeGrowId?: string | null;
}): DoctorGrowNextStepsTarget | null {
  if (input.growsLoading || input.growsError || input.carriedScopeUnresolved) return null;
  const grows = input.grows ?? [];
  const find = (id: string | null | undefined) => {
    const wanted = (id ?? "").trim();
    return wanted ? (grows.find((g) => g.id === wanted) ?? null) : null;
  };
  const grow = find(input.carriedGrowId) ?? find(input.activeGrowId);
  if (!grow) return null;
  const name = (grow.name ?? "").trim();
  return { growId: grow.id, growName: name || DOCTOR_GROW_NEXT_STEPS_FALLBACK_GROW_NAME };
}

export interface DoctorNextStepsAnalysis {
  summary: string;
  confidence: string | null;
  recommendedActions: string[];
  doNotDo: string[];
  followUp24h: string | null;
}

export type DoctorNextStepsOutcome =
  | { kind: "result"; analysis: DoctorNextStepsAnalysis }
  | { kind: "empty" }
  | { kind: "credit_denied"; credit: AiCreditDenial | null }
  | { kind: "upstream_exhausted" }
  | { kind: "pending" }
  | { kind: "failed" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim())
    : [];
}

function optionalString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Classify an adapted `ai-coach` response. Unknown shapes fail closed. */
export function classifyDoctorNextStepsResponse(
  outcome: AiCreditedOutcome<unknown>,
): DoctorNextStepsOutcome {
  if (outcome.ok === false) {
    if (outcome.reason === "credit_denied") {
      return { kind: "credit_denied", credit: outcome.credit ?? null };
    }
    if (outcome.reason === "upstream_credit_exhausted") return { kind: "upstream_exhausted" };
    if (shouldRetainAiCoachPendingRequest(outcome.reason)) return { kind: "pending" };
    return { kind: "failed" };
  }
  const result = outcome.result;
  if (!isRecord(result) || typeof result.error === "string") return { kind: "failed" };
  // The server refunds and skips the model when the grow has no logs.
  if (result.empty === true) return { kind: "empty" };
  const analysis = result.analysis;
  if (!isRecord(analysis)) return { kind: "failed" };
  const summary = optionalString(analysis.summary);
  if (!summary) return { kind: "failed" };
  return {
    kind: "result",
    analysis: {
      summary,
      confidence: optionalString(analysis.confidence),
      recommendedActions: stringList(analysis.recommended_actions),
      doNotDo: stringList(analysis.do_not_do),
      followUp24h: optionalString(analysis.follow_up_24h),
    },
  };
}
