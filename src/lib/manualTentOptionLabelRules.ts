/**
 * Visible labels for the manual sensor-reading tent chooser.
 *
 * Option values stay the tent id. A name that is unique among the tents in
 * the chooser is returned unchanged. When two tents share a trimmed name,
 * the label adds the grow name when that grow name is unique inside the
 * collision, otherwise a stable id suffix. A later pass lengthens or
 * reformats that suffix until every visible label is unique. A tent whose
 * name is already unique keeps that name, including its original whitespace.
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

function suffixCandidates(id: string): string[] {
  const mine = compactId(id);
  const candidates: string[] = [];
  for (let length = 4; length <= mine.length; length += 4) {
    candidates.push(mine.slice(-length));
  }
  if (candidates[candidates.length - 1] !== mine) candidates.push(mine);
  candidates.push(`id ${mine}`);
  if (id !== mine) candidates.push(`id ${id}`);
  return candidates;
}

function withSuffix(base: string, suffix: string): string {
  return base.length > 0 ? `${base}${SEPARATOR}${suffix}` : suffix;
}

/** First suffix label that is not already used by another option. */
function firstFreeSuffixLabel(base: string, id: string, used: ReadonlySet<string>): string {
  for (const suffix of suffixCandidates(id)) {
    const label = withSuffix(base, suffix);
    if (!used.has(label)) return label;
  }
  const prefix = base.length > 0 ? `${base}${SEPARATOR}` : "";
  let label = `${prefix}id ${id}`;
  let n = 2;
  while (used.has(label)) {
    label = `${prefix}id ${id} ${n}`;
    n += 1;
  }
  return label;
}

function ownersOf(labels: ReadonlyMap<string, string>, label: string): string[] {
  const owners: string[] = [];
  for (const [id, value] of labels) {
    if (value === label) owners.push(id);
  }
  owners.sort();
  return owners;
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

  const plainNames = new Set(
    tents
      .filter((tent) => (groups.get(tent.name.trim()) ?? [tent]).length === 1)
      .map((tent) => tent.name),
  );
  const movers = tents
    .filter((tent) => (groups.get(tent.name.trim()) ?? [tent]).length > 1)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const tent of movers) {
    const label = labels.get(tent.id);
    if (label === undefined) continue;
    const reservedByPlainName = plainNames.has(label);
    const owners = ownersOf(labels, label);
    if (!reservedByPlainName && owners.length === 1) continue;
    if (!reservedByPlainName && owners[0] === tent.id) continue;
    const used = new Set<string>();
    for (const [id, value] of labels) {
      if (id !== tent.id) used.add(value);
    }
    labels.set(tent.id, firstFreeSuffixLabel(tent.name.trim(), tent.id, used));
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
