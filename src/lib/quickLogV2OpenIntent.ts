/**
 * Closed, in-memory handoff contract for opening Quick Log v2 on its
 * structured Water form. Builders and validation are pure and fail closed.
 */

export const QUICK_LOG_V2_OPEN_EVENT = "verdant:open-quicklog-v2" as const;

export type QuickLogV2OpenTargetKey = `plant:${string}` | `tent:${string}`;

export interface QuickLogV2OpenIntent {
  targetKey: QuickLogV2OpenTargetKey;
  action: "water";
}

export interface BuildQuickLogV2OpenIntentInput {
  plantId?: unknown;
  tentId?: unknown;
  action?: unknown;
}

function validTargetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    !/[\s:]/.test(value)
  );
}

export function buildQuickLogV2OpenIntent({
  plantId,
  tentId,
  action,
}: BuildQuickLogV2OpenIntentInput): QuickLogV2OpenIntent | null {
  if (action !== "water") return null;
  if (validTargetId(plantId)) {
    return { targetKey: `plant:${plantId}`, action };
  }
  if (validTargetId(tentId)) {
    return { targetKey: `tent:${tentId}`, action };
  }
  return null;
}

export function isQuickLogV2OpenIntent(value: unknown): value is QuickLogV2OpenIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2) return false;
  if (record.action !== "water" || typeof record.targetKey !== "string") return false;
  const match = /^(plant|tent):(.+)$/.exec(record.targetKey);
  return !!match && validTargetId(match[2]);
}
