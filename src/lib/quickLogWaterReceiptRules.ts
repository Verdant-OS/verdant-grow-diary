import type { QuickLogV2SavePayload } from "./quickLogV2SavePayload";
import type { QuickLogResolvedTarget } from "./quickLogTargetIntegrityRules";

type WaterEvent = {
  id?: unknown;
  event_type?: unknown;
  source?: unknown;
  grow_id?: unknown;
  plant_id?: unknown;
  tent_id?: unknown;
  occurred_at?: unknown;
  note?: unknown;
};

type WaterChild = { event_id?: unknown; volume_ml?: unknown };

/** A reused key is confirmation only when its persisted parent matches this Watering. */
export function matchesReusedWaterEvent(
  payload: QuickLogV2SavePayload,
  eventId: string,
  event: WaterEvent | null | undefined,
  expectedTarget?: QuickLogResolvedTarget,
): boolean {
  if (!event || payload.p_action !== "water") return false;
  if (event.id !== eventId || event.event_type !== "watering" || event.source !== "manual")
    return false;
  if (payload.p_target_type === "plant") {
    if (event.plant_id !== payload.p_target_id) return false;
  } else if (payload.p_target_type === "tent") {
    if (event.tent_id !== payload.p_target_id || event.plant_id !== null) return false;
  } else return false;
  if (
    expectedTarget &&
    (event.grow_id !== expectedTarget.growId ||
      event.tent_id !== expectedTarget.tentId ||
      event.plant_id !== expectedTarget.plantId)
  )
    return false;
  if (event.note !== (payload.p_note === "" ? null : payload.p_note)) return false;
  if (payload.p_occurred_at !== null) {
    const expected = Date.parse(payload.p_occurred_at);
    const actual = typeof event.occurred_at === "string" ? Date.parse(event.occurred_at) : NaN;
    if (!Number.isFinite(expected) || expected !== actual) return false;
  }
  return true;
}

/** The Watering child must belong to that exact event and retain its submitted volume. */
export function matchesReusedWaterReceipt(
  payload: QuickLogV2SavePayload,
  eventId: string,
  event: WaterEvent | null | undefined,
  child: WaterChild | null | undefined,
  expectedTarget?: QuickLogResolvedTarget,
): boolean {
  return (
    matchesReusedWaterEvent(payload, eventId, event, expectedTarget) &&
    !!child &&
    child.event_id === eventId &&
    child.volume_ml === payload.p_volume_ml
  );
}
