import { supabase } from "@/integrations/supabase/client";
import {
  matchesActiveTypedQuickLogEvent,
  type ExpectedTypedQuickLogEvent,
} from "./quickLogTypedReusedReceiptRules";

export type TypedQuickLogEventReader = (id: string) => Promise<{ data: unknown; error: unknown }>;

export const readTypedQuickLogEvent: TypedQuickLogEventReader = async (id) =>
  supabase
    .from("grow_events")
    .select("id,event_type,source,is_deleted,grow_id,tent_id,plant_id")
    .eq("id", id)
    .maybeSingle();

/** Reused RPC replies can point at an event retracted after its original save. */
export async function verifyActiveTypedQuickLogEvent(
  expected: ExpectedTypedQuickLogEvent,
  reader: TypedQuickLogEventReader = readTypedQuickLogEvent,
): Promise<boolean> {
  try {
    const { data, error } = await reader(expected.id);
    return !error && matchesActiveTypedQuickLogEvent(expected, data);
  } catch {
    return false;
  }
}
