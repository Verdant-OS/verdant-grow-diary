import { supabase } from "@/integrations/supabase/client";
import {
  matchesActiveTypedQuickLogEvent,
  matchesTypedQuickLogChild,
  type ExpectedTypedQuickLogEvent,
} from "./quickLogTypedReusedReceiptRules";

export type TypedQuickLogEventReader = (id: string) => Promise<{ data: unknown; error: unknown }>;
export type TypedQuickLogChildReader = (
  type: ExpectedTypedQuickLogEvent["eventType"],
  eventId: string,
) => Promise<{ data: unknown; error: unknown }>;

export const readTypedQuickLogEvent: TypedQuickLogEventReader = async (id) =>
  supabase
    .from("grow_events")
    .select("id,event_type,source,is_deleted,grow_id,tent_id,plant_id")
    .eq("id", id)
    .maybeSingle();

export const readTypedQuickLogChild: TypedQuickLogChildReader = async (type, eventId) =>
  type === "watering"
    ? supabase
        .from("watering_events")
        .select("event_id,volume_ml")
        .eq("event_id", eventId)
        .maybeSingle()
    : supabase
        .from("feeding_events")
        .select("event_id,volume_ml,line_id")
        .eq("event_id", eventId)
        .maybeSingle();

/** Reused RPC replies must still point at an active event with its typed child. */
export async function verifyActiveTypedQuickLogEvent(
  expected: ExpectedTypedQuickLogEvent,
  reader: TypedQuickLogEventReader = readTypedQuickLogEvent,
  childReader: TypedQuickLogChildReader = readTypedQuickLogChild,
): Promise<boolean> {
  try {
    const { data, error } = await reader(expected.id);
    if (error || !matchesActiveTypedQuickLogEvent(expected, data)) return false;
    const child = await childReader(expected.eventType, expected.id);
    return !child.error && matchesTypedQuickLogChild(expected, child.data);
  } catch {
    return false;
  }
}
