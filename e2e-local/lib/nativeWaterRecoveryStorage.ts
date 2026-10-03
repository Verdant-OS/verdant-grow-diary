/** Serializable browser probe: read one fixture-owned claim key, never enumerate storage. */
export function readNativeWaterRecovery(key: string): Record<string, unknown> | null {
  const { shared, pending } = {
    shared: localStorage.getItem(key),
    pending: sessionStorage.getItem(key),
  };
  if (shared !== null) throw new Error("Typed Water left a cross-tab recovery copy.");
  if (pending === null) return null;
  const value: unknown = JSON.parse(pending);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Pending Water envelope is malformed.");
  }
  return value as Record<string, unknown>;
}
