// Pure history (time-travel) rules. Snapshots are recorded facts; nothing is interpolated.

/**
 * @typedef {{
 *   id: string,
 *   date: string,                 // ISO date (YYYY-MM-DD) the snapshot was recorded
 *   label: string,
 *   layout: Record<string, {x:number,z:number}>,
 *   stages: Record<string, { stage: "seedling"|"veg"|"flower"|"unknown", week: number|null, sex?: "female"|"male"|"unknown" }>,
 *   notes: Record<string, string>,
 *   photos: Record<string, { placeholder: true, caption: string }>,
 * }} Snapshot
 */

/** Sort snapshots ascending by date, then id, without mutating the input. */
export function sortSnapshots(snapshots) {
  return [...(snapshots ?? [])].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
  );
}

/**
 * The ordered list of selectable points on the history control: every recorded snapshot
 * plus "today" at the end. The slider snaps to these only; there are no in-between values.
 */
export function timelinePoints(snapshots, todayLabel = "Today") {
  const sorted = sortSnapshots(snapshots);
  return [
    ...sorted.map((s, i) => ({ index: i, id: s.id, date: s.date, label: s.label, isToday: false })),
    { index: sorted.length, id: "today", date: null, label: todayLabel, isToday: true },
  ];
}

/** Resolve a slider index to a point; out-of-range or invalid indexes resolve to today. */
export function pointAt(points, index) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const i = Number.isInteger(index) ? index : points.length - 1;
  if (i < 0 || i >= points.length) return points[points.length - 1];
  return points[i];
}

/**
 * Plant membership for a view. A plant appears in a historical view only if that
 * snapshot recorded a position for it; a plant that is gone today still appears in the
 * snapshots that recorded it. Returns sorted plant ids.
 */
export function membershipFor(viewLayout) {
  return Object.keys(viewLayout ?? {}).sort();
}

/**
 * Evidence available for a plant at a snapshot. Missing evidence is reported, never
 * invented: each field is either the recorded value or `null` with `missing: true`.
 */
export function evidenceFor(snapshot, plantId) {
  const stage = snapshot?.stages?.[plantId] ?? null;
  const note = snapshot?.notes?.[plantId] ?? null;
  const photo = snapshot?.photos?.[plantId] ?? null;
  const position = snapshot?.layout?.[plantId] ?? null;
  return {
    position: { value: position, missing: position == null },
    stage: { value: stage, missing: stage == null },
    note: { value: note, missing: note == null },
    photo: { value: photo, missing: photo == null },
  };
}

/**
 * Whether a transition between two views should animate pot movement. Movement between two
 * recorded layouts is only a visual aid for orientation; the UI must label it as such.
 * This rule only answers "are there any pots common to both views whose positions differ?".
 */
export function movedBetween(fromLayout, toLayout) {
  const moved = [];
  for (const id of Object.keys(fromLayout ?? {}).sort()) {
    const a = fromLayout[id];
    const b = toLayout?.[id];
    if (a && b && (a.x !== b.x || a.z !== b.z)) moved.push(id);
  }
  return moved;
}
