const MAX_OPEN_SUBJECT_LENGTH = 80;
const MAX_OPEN_CONTEXT_LENGTH = 40;
const MAX_OPEN_COLLISION_SUFFIX_LENGTH = 24;

/**
 * Separates a minute clock label from a legacy entry-id suffix.
 * The id is discarded so a screen reader never speaks a raw row id.
 */
const OPEN_ENTRY_KEY_MARK = " #";

function cleanOpenSubject(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OPEN_SUBJECT_LENGTH) return "";
  return trimmed;
}

/** A short spoken excerpt. Blank stays blank. A long value keeps its start. */
function conciseOpenContext(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= MAX_OPEN_CONTEXT_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_OPEN_CONTEXT_LENGTH).trimEnd();
}

function readTimelineOpenClock(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  const mark = trimmed.lastIndexOf(OPEN_ENTRY_KEY_MARK);
  const clock = mark === -1 ? trimmed : trimmed.slice(0, mark);
  return cleanOpenSubject(clock);
}

/**
 * One spoken context for an Open control.
 * The grower's note wins. A blank or unusable note falls through to the
 * plant name, then the tent name. Each value is capped to a short excerpt.
 */
export function timelineEntryOpenContext(input: {
  plantName?: string | null;
  tentName?: string | null;
  note?: string | null;
}): string {
  const note = conciseOpenContext(input.note);
  if (note) return note;
  const plant = conciseOpenContext(input.plantName);
  if (plant) return plant;
  return conciseOpenContext(input.tentName);
}

/**
 * Accessible name for one timeline card's Open control.
 * Title and date are both optional; a missing pair stays a generic "Open entry".
 * `differentiator` is the minute clock. A legacy ` #entryId` suffix is ignored.
 * `context` is an optional plant, tent, or note excerpt.
 */
export function timelineEntryOpenAccessibleName(input: {
  title: string | null | undefined;
  occurredAtLabel: string | null | undefined;
  differentiator?: string | null | undefined;
  context?: string | null | undefined;
}): string {
  const title = cleanOpenSubject(input.title);
  const when = cleanOpenSubject(input.occurredAtLabel);
  const clock = readTimelineOpenClock(input.differentiator);
  const context = conciseOpenContext(input.context);
  const subject = [title, when, clock, context].filter((part) => part.length > 0).join(" ");
  return subject.length > 0 ? `Open ${subject}` : "Open entry";
}

function normalizeOpenNote(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function sharedPrefix(values: readonly string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0] ?? "";
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? "";
    const limit = Math.min(prefix.length, value.length);
    let length = 0;
    while (length < limit && prefix[length] === value[length]) length += 1;
    prefix = prefix.slice(0, length);
    if (prefix.length === 0) return "";
  }
  return prefix;
}

type OpenLabelRow = { id: string; label: string; note?: string | null };

function spokenCollisionSuffix(note: string, prefix: string): string {
  return note.slice(prefix.length).trim().slice(0, MAX_OPEN_COLLISION_SUFFIX_LENGTH).trimEnd();
}

function assignSameNoteFallback(
  indexes: readonly number[],
  rows: readonly OpenLabelRow[],
  resolved: Map<string, string>,
): void {
  indexes.forEach((index, position) => {
    const row = rows[index];
    if (!row) return;
    resolved.set(row.id, `${row.label} same note ${position + 1}`);
  });
}

/**
 * Split one colliding set. A 24-character suffix can still match when another
 * row shortens the shared prefix, so a tied full-length suffix is resolved
 * again on just those rows. Identical notes get a spoken position.
 */
function assignCollisionGroup(
  indexes: readonly number[],
  rows: readonly OpenLabelRow[],
  resolved: Map<string, string>,
  parentPrefixLength: number,
): void {
  const first = rows[indexes[0] ?? -1];
  if (!first) return;
  if (indexes.length < 2) {
    resolved.set(first.id, first.label);
    return;
  }
  const notes = indexes.map((index) => normalizeOpenNote(rows[index]?.note));
  const prefix = sharedPrefix(notes);
  if (prefix.length <= parentPrefixLength) {
    assignSameNoteFallback(indexes, rows, resolved);
    return;
  }
  const spoken = notes.map((note) => spokenCollisionSuffix(note, prefix));
  const buckets = new Map<string, number[]>();
  indexes.forEach((index, position) => {
    const key = spoken[position] ?? "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  });
  const madeProgress = buckets.size > 1 && spoken.some((key) => key.length > 0);
  if (!madeProgress) {
    assignSameNoteFallback(indexes, rows, resolved);
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.length === 1) {
      const row = rows[bucket[0] ?? -1];
      if (!row) continue;
      resolved.set(row.id, key.length > 0 ? `${row.label} ${key}` : row.label);
      continue;
    }
    if (key.length < MAX_OPEN_COLLISION_SUFFIX_LENGTH) {
      assignSameNoteFallback(bucket, rows, resolved);
      continue;
    }
    assignCollisionGroup(bucket, rows, resolved, prefix.length);
  }
}

function ensureUniqueOpenLabels(
  resolved: Map<string, string>,
  rows: readonly OpenLabelRow[],
): void {
  for (let pass = 0; pass < rows.length; pass += 1) {
    const indexesByLabel = new Map<string, number[]>();
    rows.forEach((row, index) => {
      const label = resolved.get(row.id) ?? row.label;
      const indexes = indexesByLabel.get(label);
      if (indexes) indexes.push(index);
      else indexesByLabel.set(label, [index]);
    });
    const collisions = [...indexesByLabel.values()].filter((indexes) => indexes.length > 1);
    if (collisions.length === 0) return;
    for (const indexes of collisions) assignSameNoteFallback(indexes, rows, resolved);
  }
}

/**
 * When rendered Open names match, speak the part of each note that the
 * shared start does not already cover. The 40-character excerpt and the
 * 24-character suffix can both hide a later difference. Identical notes
 * get a spoken position. Raw entry ids stay unspoken.
 */
export function resolveCollidingOpenLabels(
  rows: readonly OpenLabelRow[],
): ReadonlyMap<string, string> {
  const indexesByLabel = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const indexes = indexesByLabel.get(row.label);
    if (indexes) indexes.push(index);
    else indexesByLabel.set(row.label, [index]);
  });

  const resolved = new Map<string, string>();
  for (const indexes of indexesByLabel.values()) {
    assignCollisionGroup(indexes, rows, resolved, -1);
  }
  ensureUniqueOpenLabels(resolved, rows);
  return resolved;
}
