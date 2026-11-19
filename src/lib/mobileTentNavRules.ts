/**
 * Mobile bottom-bar Tent destination — pure, deterministic, null-safe.
 *
 * Tent opens the grower's tent. It never guesses between several tents:
 *  1. the tent page the grower is already on (when it is one of their tents);
 *  2. their only active tent;
 *  3. the only tent in their active grow;
 *  4. otherwise Home ("/").
 */

export interface MobileTentNavTent {
  id?: unknown;
  grow_id?: unknown;
}

export interface MobileTentNavInput {
  pathname: string | null | undefined;
  tents: ReadonlyArray<MobileTentNavTent | null | undefined> | null | undefined;
  activeGrowId?: string | null;
}

export const MOBILE_TENT_HOME_HREF = "/";

const TENT_PATH = /^\/tents\/([^/?#]+)\/?$/;

function tentHref(id: string): string {
  return `/tents/${encodeURIComponent(id)}`;
}

function tentIdFromPath(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string") return null;
  const match = TENT_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function resolveMobileTentHref(input: MobileTentNavInput): string {
  const tents = Array.isArray(input.tents)
    ? input.tents.filter(
        (t): t is { id: string; grow_id?: unknown } =>
          !!t && typeof t.id === "string" && t.id.trim().length > 0,
      )
    : [];
  if (tents.length === 0) return MOBILE_TENT_HOME_HREF;

  const currentId = tentIdFromPath(input.pathname);
  if (currentId && tents.some((t) => t.id === currentId)) return tentHref(currentId);

  if (tents.length === 1) return tentHref(tents[0].id);

  const growId = typeof input.activeGrowId === "string" ? input.activeGrowId.trim() : "";
  if (growId) {
    const inGrow = tents.filter((t) => t.grow_id === growId);
    if (inGrow.length === 1) return tentHref(inGrow[0].id);
  }
  return MOBILE_TENT_HOME_HREF;
}
