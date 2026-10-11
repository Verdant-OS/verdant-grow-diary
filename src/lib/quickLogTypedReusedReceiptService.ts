import { supabase } from "@/integrations/supabase/client";
import {
  matchesActiveTypedQuickLogEvent,
  matchesTypedQuickLogChild,
  type ExpectedTypedQuickLogEvent,
} from "./quickLogTypedReusedReceiptRules";

// Readback for reused typed Water/Feed receipts. useQuickLogV2Save's starter
// Water path (src/hooks/useQuickLogV2Save.ts) reads the same grow_events and
// watering_events rows through quickLogWaterReceiptRules; keep the two in step.

export type TypedQuickLogEventReader = (id: string) => Promise<{ data: unknown; error: unknown }>;
export type TypedQuickLogChildReader = (
  type: ExpectedTypedQuickLogEvent["eventType"],
  eventId: string,
) => Promise<{ data: unknown; error: unknown }>;

type ReadResult = PromiseLike<{ data: unknown; error: unknown }>;

// Minimal read surface of an authenticated client, injectable for tests.
export interface TypedReceiptReadClient {
  from: (table: "grow_events" | "watering_events" | "feeding_events") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => ReadResult };
    };
  };
}

export function createTypedQuickLogEventReader(
  client: TypedReceiptReadClient,
): TypedQuickLogEventReader {
  return async (id) =>
    client
      .from("grow_events")
      .select("id,event_type,source,is_deleted,grow_id,tent_id,plant_id")
      .eq("id", id)
      .maybeSingle();
}

export function createTypedQuickLogChildReader(
  client: TypedReceiptReadClient,
): TypedQuickLogChildReader {
  return async (type, eventId) =>
    type === "watering"
      ? client
          .from("watering_events")
          .select("event_id,volume_ml")
          .eq("event_id", eventId)
          .maybeSingle()
      : client
          .from("feeding_events")
          .select("event_id,volume_ml,line_id")
          .eq("event_id", eventId)
          .maybeSingle();
}

// The singleton is read at call time, as before, so the no-client path is unchanged.
const singleton = () => supabase as unknown as TypedReceiptReadClient;

export const readTypedQuickLogEvent: TypedQuickLogEventReader = (id) =>
  createTypedQuickLogEventReader(singleton())(id);
export const readTypedQuickLogChild: TypedQuickLogChildReader = (type, eventId) =>
  createTypedQuickLogChildReader(singleton())(type, eventId);

/**
 * Readers for a writer's reuse check. Explicit readers win; otherwise an
 * injected client is read through, never the global singleton. A client
 * without `from` throws inside the verifier, which fails closed.
 */
export function resolveTypedReceiptReaders(options: {
  client?: unknown;
  reusedEventReader?: TypedQuickLogEventReader;
  reusedChildReader?: TypedQuickLogChildReader;
}): { eventReader: TypedQuickLogEventReader; childReader: TypedQuickLogChildReader } {
  const client = options.client as TypedReceiptReadClient | undefined;
  return {
    eventReader:
      options.reusedEventReader ??
      (client ? createTypedQuickLogEventReader(client) : readTypedQuickLogEvent),
    childReader:
      options.reusedChildReader ??
      (client ? createTypedQuickLogChildReader(client) : readTypedQuickLogChild),
  };
}

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
