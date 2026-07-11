/**
 * actionFollowUpExistingPhotoService — authenticated candidate query
 * for existing owned diary photos usable as follow-up evidence.
 *
 * SAFETY:
 *  - Uses the frontend authenticated client + current RLS. No service
 *    role. No admin client. No storage list-all-users. No writes.
 *  - Query is scoped to the verified action grow (and tent/plant when
 *    relevant). Rows returned by the DB are re-filtered through the
 *    pure rules client-side so a loose mock cannot leak unsafe rows.
 *  - Returns only sanitized shapes; never re-emits provider errors.
 */
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import {
  filterActionFollowUpExistingPhotoCandidates,
  type ActionFollowUpPhotoContext,
  type ExistingPhotoCandidate,
} from "@/lib/actionFollowUpExistingPhotoRules";

export type ExistingPhotoCandidateLoadResult =
  | { status: "loaded"; candidates: ExistingPhotoCandidate[] }
  | { status: "failed"; reason: "query_failed" };

type AuthedClient = typeof defaultSupabase;

interface DiaryPhotoRow {
  id: string | null;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  entry_at: string | null;
  photo_url: string | null;
}

export interface LoadExistingPhotoCandidatesDeps {
  supabase?: AuthedClient;
}

export async function loadActionFollowUpExistingPhotoCandidates(
  context: ActionFollowUpPhotoContext,
  deps?: LoadExistingPhotoCandidatesDeps,
): Promise<ExistingPhotoCandidateLoadResult> {
  const client = deps?.supabase ?? defaultSupabase;
  try {
    let q = client
      .from("diary_entries")
      .select("id,grow_id,tent_id,plant_id,entry_at,photo_url")
      .eq("grow_id", context.growId)
      .not("photo_url", "is", null);
    if (context.tentId) q = q.eq("tent_id", context.tentId);
    // Plant scope is applied client-side per documented rule so we
    // also include tent/grow-level photos with null plant_id.
    const { data, error } = await q.limit(50);
    if (error) return { status: "failed", reason: "query_failed" };
    const rows = (data ?? []) as DiaryPhotoRow[];
    const raw: ExistingPhotoCandidate[] = rows
      .filter((r): r is DiaryPhotoRow & { id: string; grow_id: string; photo_url: string } =>
        typeof r?.id === "string" && typeof r.grow_id === "string" && typeof r.photo_url === "string",
      )
      .map((r) => ({
        id: r.id,
        durableReference: r.photo_url,
        growId: r.grow_id,
        tentId: r.tent_id,
        plantId: r.plant_id,
        capturedAt: r.entry_at,
      }));
    return {
      status: "loaded",
      candidates: filterActionFollowUpExistingPhotoCandidates(raw, context),
    };
  } catch {
    return { status: "failed", reason: "query_failed" };
  }
}
