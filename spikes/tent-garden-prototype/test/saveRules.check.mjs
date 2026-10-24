import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDrop, swapPositions } from "../src/rules/layoutRules.js";
import {
  buildSavePreview,
  batchIdFor,
  hashString,
  eventsForSave,
  applySave,
  undoLastSave,
  pushDraft,
  popDraft,
} from "../src/rules/saveRules.js";
import { TODAY_LAYOUT, PLANTS_BY_ID } from "../src/data/sampleGarden.js";

const NOW = "2026-10-16T15:00:00.000Z";

function freshState() {
  return { savedLayout: { ...TODAY_LAYOUT }, events: [], appliedBatchIds: [], lastBatch: null };
}

test("buildSavePreview is empty when the draft equals the baseline", () => {
  const preview = buildSavePreview(TODAY_LAYOUT, { ...TODAY_LAYOUT }, PLANTS_BY_ID);
  assert.equal(preview.isEmpty, true);
  assert.deepEqual(preview.items, []);
});

test("buildSavePreview lists net changes with names and ids, swaps as one item", () => {
  let draft = swapPositions(TODAY_LAYOUT, "P-101", "P-102");
  draft = resolveDrop(draft, "P-106", { x: 40, z: 24 }).layout;
  const preview = buildSavePreview(TODAY_LAYOUT, draft, PLANTS_BY_ID);
  assert.equal(preview.items.length, 2);
  const keys = preview.items.map((i) => i.key);
  assert.deepEqual(keys, ["move:P-106", "swap:P-101+P-102"]);
  assert.match(preview.items[1].label, /Ember \(P-101\)/);
  assert.match(preview.items[1].label, /Juniper \(P-102\)/);
  assert.match(preview.items[0].label, /from x 24 in, z 40 in to x 40 in, z 24 in/);
});

test("hashString and batchIdFor are deterministic", () => {
  assert.equal(hashString("abc"), hashString("abc"));
  assert.notEqual(hashString("abc"), hashString("abd"));
  const changes = buildSavePreview(
    TODAY_LAYOUT,
    resolveDrop(TODAY_LAYOUT, "P-106", { x: 40, z: 24 }).layout,
  ).changes;
  assert.equal(batchIdFor(1, changes), batchIdFor(1, changes));
  assert.notEqual(batchIdFor(1, changes), batchIdFor(2, changes));
});

test("only physical moves produce events; map-only and missing intent produce none", () => {
  let draft = swapPositions(TODAY_LAYOUT, "P-101", "P-102");
  draft = resolveDrop(draft, "P-106", { x: 40, z: 24 }).layout;
  draft = resolveDrop(draft, "P-105", { x: 24, z: 10 }).layout;
  const preview = buildSavePreview(TODAY_LAYOUT, draft, PLANTS_BY_ID);
  const batchId = batchIdFor(1, preview.changes);
  const events = eventsForSave({
    preview,
    intents: { "swap:P-101+P-102": "physical", "move:P-106": "map-only" },
    batchId,
    now: NOW,
    plantsById: PLANTS_BY_ID,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "layout.swap");
  assert.equal(events[0].title, "Swapped Ember and Juniper");
  assert.deepEqual(events[0].plantIds, ["P-101", "P-102"]);
  assert.equal(events[0].source, "simulated");
  assert.equal(events[0].recordedAt, NOW);
  assert.equal(events[0].undone, false);
});

test("applySave is idempotent on batchId so a retry cannot duplicate events", () => {
  const draft = resolveDrop(TODAY_LAYOUT, "P-106", { x: 40, z: 24 }).layout;
  const preview = buildSavePreview(TODAY_LAYOUT, draft, PLANTS_BY_ID);
  const batchId = batchIdFor(1, preview.changes);
  const events = eventsForSave({
    preview,
    intents: { "move:P-106": "physical" },
    batchId,
    now: NOW,
    plantsById: PLANTS_BY_ID,
  });
  const first = applySave(freshState(), { batchId, draft, events });
  assert.equal(first.duplicate, false);
  assert.equal(first.state.events.length, 1);
  assert.deepEqual(first.state.savedLayout["P-106"], { x: 40, z: 24 });
  const second = applySave(first.state, { batchId, draft, events });
  assert.equal(second.duplicate, true);
  assert.equal(second.state, first.state);
  assert.equal(second.state.events.length, 1);
});

test("undoLastSave restores the prior layout and marks events Undone without deleting them", () => {
  const draft = resolveDrop(TODAY_LAYOUT, "P-106", { x: 40, z: 24 }).layout;
  const preview = buildSavePreview(TODAY_LAYOUT, draft, PLANTS_BY_ID);
  const batchId = batchIdFor(1, preview.changes);
  const events = eventsForSave({
    preview,
    intents: { "move:P-106": "physical" },
    batchId,
    now: NOW,
    plantsById: PLANTS_BY_ID,
  });
  const saved = applySave(freshState(), { batchId, draft, events }).state;
  const { state, undone } = undoLastSave(saved);
  assert.equal(undone, true);
  assert.deepEqual(state.savedLayout, TODAY_LAYOUT);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].undone, true);
  assert.equal(state.lastBatch, null);
  const again = undoLastSave(state);
  assert.equal(again.undone, false);
  assert.equal(again.state, state);
});

test("draft history: pop undoes the last draft step and never empties the stack", () => {
  let history = pushDraft([], TODAY_LAYOUT);
  const step = resolveDrop(TODAY_LAYOUT, "P-106", { x: 40, z: 24 }).layout;
  history = pushDraft(history, step);
  const popped = popDraft(history);
  assert.equal(popped.undone, true);
  assert.deepEqual(popped.draft, TODAY_LAYOUT);
  const bottom = popDraft(popped.history);
  assert.equal(bottom.undone, false);
  assert.deepEqual(bottom.draft, TODAY_LAYOUT);
  assert.equal(popDraft([]).draft, null);
});
