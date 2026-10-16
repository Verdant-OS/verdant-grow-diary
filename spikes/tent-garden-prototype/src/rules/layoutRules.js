// Pure layout rules for the Tent Garden prototype.
// No DOM, no Three.js, no clock, no randomness. All units are inches on the tent floor,
// origin at the back-left corner, x to the right, z toward the door (front).

/** @typedef {{ x: number, z: number }} Position */
/** @typedef {Record<string, Position>} Layout plantId -> recorded position */

export const TENT = Object.freeze({
  widthIn: 48,
  depthIn: 48,
  snapIn: 2,
  potRadiusIn: 5.5,
  /** The side of the tent the zippered door is on. Fixed for the prototype. */
  doorSide: "front",
});

/** Round a value to the snap grid. Deterministic for identical inputs. */
export function snapToGrid(value, snap = TENT.snapIn) {
  if (!Number.isFinite(value) || !Number.isFinite(snap) || snap <= 0) return 0;
  return Math.round(value / snap) * snap;
}

/** Clamp a position so the whole pot stays inside the tent floor. */
export function clampToTent(pos, tent = TENT) {
  const r = tent.potRadiusIn;
  const x = Number.isFinite(pos?.x) ? pos.x : r;
  const z = Number.isFinite(pos?.z) ? pos.z : r;
  return {
    x: Math.min(Math.max(x, r), tent.widthIn - r),
    z: Math.min(Math.max(z, r), tent.depthIn - r),
  };
}

export function isInBounds(pos, tent = TENT) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const r = tent.potRadiusIn;
  return pos.x >= r && pos.x <= tent.widthIn - r && pos.z >= r && pos.z <= tent.depthIn - r;
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function potsOverlap(a, b, tent = TENT) {
  return distance(a, b) < tent.potRadiusIn * 2 - 1e-9;
}

export function samePosition(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
}

/**
 * Find the plant (other than `exceptId`) whose pot overlaps `pos`, or null.
 * Deterministic: ties resolve by ascending plant id.
 */
export function findOccupant(layout, pos, exceptId, tent = TENT) {
  const ids = Object.keys(layout)
    .filter((id) => id !== exceptId)
    .sort();
  for (const id of ids) {
    if (potsOverlap(layout[id], pos, tent)) return id;
  }
  return null;
}

/**
 * Resolve a drop of `plantId` at a raw (unsnapped) position.
 * Returns one of:
 *  - { kind: "move", layout }           the pot moves to the snapped position
 *  - { kind: "noop", layout }           snapped position equals the current one
 *  - { kind: "swap-needed", withId, target }  another pot occupies the spot; caller must confirm
 *  - { kind: "rejected", reason, layout }     out of bounds / unknown plant / invalid input
 * The input layout is never mutated.
 */
export function resolveDrop(layout, plantId, rawPos, tent = TENT) {
  if (!layout || !plantId || !layout[plantId]) {
    return { kind: "rejected", reason: "unknown-plant", layout };
  }
  if (!rawPos || !Number.isFinite(rawPos.x) || !Number.isFinite(rawPos.z)) {
    return { kind: "rejected", reason: "invalid-position", layout };
  }
  const target = { x: snapToGrid(rawPos.x, tent.snapIn), z: snapToGrid(rawPos.z, tent.snapIn) };
  if (!isInBounds(target, tent)) {
    return { kind: "rejected", reason: "out-of-bounds", layout };
  }
  if (samePosition(target, layout[plantId])) {
    return { kind: "noop", layout };
  }
  const occupant = findOccupant(layout, target, plantId, tent);
  if (occupant) {
    return { kind: "swap-needed", withId: occupant, target };
  }
  return { kind: "move", layout: { ...layout, [plantId]: target } };
}

/** Swap two pots' recorded positions. Returns a new layout; invalid ids return the input. */
export function swapPositions(layout, aId, bId) {
  if (!layout || !layout[aId] || !layout[bId] || aId === bId) return layout;
  return { ...layout, [aId]: { ...layout[bId] }, [bId]: { ...layout[aId] } };
}

/**
 * Net changes between a baseline layout and a draft layout.
 * Intermediate moves are invisible by construction: only final positions are compared.
 * Sorted by plant id so the output is stable.
 */
export function netChanges(baseline, draft) {
  const out = [];
  const ids = new Set([...Object.keys(baseline ?? {}), ...Object.keys(draft ?? {})]);
  for (const id of [...ids].sort()) {
    const from = baseline?.[id];
    const to = draft?.[id];
    if (from && to && !samePosition(from, to)) {
      out.push({ plantId: id, from: { ...from }, to: { ...to } });
    }
  }
  return out;
}

/**
 * Detect confirmed swaps inside a change list: two plants whose from/to are mirror images.
 * Returns { swaps: [{ aId, bId }], singles: [...changes not part of a swap] }.
 */
export function pairSwaps(changes) {
  const used = new Set();
  const swaps = [];
  const singles = [];
  for (let i = 0; i < changes.length; i++) {
    if (used.has(i)) continue;
    let matched = false;
    for (let j = i + 1; j < changes.length; j++) {
      if (used.has(j)) continue;
      const a = changes[i];
      const b = changes[j];
      if (samePosition(a.from, b.to) && samePosition(a.to, b.from)) {
        swaps.push({ aId: a.plantId, bId: b.plantId });
        used.add(i);
        used.add(j);
        matched = true;
        break;
      }
    }
    if (!matched) singles.push(changes[i]);
  }
  return { swaps, singles };
}

/** Validate a whole layout: every pot in bounds and no two pots overlapping. */
export function validateLayout(layout, tent = TENT) {
  const problems = [];
  const ids = Object.keys(layout ?? {}).sort();
  for (const id of ids) {
    if (!isInBounds(layout[id], tent)) problems.push({ plantId: id, problem: "out-of-bounds" });
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (potsOverlap(layout[ids[i]], layout[ids[j]], tent)) {
        problems.push({ plantId: ids[i], problem: "overlaps", withId: ids[j] });
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Human-readable grid cell, e.g. "x 24 in, z 36 in". Pure formatting. */
export function describePosition(pos) {
  if (!pos) return "no recorded position";
  return `x ${pos.x} in, z ${pos.z} in`;
}
