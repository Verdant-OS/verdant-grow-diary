export interface NavigationActiveRule {
  to: string;
  end?: boolean;
  aliases?: readonly string[];
  excludedPaths?: readonly string[];
}

function matchesPath(pathname: string, target: string, end = false): boolean {
  if (pathname === target) return true;
  if (end || target === "/") return false;
  return pathname.startsWith(`${target}/`);
}

/**
 * Shared navigation-active rule for route aliases and reserved sub-routes.
 *
 * Aliases keep equivalent entry points (for example `/` and `/dashboard`)
 * visually aligned. Exclusions win before normal prefix matching so a
 * privileged child route cannot also present its grower parent as active.
 */
export function isNavigationItemActive(
  pathname: string,
  item: NavigationActiveRule,
): boolean {
  if (item.excludedPaths?.some((path) => matchesPath(pathname, path))) {
    return false;
  }

  return [item.to, ...(item.aliases ?? [])].some((path) =>
    matchesPath(pathname, path, item.end),
  );
}
