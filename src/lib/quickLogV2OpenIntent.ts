/**
 * Closed, in-memory handoff contract for opening Quick Log v2 on its
 * structured Water form. Builders and validation are pure and fail closed.
 *
 * The optional `loggedAt` carries the "Captured" seed (the moment the Fast
 * Add / launcher surface was clicked) so the sheet can persist it as
 * details.logged_at — the report/calendar grouping key. Validated as a
 * parseable ISO string; a malformed value is omitted by the builder and
 * fails the validator closed.
 */

export const QUICK_LOG_V2_OPEN_EVENT = "verdant:open-quicklog-v2" as const;

export type QuickLogV2OpenTargetKey = `plant:${string}` | `tent:${string}`;

export interface QuickLogV2OpenIntent {
  targetKey: QuickLogV2OpenTargetKey;
  action: "water";
  /** ISO "Captured" seed from the launcher click. Optional. */
  loggedAt?: string;
}

export interface BuildQuickLogV2OpenIntentInput {
  plantId?: unknown;
  tentId?: unknown;
  action?: unknown;
  loggedAt?: unknown;
}

function validTargetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    !/[\s:]/.test(value)
  );
}

function validLoggedAt(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function buildQuickLogV2OpenIntent({
  plantId,
  tentId,
  action,
  loggedAt,
}: BuildQuickLogV2OpenIntentInput): QuickLogV2OpenIntent | null {
  if (action !== "water") return null;
  // A malformed loggedAt never silently degrades the intent — the builder
  // omits the key (the sheet then seeds its own open time).
  const logged = validLoggedAt(loggedAt) ? { loggedAt } : {};
  if (validTargetId(plantId)) {
    return { targetKey: `plant:${plantId}`, action, ...logged };
  }
  if (validTargetId(tentId)) {
    return { targetKey: `tent:${tentId}`, action, ...logged };
  }
  return null;
}

export function isQuickLogV2OpenIntent(value: unknown): value is QuickLogV2OpenIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  // Closed contract: exactly targetKey + action, plus an OPTIONAL loggedAt.
  // Any other key or count fails closed.
  if (keys.length !== 2 && keys.length !== 3) return false;
  if (keys.length === 3 && !("loggedAt" in record)) return false;
  if ("loggedAt" in record && !validLoggedAt(record.loggedAt)) return false;
  if (record.action !== "water" || typeof record.targetKey !== "string") return false;
  const match = /^(plant|tent):(.+)$/.exec(record.targetKey);
  return !!match && validTargetId(match[2]);
}
