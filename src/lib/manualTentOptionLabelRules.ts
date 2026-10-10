/**
 * Visible labels for the manual sensor-reading tent chooser.
 *
 * Option values stay the tent id. A name that is unique among the tents in
 * the chooser is returned unchanged. When two tents share a trimmed name,
 * the label adds the grow name when that grow name is unique inside the
 * collision, otherwise a stable id suffix.
 *
 * Pure. No React, no storage, no clock.
 */

export interface ManualTentLabelInput {
  readonly id: string;
  readonly name: string;
  readonly growName?: string | null;
}

const SEPARATOR = " · ";

function trimmedGrowName(tent: ManualTentLabelInput): string | null {
  if (typeof tent.growName !== "string") return null;
  const trimmed = tent.growName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compactId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/** Last 4 characters, then 4 more, until the suffix is unique among peers. */
export function stableTentIdSuffix(id: string, peerIds: readonly string[]): string {
  const mine = compactId(id);
  const others = peerIds.filter((peerId) => peerId !== id).map(compactId);
  for (let length = 4; length <= mine.length; length += 4) {
    const slice = mine.slice(-length);
    const clashes = others.some((peer) => peer.slice(-length) === slice);
    if (!clashes) return slice;
  }
  return id;
}

function disambiguatedLabel(
  tent: ManualTentLabelInput,
  peers: readonly ManualTentLabelInput[],
): string {
  const base = tent.name.trim();
  const growName = trimmedGrowName(tent);
  if (growName) {
    const sameGrow = peers.filter((peer) => trimmedGrowName(peer) === growName);
    if (sameGrow.length === 1) {
      return base.length > 0 ? `${base}${SEPARATOR}${growName}` : growName;
    }
  }
  const suffix = stableTentIdSuffix(
    tent.id,
    peers.map((peer) => peer.id),
  );
  return base.length > 0 ? `${base}${SEPARATOR}${suffix}` : suffix;
}

/**
 * Map tent id → visible label. Unique names keep the original `name` string,
 * including surrounding whitespace. Colliding names are disambiguated.
 */
export function manualTentOptionLabels(
  tents: readonly ManualTentLabelInput[],
): ReadonlyMap<string, string> {
  const groups = new Map<string, ManualTentLabelInput[]>();
  for (const tent of tents) {
    const key = tent.name.trim();
    const group = groups.get(key);
    if (group) group.push(tent);
    else groups.set(key, [tent]);
  }

  const labels = new Map<string, string>();
  for (const tent of tents) {
    const peers = groups.get(tent.name.trim()) ?? [tent];
    labels.set(tent.id, peers.length === 1 ? tent.name : disambiguatedLabel(tent, peers));
  }
  return labels;
}

export function manualTentGrowName(
  growId: string | null | undefined,
  grows: readonly { readonly id: string; readonly name?: string | null }[],
): string | null {
  if (typeof growId !== "string" || growId.length === 0 || !Array.isArray(grows)) return null;
  const grow = grows.find((row) => row.id === growId);
  if (!grow || typeof grow.name !== "string") return null;
  const trimmed = grow.name.trim();
  return trimmed.length > 0 ? trimmed : null;
}
