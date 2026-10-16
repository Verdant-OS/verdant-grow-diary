// Pure draft/save/undo rules. No clock: `now` is injected as an ISO string.
// Simulated Timeline events are prototype-local objects, never diary writes.

import { netChanges, pairSwaps, describePosition } from "./layoutRules.js";

/**
 * Intent per changed plant, chosen by the grower in the Save preview:
 *  "physical" — the pot was actually moved in the real tent (produces a simulated event)
 *  "map-only" — the map was wrong and is being corrected (no event)
 * @typedef {"physical" | "map-only"} ChangeIntent
 */

/**
 * Build the Save preview from a baseline and a draft.
 * Returns the final net changes, grouped into swaps and single moves, with no events yet.
 */
export function buildSavePreview(baseline, draft, plantsById, baselineNotes, draftNotes) {
  const changes = netChanges(baseline, draft);
  const notes = noteChanges(baselineNotes, draftNotes);
  const { swaps, singles } = pairSwaps(changes);
  const name = (id) => plantsById?.[id]?.shortName ?? id;
  const items = [];
  for (const n of notes) {
    items.push({
      key: `note:${n.plantId}`,
      kind: "note",
      plantIds: [n.plantId],
      label: n.to
        ? `Note for ${name(n.plantId)} (${n.plantId}): "${n.to}"`
        : `Clear note for ${name(n.plantId)} (${n.plantId})`,
      from: n.from,
      to: n.to,
    });
  }
  for (const s of swaps) {
    items.push({
      key: `swap:${[s.aId, s.bId].sort().join("+")}`,
      kind: "swap",
      plantIds: [s.aId, s.bId].sort(),
      label: `Swap ${name(s.aId)} (${s.aId}) and ${name(s.bId)} (${s.bId})`,
    });
  }
  for (const c of singles) {
    items.push({
      key: `move:${c.plantId}`,
      kind: "move",
      plantIds: [c.plantId],
      label: `Move ${name(c.plantId)} (${c.plantId}) from ${describePosition(c.from)} to ${describePosition(c.to)}`,
      from: c.from,
      to: c.to,
    });
  }
  items.sort((a, b) => a.key.localeCompare(b.key));
  return { changes, notes, items, isEmpty: items.length === 0 };
}

