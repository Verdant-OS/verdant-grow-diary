import { supabase } from "@/integrations/supabase/client";
import type { FieldNotebookServerEntry } from "@/lib/fieldNotebookOutcomeRules";

export type NotebookFindReceipt =
  | { availability: "authoritative"; candidates: FieldNotebookServerEntry[] }
  | { availability: "unavailable" };

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
