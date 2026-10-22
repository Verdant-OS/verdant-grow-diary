import { supabase } from "@/integrations/supabase/client";
import type { MemberBadgeAwardRow } from "@/lib/memberBadgeProfileRules";

/** Award rows only. Never reads badge_evidence or any photo column. */
export async function listMemberBadgeAwards(profileUserId: string): Promise<MemberBadgeAwardRow[]> {
  const { data, error } = await supabase
    .from("badge_awards")
    .select("id, user_id, badge_key, first_recognized_at, hidden_at, revoked_at")
    .eq("user_id", profileUserId)
    .is("hidden_at", null)
    .is("revoked_at", null)
    .order("first_recognized_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    badgeKey: row.badge_key,
    firstRecognizedAt: row.first_recognized_at,
    hiddenAt: row.hidden_at,
    revokedAt: row.revoked_at,
  }));
}
