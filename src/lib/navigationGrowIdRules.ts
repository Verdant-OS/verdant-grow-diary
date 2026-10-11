/**
 * Extract an explicit growId from the current location. Fail closed:
 * never invent a grow from store, remembered target, or sibling routes.
 * Pure. No network, no clock, no privileged access.
 */
export function resolveNavigationGrowId(input: {
  pathname?: string | null;
  search?: string | null;
}): string | null {
  const pathname = input.pathname ?? "";
  const pathMatch = pathname.match(/^\/grows\/([^/]+)/);
  if (pathMatch) {
    let decoded = pathMatch[1];
    try {
      decoded = decodeURIComponent(pathMatch[1]);
    } catch {
      decoded = pathMatch[1];
    }
    const trimmedPathId = decoded.trim();
    if (trimmedPathId) return trimmedPathId;
  }

  const rawSearch = input.search ?? "";
  const query = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  const trimmedQueryId = (new URLSearchParams(query).get("growId") ?? "").trim();
  return trimmedQueryId || null;
}
