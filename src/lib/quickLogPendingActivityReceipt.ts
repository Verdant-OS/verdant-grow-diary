import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/isUuid";

export const MOVED_ACTIVITY_RECOVERY_GUIDANCE =
  "This activity belongs to the plant's previous tent or grow. Check its saved receipt before logging another activity.";
export const MOVED_ACTIVITY_RECEIPT_NOT_FOUND =
  "No confirmed receipt is available yet. The earlier save may still complete, so this plant remains locked.";
export const MOVED_ACTIVITY_RECEIPT_UNAVAILABLE =
  "The original save could not be verified. This plant remains locked until its outcome is known.";
export const MOVED_ACTIVITY_RECEIPT_CONFIRMED =
  "The original activity was confirmed for its previous tent or grow. Check Timeline.";

export type QuickLogPendingActivityReceipt =
  | { readonly status: "confirmed"; readonly growEventId: string }
  | { readonly status: "not_found" }
  | { readonly status: "unavailable" };

/** Read-only owner-scoped proof of a committed key; absence is never proof that an in-flight write ended. */
export async function readQuickLogPendingActivityReceipt(
  ownerId: string | null | undefined,
  idempotencyKey: string | null | undefined,
): Promise<QuickLogPendingActivityReceipt> {
  if (!ownerId?.trim() || !idempotencyKey?.trim()) return { status: "unavailable" };
  try {
    const { data, error } = await supabase
      .from("quicklog_idempotency")
      .select("grow_event_id")
      .eq("user_id", ownerId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) return { status: "unavailable" };
    if (data === null) return { status: "not_found" };
    if (!isUuid(data?.grow_event_id)) return { status: "unavailable" };
    return { status: "confirmed", growEventId: data.grow_event_id };
  } catch {
    return { status: "unavailable" };
  }
}
