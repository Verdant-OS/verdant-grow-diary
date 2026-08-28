/**
 * phenoActionQueueService — the ONLY pheno write path into the approval-required
 * Action Queue. Used for the herm → "consider removing" suggestion: when the
 * grower confirms removing a hermaphrodite, this creates ONE
 * status="pending_approval" Action Queue row. It never removes a plant, never
 * targets a device, and never auto-approves.
 *
 * Safety envelope:
 *  - Creates through public.action_queue_create (the #586 atomic path), so the
 *    queue row and its 'created' audit event commit or roll back together.
 *  - Server-side idempotency via a stable observation-scoped dedupe key: the
 *    RPC's non-terminal dedupe reuses the pending row, which also closes the
 *    cross-tab race a client-side pre-select could not. (A previous
 *    client-side select filtered suggested_change with a JSON operator, but
 *    the column is text — the filter errored and the dedupe never ran.)
 *  - Never sends user_id (server derives auth.uid()). Never sends
 *    target_device. Status is pinned server-side to pending_approval.
 *  - Payload shaped by the pure, tested buildPhenoKeeperActionQueuePayloads.
 */
import { buildPhenoKeeperActionQueuePayloads } from "@/lib/phenoKeeperActionQueue";
import { createActionQueueItem } from "@/lib/actionQueueCreateService";

export type QueueResult = { ok: true; id: string } | { ok: false; error: string };

/** Stable server-side idempotency key, scoped to one herm observation. */
export function buildPhenoHermCullDedupeKey(
  observationId: string | null | undefined,
): string | null {
  const id = typeof observationId === "string" ? observationId.trim() : "";
  if (!id) return null;
  return `pheno_herm_cull:${id}`;
}

/**
 * Queue a suggest-only "confirm removal" for a hermaphrodite the grower chose
 * to cull. Returns pending_approval — the grower still approves + acts.
 */
export async function queueHermCullSuggestion(input: {
  observationId: string;
  candidateLabel: string;
  growId: string;
  plantId: string;
  tentId?: string | null;
}): Promise<QueueResult> {
  const grow = typeof input.growId === "string" ? input.growId.trim() : "";
  if (!grow) return { ok: false, error: "This hunt has no grow to queue against." };

  const payloads = buildPhenoKeeperActionQueuePayloads(
    {
      id: input.observationId,
      decision: "cull",
      candidateLabel: input.candidateLabel,
      decidedAt: null,
    },
    grow,
    input.plantId,
    input.tentId ?? null,
  );
  if (payloads.length === 0) return { ok: false, error: "Nothing to queue." };
  const payload = payloads[0];
  // The builder always sets these; the type keeps them loose. Fail closed
  // rather than queueing a row with a blank reason, risk level, or change.
  if (
    typeof payload.reason !== "string" ||
    typeof payload.risk_level !== "string" ||
    typeof payload.suggested_change !== "string" ||
    typeof payload.source !== "string"
  ) {
    return { ok: false, error: "Nothing to queue." };
  }

  // Real runtime guard, not a cast: anything non-array from the builder
  // degrades to null instead of reaching the RPC as an invalid value.
  const rawEvents: unknown = payload.originating_timeline_events;
  const originatingTimelineEvents = Array.isArray(rawEvents)
    ? (rawEvents as readonly unknown[])
    : null;

  const result = await createActionQueueItem({
    grow_id: payload.grow_id,
    tent_id: payload.tent_id ?? null,
    plant_id: payload.plant_id ?? null,
    action_type: payload.action_type,
    target_metric: payload.target_metric ?? null,
    suggested_change: payload.suggested_change,
    reason: payload.reason,
    risk_level: payload.risk_level,
    source: payload.source,
    dedupe_key: buildPhenoHermCullDedupeKey(input.observationId),
    originating_timeline_events: originatingTimelineEvents,
  });

  if (!result.ok) return { ok: false, error: "Could not queue the removal for approval." };
  return { ok: true, id: result.action_queue_id };
}