/** Normalise a draft note: trimmed string, or "" when empty/missing. */
export function normalizeNote(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Net note changes between saved notes and draft notes, sorted by plant id. A note typed and
 * then restored to its saved text is not a change. Returns [{ plantId, from, to }].
 */
export function noteChanges(baselineNotes, draftNotes) {
  const out = [];
  const ids = new Set([...Object.keys(baselineNotes ?? {}), ...Object.keys(draftNotes ?? {})]);
  for (const id of [...ids].sort()) {
    const from = normalizeNote(baselineNotes?.[id]);
    const to = normalizeNote(draftNotes?.[id]);
    if (from !== to) out.push({ plantId: id, from, to });
  }
  return out;
}

/**
 * Deterministic batch id for a save attempt. The same baseline, draft and sequence number
 * always produce the same id, so a retry of a failed save reuses the batch and cannot
 * duplicate events.
 */
export function batchIdFor(saveSeq, changes, notes = []) {
  const body = [
    ...changes.map((c) => `${c.plantId}:${c.from.x},${c.from.z}>${c.to.x},${c.to.z}`),
    ...notes.map((n) => `note:${n.plantId}:${hashString(n.to)}`),
  ].join("|");
  return `batch-${saveSeq}-${hashString(body)}`;
}

/** Small deterministic string hash (FNV-1a, 32-bit) rendered as hex. */
export function hashString(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Produce the simulated events for a confirmed save.
 * Only items marked "physical" produce events; a swap produces exactly one combined event.
 * `intents` maps item.key -> ChangeIntent. Missing intent defaults to "map-only"
 * (the safer default: no event is fabricated unless the grower said the pot moved).
 */
export function eventsForSave({ preview, intents, batchId, now, plantsById }) {
  const events = [];
  for (const item of preview.items) {
    const names = item.plantIds.map((id) => plantsById?.[id]?.shortName ?? id);
    if (item.kind === "note") {
      // A note is itself a record, so saving one always logs exactly one simulated event.
      events.push({
        id: `${batchId}:${item.key}`,
        batchId,
        kind: item.to ? "note.update" : "note.clear",
        plantIds: [...item.plantIds],
        title: item.to ? `Note on ${names[0]}: ${item.to}` : `Cleared note on ${names[0]}`,
        detail: item.label,
        recordedAt: now,
        source: "simulated",
        undone: false,
      });
      continue;
    }
    const intent = intents?.[item.key] ?? "map-only";
    if (intent !== "physical") continue;
    events.push({
      id: `${batchId}:${item.key}`,
      batchId,
      kind: item.kind === "swap" ? "layout.swap" : "layout.move",
      plantIds: [...item.plantIds],
      title:
        item.kind === "swap"
          ? `Swapped ${names[0]} and ${names[1]}`
          : `Moved ${names[0]} to ${describePosition(item.to)}`,
      detail: item.label,
      recordedAt: now,
      source: "simulated",
      undone: false,
    });
  }
  return events;
}

/**
 * Apply a save batch to the saved state. Idempotent on batchId: applying the same batch
 * twice returns the state unchanged and reports `duplicate: true`.
 *
 * @param state { savedLayout, events, appliedBatchIds, lastBatch }
 */
export function applySave(state, { batchId, draft, notes, events }) {
  if (state.appliedBatchIds.includes(batchId)) {
    return { state, duplicate: true };
  }
  const next = {
    savedLayout: { ...draft },
    savedNotes: { ...(notes ?? state.savedNotes ?? {}) },
    events: [...state.events, ...events],
    appliedBatchIds: [...state.appliedBatchIds, batchId],
    lastBatch: {
      batchId,
      previousLayout: { ...state.savedLayout },
      previousNotes: { ...(state.savedNotes ?? {}) },
      eventIds: events.map((e) => e.id),
    },
  };
  return { state: next, duplicate: false };
}

/**
 * Undo the most recent saved batch: restore its previous layout and mark its events Undone.
 * Events are never deleted — the record that a move was logged and then undone stays visible.
 * Returns the input state unchanged when there is nothing to undo.
 */
export function undoLastSave(state) {
  const last = state.lastBatch;
  if (!last) return { state, undone: false };
  const ids = new Set(last.eventIds);
  return {
    undone: true,
    state: {
      ...state,
      savedLayout: { ...last.previousLayout },
      savedNotes: { ...(last.previousNotes ?? {}) },
      events: state.events.map((e) => (ids.has(e.id) ? { ...e, undone: true } : e)),
      lastBatch: null,
    },
  };
}

/**
 * A pending (failed) save is only retryable while nothing underneath it has moved.
 * It records the batch id it was built from; the caller recomputes the id from the current
 * saved baseline + draft and compares. Any difference — an Undo of a saved batch, a new
 * draft edit, a note change — invalidates the pending save so Retry cannot restore stale
 * content.
 */
export function pendingIsCurrent(pending, { saveSeq, baseline, draft, baselineNotes, draftNotes }) {
  if (!pending?.batchId) return false;
  const changes = netChanges(baseline, draft);
  const notes = noteChanges(baselineNotes, draftNotes);
  if (changes.length === 0 && notes.length === 0) return false;
  return batchIdFor(saveSeq, changes, notes) === pending.batchId;
}

/** Draft history helpers for pre-save Undo. Pure stack operations. */
export function pushDraft(history, draft) {
  return [...history, { ...draft }];
}

export function popDraft(history) {
  if (history.length <= 1) return { history, draft: history[0] ?? null, undone: false };
  const next = history.slice(0, -1);
  return { history: next, draft: next[next.length - 1], undone: true };
}

/**
 * Whether the Save control should be enabled. A note that is still being typed (no blur, so
 * not yet committed to the draft) must count: the grower may click Save straight from the
 * field, and openSave commits the live text first.
 */
export function canSave(input) {
  if (!input) return false;
  if (input.pendingFailed) return true;
  const n = (Number(input.changeCount) || 0) + (Number(input.noteChangeCount) || 0);
  return n > 0 || !!input.liveNoteDirty;
}
