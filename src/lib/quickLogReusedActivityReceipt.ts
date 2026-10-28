import { supabase } from "@/integrations/supabase/client";
import {
  matchesActiveQuickLogActivityEvent,
  type ExpectedQuickLogActivityEvent,
} from "./quickLogReusedActivityReceiptRules";

export type QuickLogActivityEventReader = (
  id: string,
) => Promise<{ data: unknown; error: unknown }>;

export const readQuickLogActivityEvent: QuickLogActivityEventReader = async (id) =>
  supabase
    .from("grow_events")
    .select("id,event_type,source,is_deleted,grow_id,tent_id,plant_id,note,occurred_at")
    .eq("id", id)
    .maybeSingle();

export async function verifyReusedQuickLogActivityEvent(
  expected: ExpectedQuickLogActivityEvent,
  reader: QuickLogActivityEventReader = readQuickLogActivityEvent,
): Promise<boolean> {
  try {
    const { data, error } = await reader(expected.id);
    return !error && matchesActiveQuickLogActivityEvent(expected, data);
  } catch {
    return false;
  }
}
