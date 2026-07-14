/**
 * phenoKeeperActionQueue
 *
 * Builds APPROVAL-REQUIRED Action Queue payloads for the follow-up work a
 * grower's keeper decision (keep / cull / hold) might imply. Modeled directly
 * on buildBreedingActionQueuePayloads and reusing the same safety envelope:
 *
 *  - Every payload is status: "pending_approval". Nothing executes. The grower
 *    reviews and acts; Verdant never keeps, culls, or touches a plant or device.
 *  - Suggestions are follow-up REMINDERS ("label the keeper", "confirm removal"),
 *    never device commands, setpoints, or automation.
 *  - Provenance is carried on `reason` ([keeper_decision:<id>]) and via the
 *    shared normalizeOriginatingTimelineEvents envelope.
 *
 * Pure payload builder: no I/O, no Supabase client, no fetch, no writes. It
 * only shapes rows a separate, RLS-scoped insert path may later persist.
 */
import type { Database } from "@/integrations/supabase/types";
import { normalizeOriginatingTimelineEvents } from "@/lib/originatingTimelineEventRules";
import {
  normalizeKeeperDecision,
  keeperDecisionLabel,
  type PhenoKeeperDecision,
} from "@/lib/phenoKeeperDecisionModel";

export type ActionQueueInsert = Database["public"]["Tables"]["action_queue"]["Insert"];
export type PhenoKeeperActionQueuePayload = ActionQueueInsert;

/** Stable action/target label for keeper follow-ups (free-text column, no enum). */
export const PHENO_KEEPER_ACTION_TYPE = "pheno_keeper_follow_up";

/** A recorded keeper decision that may imply approval-required follow-up work. */
export interface PhenoKeeperDecisionEvent {
  /** Decision row id — carried as provenance, not a plant/device id. */
  readonly id: string;
  readonly decision: unknown;
  readonly candidateLabel?: string | null;
  /** When the grower recorded the decision. May be null; never fabricated. */
  readonly decidedAt?: string | null;
  readonly note?: string | null;
}

/** Keeper follow-ups are low/medium consequence — never high/critical. */
type KeeperRisk = "low" | "medium";

interface KeeperFollowUpSuggestion {
  readonly title: string;
  readonly next_steps: string;
  readonly reason: string;
  readonly risk_level: KeeperRisk;
}

/**
 * Pure advisor: a keeper decision → the follow-up reminders it suggests.
 * "undecided" implies nothing. Nothing here acts — every suggestion becomes a
 * pending-approval reminder the grower must review.
 */
export function suggestKeeperFollowUpActions(
  decision: PhenoKeeperDecision,
  candidateLabel: string,
): KeeperFollowUpSuggestion[] {
  const who = candidateLabel;
  switch (decision) {
    case "keep":
      return [
        {
          title: `Label & isolate keeper — ${who}`,
          next_steps:
            "Tag this plant as a keeper and move it clear of the cull pile so it isn't lost by mistake.",
          reason: "You marked this candidate to keep.",
          risk_level: "low",
        },
        {
          title: `Take clones of keeper — ${who}`,
          next_steps:
            "If you want to preserve this phenotype, cut and root clones before the mother finishes.",
          reason: "Keepers are worth preserving before harvest.",
          risk_level: "low",
        },
      ];
    case "cull":
      return [
        {
          title: `Confirm removal of ${who}`,
          next_steps:
            "Give it one last look, then remove the plant yourself. Nothing is removed until you approve and do it.",
          reason: "You marked this candidate to cull.",
          risk_level: "medium",
        },
      ];
    case "hold":
      return [
        {
          title: `Re-evaluate ${who} at next check`,
          next_steps:
            "Leave the plant in place and reassess once there is more to go on — photos, cure notes, another read.",
          reason: "You put this candidate on hold.",
          risk_level: "low",
        },
      ];
    case "undecided":
    default:
      return [];
  }
}

/**
 * Build approval-required Action Queue payloads for a keeper decision. Returns
 * [] for undecided decisions or a missing decision id.
 */
export function buildPhenoKeeperActionQueuePayloads(
  event: PhenoKeeperDecisionEvent,
  growId: string,
  plantId: string | null = null,
  tentId: string | null = null,
): PhenoKeeperActionQueuePayload[] {
  const decisionId = typeof event.id === "string" ? event.id.trim() : "";
  if (!decisionId) return [];
  const grow = typeof growId === "string" ? growId.trim() : "";
  if (!grow) return [];

  const decision = normalizeKeeperDecision(event.decision);
  const label =
    (typeof event.candidateLabel === "string" && event.candidateLabel.trim()) || "this candidate";
  const suggestions = suggestKeeperFollowUpActions(decision, label);
  if (suggestions.length === 0) return [];

  // Provenance envelope — same normalizer + cast convention as breeding.
  const originatingTimelineEvents = normalizeOriginatingTimelineEvents([
    {
      id: decisionId,
      type: `pheno_keeper_${decision}`,
      occurred_at: event.decidedAt ?? null,
      source: "manual",
    },
  ]);

  return suggestions.map((suggestion) => {
    const suggestedChange = {
      title: suggestion.title,
      next_steps: suggestion.next_steps,
      reason: suggestion.reason,
      decision,
      decision_label: keeperDecisionLabel(decision),
      candidate_label: label,
      source_decision_id: decisionId,
    };

    return {
      grow_id: grow,
      plant_id: plantId,
      tent_id: tentId,
      action_type: PHENO_KEEPER_ACTION_TYPE,
      target_metric: PHENO_KEEPER_ACTION_TYPE,
      status: "pending_approval",
      source: "manual",
      reason: `${suggestion.reason} [keeper_decision:${decisionId}]`,
      risk_level: suggestion.risk_level,
      suggested_change: JSON.stringify(suggestedChange),
      // Same cast convention as src/lib/alerts.ts saveAlert() / breedingActionQueue.
      originating_timeline_events: originatingTimelineEvents as unknown as never,
    };
  });
}
