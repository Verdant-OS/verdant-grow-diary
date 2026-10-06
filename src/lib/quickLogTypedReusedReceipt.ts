import { supabase } from "@/integrations/supabase/client";
import {
  typedReusedChildRefusal,
  typedReusedEventRefusal,
  typedReusedMovedScope,
  type ExpectedTypedQuickLogEvent,
  type TypedReusedReceiptRefusal,
  type TypedReusedReviewTarget,
} from "./quickLogTypedReusedReceiptRules";

export type TypedQuickLogEventReader = (
  id: string,
  signal?: AbortSignal,
) => Promise<{ data: unknown; error: unknown }>;
export type TypedQuickLogChildReader = (
  type: ExpectedTypedQuickLogEvent["eventType"],
  eventId: string,
  signal?: AbortSignal,
) => Promise<{ data: unknown; error: unknown }>;

/**
 * One bound for both receipt reads. Past it the receipt is unconfirmed, the
 * original key is kept, and the sheet stops saving instead of hanging.
 */
export const TYPED_REUSED_RECEIPT_READ_DEADLINE_MS = 10_000;

export type TypedReusedReceiptVerdict =
  | { status: "verified" }
  /** Read failed, threw or timed out: same-key Retry may still confirm it. */
  | { status: "unavailable" }
  /** Read back and does not match: same-key Retry returns the same row. */
  | {
      status: "refused";
      reason: TypedReusedReceiptRefusal;
      /** Only for receipt_target_moved: where the original entry lives now. */
      reviewTarget?: TypedReusedReviewTarget;
    };

export const readTypedQuickLogEvent: TypedQuickLogEventReader = async (id, signal) => {
  const query = supabase
    .from("grow_events")
    .select("id,event_type,source,is_deleted,grow_id,tent_id,plant_id")
    .eq("id", id);
  return (signal ? query.abortSignal(signal) : query).maybeSingle();
};

export const readTypedQuickLogChild: TypedQuickLogChildReader = async (type, eventId, signal) => {
  const query =
    type === "watering"
      ? supabase.from("watering_events").select("event_id,volume_ml").eq("event_id", eventId)
      : supabase
          .from("feeding_events")
          .select("event_id,volume_ml,line_id")
          .eq("event_id", eventId);
  return (signal ? query.abortSignal(signal) : query).maybeSingle();
};

/** Reused RPC replies must still point at an active event with its typed child. */
export async function verifyActiveTypedQuickLogEvent(
  expected: ExpectedTypedQuickLogEvent,
  reader: TypedQuickLogEventReader = readTypedQuickLogEvent,
  childReader: TypedQuickLogChildReader = readTypedQuickLogChild,
): Promise<TypedReusedReceiptVerdict> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<TypedReusedReceiptVerdict>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ status: "unavailable" });
    }, TYPED_REUSED_RECEIPT_READ_DEADLINE_MS);
  });
  const read = async (): Promise<TypedReusedReceiptVerdict> => {
    const { data, error } = await reader(expected.id, controller.signal);
    if (error) return { status: "unavailable" };
    const eventRefusal = typedReusedEventRefusal(expected, data);
    if (eventRefusal) {
      const reviewTarget =
        eventRefusal === "receipt_target_moved" ? typedReusedMovedScope(data) : null;
      return reviewTarget
        ? { status: "refused", reason: eventRefusal, reviewTarget }
        : { status: "refused", reason: eventRefusal };
    }
    const child = await childReader(expected.eventType, expected.id, controller.signal);
    if (child.error) return { status: "unavailable" };
    const childRefusal = typedReusedChildRefusal(expected, child.data);
    return childRefusal ? { status: "refused", reason: childRefusal } : { status: "verified" };
  };
  try {
    return await Promise.race([read(), deadline]);
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
