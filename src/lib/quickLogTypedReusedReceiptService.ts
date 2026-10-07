import { supabase } from "@/integrations/supabase/client";
import {
  typedReusedChildRefusal,
  typedReusedEventRefusal,
  typedReusedMovedScope,
  type ExpectedTypedQuickLogEvent,
  type TypedReusedReceiptRefusal,
  type TypedReusedReviewTarget,
} from "./quickLogTypedReusedReceiptRules";

// Readback for reused typed Water/Feed receipts. useQuickLogV2Save's starter
// Water path (src/hooks/useQuickLogV2Save.ts) reads the same grow_events and
// watering_events rows through quickLogWaterReceiptRules; keep the two in step.

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

type ReadResult = PromiseLike<{ data: unknown; error: unknown }>;
type ReadQuery = {
  maybeSingle: () => ReadResult;
  abortSignal?: (signal: AbortSignal) => { maybeSingle: () => ReadResult };
};

// Minimal read surface of an authenticated client, injectable for tests.
export interface TypedReceiptReadClient {
  from: (table: "grow_events" | "watering_events" | "feeding_events") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => ReadQuery;
    };
  };
}

// Abort through the client when it supports it; the verifier's deadline bounds
// the read either way.
const runRead = (query: ReadQuery, signal?: AbortSignal): ReadResult =>
  (signal && typeof query.abortSignal === "function"
    ? query.abortSignal(signal)
    : query
  ).maybeSingle();

export function createTypedQuickLogEventReader(
  client: TypedReceiptReadClient,
): TypedQuickLogEventReader {
  return async (id, signal) =>
    runRead(
      client
        .from("grow_events")
        .select("id,event_type,source,is_deleted,grow_id,tent_id,plant_id")
        .eq("id", id),
      signal,
    );
}

export function createTypedQuickLogChildReader(
  client: TypedReceiptReadClient,
): TypedQuickLogChildReader {
  return async (type, eventId, signal) =>
    runRead(
      type === "watering"
        ? client.from("watering_events").select("event_id,volume_ml").eq("event_id", eventId)
        : client
            .from("feeding_events")
            .select("event_id,volume_ml,line_id")
            .eq("event_id", eventId),
      signal,
    );
}

// The singleton is read at call time, as before, so the no-client path is unchanged.
const singleton = () => supabase as unknown as TypedReceiptReadClient;

export const readTypedQuickLogEvent: TypedQuickLogEventReader = (id, signal) =>
  createTypedQuickLogEventReader(singleton())(id, signal);
export const readTypedQuickLogChild: TypedQuickLogChildReader = (type, eventId, signal) =>
  createTypedQuickLogChildReader(singleton())(type, eventId, signal);

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
