/**
 * Closed handoff for opening Quick Log v2 on its structured Feed form.
 * Separate from the Water intent so that contract stays closed on "water".
 */

export const QUICK_LOG_V2_FEED_OPEN_EVENT = "verdant:open-quicklog-v2-feed" as const;

export type QuickLogV2FeedOpenTargetKey = `plant:${string}` | `tent:${string}`;

export interface QuickLogV2FeedOpenIntent {
  targetKey: QuickLogV2FeedOpenTargetKey;
  action: "feed";
}

export interface BuildQuickLogV2FeedOpenIntentInput {
  plantId?: unknown;
  tentId?: unknown;
}

function validTargetId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value === value.trim() && !/[\s:]/.test(value)
  );
}

export function buildQuickLogV2FeedOpenIntent({
  plantId,
  tentId,
}: BuildQuickLogV2FeedOpenIntentInput): QuickLogV2FeedOpenIntent | null {
  if (validTargetId(plantId)) {
    return { targetKey: `plant:${plantId}`, action: "feed" };
  }
  if (validTargetId(tentId)) {
    return { targetKey: `tent:${tentId}`, action: "feed" };
  }
  return null;
}

export function isQuickLogV2FeedOpenIntent(value: unknown): value is QuickLogV2FeedOpenIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2) return false;
  if (record.action !== "feed" || typeof record.targetKey !== "string") return false;
  const match = /^(plant|tent):(.+)$/.exec(record.targetKey);
  return !!match && validTargetId(match[2]);
}
