/**
 * writeActionFollowupDiaryEntry — the single sanctioned writer for the
 * `action_followup` 24h-recheck diary entry created when a grower marks
 * an Action Queue item completed.
 *
 * Extracted from ActionDetail so every completion surface (detail page,
 * queue list) shares one implementation instead of drifting. The queue
 * page previously skipped this write entirely, silently breaking the
 * loop's Action Queue → Follow-Up Evidence link (docs/v0-loop-event-map.md,
 * `action_follow_up_logged`).
 *
 * SECURITY GUARANTEES (do not break):
 *  - Never sends `user_id` (diary_entries.user_id defaults to auth.uid()).
 *  - Idempotent: an existing `action_followup` diary entry for the same
 *    action id short-circuits the insert (`followupMatchesAction` verifies
 *    the match before bailing).
 *  - Pure follow-up memory only — no device commands, no AI calls, no
 *    Action Queue writes, no outcome inference. The note text comes from
 *    the conservative pure rules in `actionFollowupRules.ts`.
 *  - Non-blocking by contract: callers must treat `ok: false` as a
 *    warning (the completed status + audit row always stand).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  ACTION_FOLLOWUP_EVENT_TYPE,
  buildActionFollowupDiaryDraft,
  followupMatchesAction,
  type CompletedActionInput,
} from "@/lib/actionFollowupRules";

export type ActionFollowupWriteResult =
  | { ok: true; wrote: boolean; skipped?: "draft_invalid" | "already_exists" }
  | { ok: false; message: string };

export async function maybeWriteActionFollowupDiaryEntry(
  completed: CompletedActionInput,
): Promise<ActionFollowupWriteResult> {
  const result = buildActionFollowupDiaryDraft(completed);
  if (!result.ok) return { ok: true, wrote: false, skipped: "draft_invalid" };
  const { draft } = result;
  // Canonical id from the draft (nonEmptyString-trimmed by the builder), so
  // the idempotency lookup and the stored details can never disagree.
  const actionId = draft.details.action_queue_id;

  // Idempotency lookup. RLS scopes this to the current user.
  const { data: existing, error: lookupErr } = await supabase
    .from("diary_entries")
    .select("id,details")
    .eq("grow_id", draft.grow_id)
    .contains("details", {
      event_type: ACTION_FOLLOWUP_EVENT_TYPE,
      action_queue_id: actionId,
    })
    .limit(1);
  if (!lookupErr && existing && existing.length > 0) {
    // Defensive double-check via pure helper before bailing out.
    const row = existing[0] as { id: string; details: unknown };
    if (
      followupMatchesAction(
        { details: row.details as { event_type?: unknown; action_queue_id?: unknown } | null },
        actionId,
      )
    ) {
      return { ok: true, wrote: false, skipped: "already_exists" };
    }
  }

  const { error: insErr } = await supabase.from("diary_entries").insert({
    grow_id: draft.grow_id,
    tent_id: draft.tent_id,
    plant_id: draft.plant_id,
    note: draft.note,
    details: draft.details as unknown as Json,
  });
  if (insErr) {
    return { ok: false, message: insErr.message };
  }
  return { ok: true, wrote: true };
}
