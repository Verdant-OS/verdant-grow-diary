import { supabase } from "@/integrations/supabase/client";
import { FIRST_DIARY_ENTRY_BADGE_KEY } from "@/lib/badgeAwardRules";

export type BadgeAwardEvaluationStatus =
  | "disabled"
  | "not_authenticated"
  | "not_in_slice"
  | "qualified"
  | "hidden"
  | "restored"
  | "unchanged";

export interface BadgeAwardEvaluation {
  status: BadgeAwardEvaluationStatus;
  awardId: string | null;
}

export interface OwnerBadgeAward {
  id: string;
  badgeKey: string;
  firstRecognizedAt: string;
  hiddenAt: string | null;
  restoredAt: string | null;
}

const EVALUATION_STATUSES = new Set<BadgeAwardEvaluationStatus>([
  "disabled",
  "not_authenticated",
  "not_in_slice",
  "qualified",
  "hidden",
  "restored",
  "unchanged",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBadgeAwardEvaluation(data: unknown): BadgeAwardEvaluation {
  if (!isRecord(data) || typeof data.status !== "string") {
    return { status: "unchanged", awardId: null };
  }
  if (!EVALUATION_STATUSES.has(data.status as BadgeAwardEvaluationStatus)) {
    return { status: "unchanged", awardId: null };
  }
  const awardId = typeof data.award_id === "string" ? data.award_id : null;
  return { status: data.status as BadgeAwardEvaluationStatus, awardId };
}

export async function evaluateOwnerBadgeAward(): Promise<BadgeAwardEvaluation> {
  const { data, error } = await supabase.rpc("badge_awards_evaluate_owner", {
    badge_key: FIRST_DIARY_ENTRY_BADGE_KEY,
  });
  if (error) {
    throw error;
  }
  return parseBadgeAwardEvaluation(data);
}

export async function listOwnerBadgeAwards(): Promise<OwnerBadgeAward[]> {
  const { data, error } = await supabase
    .from("badge_awards")
    .select("id, badge_key, first_recognized_at, hidden_at, restored_at")
    .order("first_recognized_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    badgeKey: row.badge_key,
    firstRecognizedAt: row.first_recognized_at,
    hiddenAt: row.hidden_at,
    restoredAt: row.restored_at,
  }));
}
