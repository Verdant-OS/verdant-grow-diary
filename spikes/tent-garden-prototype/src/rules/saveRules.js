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
export function buildSavePreview(baseline, draft, plantsById) {
  const changes = netChanges(baseline, draft);
  const { swaps, singles } = pairSwaps(changes);
  const name = (id) => plantsById?.[id]?.shortName ?? id;
  const items = [];
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
  return { changes, items, isEmpty: items.length === 0 };
}

/**
 * Deterministic batch id for a save attempt. The same baseline, draft and sequence number
 * always produce the same id, so a retry of a failed save reuses the batch and cannot
 * duplicate events.
 */
export function batchIdFor(saveSeq, changes) {
  const body = changes
    .map((c) => `${c.plantId}:${c.from.x},${c.from.z}>${c.to.x},${c.to.z}`)
    .join("|");
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
    const intent = intents?.[item.key] ?? "map-only";
    if (intent !== "physical") continue;
    const names = item.plantIds.map((id) => plantsById?.[id]?.shortName ?? id);
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
export function applySave(state, { batchId, draft, events }) {
  if (state.appliedBatchIds.includes(batchId)) {
    return { state, duplicate: true };
  }
  const next = {
    savedLayout: { ...draft },
    events: [...state.events, ...events],
    appliedBatchIds: [...state.appliedBatchIds, batchId],
    lastBatch: {
      batchId,
      previousLayout: { ...state.savedLayout },
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
      events: state.events.map((e) => (ids.has(e.id) ? { ...e, undone: true } : e)),
      lastBatch: null,
    },
  };
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
