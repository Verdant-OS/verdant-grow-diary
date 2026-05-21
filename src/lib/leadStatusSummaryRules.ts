/**
 * Pure logic for the read-only Lead Status Summary Strip.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Reuses recommendNextAction and scoreLeadQuality so we do not duplicate
 * classification logic.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import { recommendNextAction } from "@/lib/leadNextActionRules";
import { scoreLeadQuality } from "@/lib/leadQualityScoreRules";
import { KNOWN_LEAD_STATUSES as KNOWN_STATUSES } from "@/lib/leadFieldUtils";

export interface LeadStatusSummary {
  total: number;
  needsFirstContact: number;
  followUp: number;
  readyToClose: number;
  closed: number;
  lost: number;
  reviewManually: number;
  highPriority: number;
  averageQualityScore: number; // 0-100, 0 when empty
  percentClosed: number; // 0-100
  percentNeedingAction: number; // 0-100
  warnings: string[];
}

function safePct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Derive the read-only status summary for a list of leads.
 *
 * Deterministic: same input always yields the same output (no Date.now()
 * unless `now` is supplied).
 */
export function summarizeLeadStatuses(
  leads: readonly LeadRow[],
  now: number = Date.now(),
): LeadStatusSummary {
  if (!leads || leads.length === 0) {
    return {
      total: 0,
      needsFirstContact: 0,
      followUp: 0,
      readyToClose: 0,
      closed: 0,
      lost: 0,
      reviewManually: 0,
      highPriority: 0,
      averageQualityScore: 0,
      percentClosed: 0,
      percentNeedingAction: 0,
      warnings: [],
    };
  }

  let needsFirstContact = 0;
  let followUp = 0;
  let readyToClose = 0;
  let closed = 0;
  let lost = 0;
  let reviewManually = 0;
  let highPriority = 0;
  let scoreSum = 0;
  let invalidStatusCount = 0;

  for (const lead of leads) {
    const statusRaw = (lead.status ?? "") as string;
    if (!KNOWN_STATUSES.has(statusRaw)) invalidStatusCount += 1;

    const rec = recommendNextAction(lead, now);
    switch (rec.type) {
      case "needs_first_contact":
        needsFirstContact += 1;
        break;
      case "follow_up":
        followUp += 1;
        break;
      case "ready_to_close":
        readyToClose += 1;
        break;
      case "closed_no_action":
        closed += 1;
        break;
      case "lost_no_action":
        lost += 1;
        break;
      case "review_manually":
        reviewManually += 1;
        break;
    }
    if (rec.priority === "high") highPriority += 1;

    const q = scoreLeadQuality(lead, now);
    scoreSum += q.score;
  }

  const total = leads.length;
  const needingAction =
    needsFirstContact + followUp + readyToClose + reviewManually;

  const warnings: string[] = [];
  if (invalidStatusCount > 0) {
    warnings.push(
      `${invalidStatusCount} lead${invalidStatusCount === 1 ? "" : "s"} with unknown or missing status`,
    );
  }

  return {
    total,
    needsFirstContact,
    followUp,
    readyToClose,
    closed,
    lost,
    reviewManually,
    highPriority,
    averageQualityScore: Math.round((scoreSum / total) * 10) / 10,
    percentClosed: safePct(closed, total),
    percentNeedingAction: safePct(needingAction, total),
    warnings,
  };
}
