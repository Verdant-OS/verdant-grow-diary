/**
 * Build an owner-isolated React Query key for private grow data.
 *
 * The owner id is cache identity only. Repository calls continue to rely on
 * the authenticated Supabase JWT and RLS; callers must never send this value
 * as an authority-bearing database filter.
 *
 * The owner suffix keeps existing `['grow', resource]` invalidation prefixes
 * working while preventing one signed-in account from reusing another
 * account's private cached rows.
 */
function normalizeOwnerKey(ownerId: string | null | undefined): string {
  return typeof ownerId === "string" && ownerId.trim().length > 0 ? ownerId.trim() : "anonymous";
}

export function buildPrivateGrowQueryKey(
  ownerId: string | null | undefined,
  parts: readonly unknown[],
): readonly unknown[] {
  const ownerKey = normalizeOwnerKey(ownerId);
  return ["grow", ...parts, "owner", ownerKey];
}

/**
 * Build an owner-isolated key for private sensor readings.
 *
 * The stable `['sensor_readings']` prefix intentionally remains first so
 * existing write-side invalidation continues to refresh every sensor window.
 * As with grow keys, the owner id is cache identity only; Supabase JWT + RLS
 * remain the sole read authority.
 */
export function buildPrivateSensorQueryKey(
  ownerId: string | null | undefined,
  parts: readonly unknown[],
): readonly unknown[] {
  return ["sensor_readings", ...parts, "owner", normalizeOwnerKey(ownerId)];
}
