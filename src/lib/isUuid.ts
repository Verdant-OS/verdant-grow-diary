/**
 * Pure UUID v1–v5 shape check. Used to guard Supabase inserts against
 * demo/mock ids like "t1", "tent-1", "demo-tent" which would otherwise
 * produce a Postgres "invalid input syntax for type uuid" 400.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
