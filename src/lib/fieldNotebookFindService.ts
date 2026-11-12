import { supabase } from "@/integrations/supabase/client";
import type { FieldNotebookServerEntry } from "@/lib/fieldNotebookOutcomeRules";

export type NotebookFindReceipt =
  | { availability: "authoritative"; candidates: FieldNotebookServerEntry[] }
  | { availability: "unavailable" };

/**
 * Read-only owner lookup. A missing row or a failed read is unavailable,
 * which stays uncertain. It is not proof the write failed.
 */
export async function findNotebookEntryByIdempotencyKey(input: {
  userId: string | null;
  idempotencyKey: string | null;
  tentId: string;
  tentName: string;
}): Promise<NotebookFindReceipt & { matchedEventId?: string }> {
  if (!input.userId || !input.idempotencyKey) return { availability: "unavailable" };
  try {
    const { data, error } = await supabase
      .from("quicklog_idempotency")
      .select("grow_event_id")
      .eq("user_id", input.userId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error || data === null || typeof data.grow_event_id !== "string" || !data.grow_event_id) {
      return { availability: "unavailable" };
    }
    const found = await findNotebookEntry({
      tentId: input.tentId,
      tentName: input.tentName,
      knownEventId: data.grow_event_id,
    });
    if (found.availability === "unavailable") return found;
    return { ...found, matchedEventId: data.grow_event_id };
  } catch {
    return { availability: "unavailable" };
  }
}

export async function findNotebookEntry(input: {
  tentId: string;
  tentName: string;
  knownEventId: string | null;
}): Promise<NotebookFindReceipt> {
  if (!input.knownEventId) return { availability: "unavailable" };
  const { data, error } = await supabase
    .from("grow_events")
    .select("id,tent_id,note,occurred_at,event_type,source,is_deleted")
    .eq("id", input.knownEventId)
    .maybeSingle();
  if (error || !data) return { availability: "unavailable" };
  if (data.id !== input.knownEventId || data.is_deleted !== false) {
    return { availability: "authoritative", candidates: [] };
  }
  if (data.event_type !== "observation" || data.source !== "manual") {
    return { availability: "authoritative", candidates: [] };
  }
  if (data.tent_id !== input.tentId || typeof data.occurred_at !== "string") {
    return { availability: "authoritative", candidates: [] };
  }
  return {
    availability: "authoritative",
    candidates: [
      {
        growEventId: data.id,
        tentId: data.tent_id,
        tentName: input.tentName,
        note: typeof data.note === "string" ? data.note : "",
        occurredAt: data.occurred_at,
      },
    ],
  };
}
