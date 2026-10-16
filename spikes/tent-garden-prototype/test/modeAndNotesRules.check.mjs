import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModeChange, cameraLocked } from "../src/rules/modeRules.js";
import { resolveDrop } from "../src/rules/layoutRules.js";
import {
  noteChanges,
  normalizeNote,
  buildSavePreview,
  batchIdFor,
  eventsForSave,
  applySave,
  undoLastSave,
} from "../src/rules/saveRules.js";
import { TODAY_LAYOUT, PLANTS_BY_ID } from "../src/data/sampleGarden.js";

const NOW = "2026-10-16T16:00:00.000Z";

test("regression: a repeated Edit Layout click keeps the draft instead of restarting it", () => {
  const r = resolveModeChange({ mode: "edit", hasUnsaved: true, isToday: true }, "edit");
  assert.deepEqual(r, { action: "noop", mode: "edit" });
  const clean = resolveModeChange({ mode: "edit", hasUnsaved: false, isToday: true }, "edit");
  assert.deepEqual(clean, { action: "noop", mode: "edit" });
});

test("view→edit starts a draft; edit→view asks only when there is something to lose", () => {
  assert.deepEqual(resolveModeChange({ mode: "view", hasUnsaved: false, isToday: true }, "edit"), {
    action: "start-draft",
    mode: "edit",
  });
  assert.deepEqual(resolveModeChange({ mode: "edit", hasUnsaved: true, isToday: true }, "view"), {
    action: "confirm-discard",
    mode: "edit",
  });
  assert.deepEqual(resolveModeChange({ mode: "edit", hasUnsaved: false, isToday: true }, "view"), {
    action: "switch",
    mode: "view",
  });
  assert.deepEqual(resolveModeChange({ mode: "view", hasUnsaved: false, isToday: false }, "edit"), {
    action: "noop",
    mode: "view",
  });
  assert.deepEqual(resolveModeChange(null, "view"), { action: "switch", mode: "view" });
});

test("camera is locked for the whole of Edit mode and free in View", () => {
  assert.equal(cameraLocked("edit"), true);
  assert.equal(cameraLocked("view"), false);
  assert.equal(cameraLocked(undefined), false);
});

test("noteChanges: trimming, round trips and clears are handled as net changes", () => {
  assert.equal(normalizeNote("  hi "), "hi");
  assert.equal(normalizeNote(null), "");
  assert.deepEqual(noteChanges({ "P-101": "old" }, { "P-101": " old " }), []);
  assert.deepEqual(noteChanges({}, { "P-103": "topped today" }), [
    { plantId: "P-103", from: "", to: "topped today" },
  ]);
  assert.deepEqual(noteChanges({ "P-101": "old" }, { "P-101": "" }), [
    { plantId: "P-101", from: "old", to: "" },
  ]);
  assert.deepEqual(noteChanges({ "P-101": "old" }, { "P-101": "typed", "P-101": "old" }), []);
});

test("save preview lists a note as its own item; saving logs one note event regardless of intent", () => {
  const draftLayout = resolveDrop(TODAY_LAYOUT, "P-106", { x: 40, z: 24 }).layout;
  const draftNotes = { "P-103": "Topped above node 5 (sample)." };
  const preview = buildSavePreview(TODAY_LAYOUT, draftLayout, PLANTS_BY_ID, {}, draftNotes);
  assert.deepEqual(
    preview.items.map((i) => i.key),
    ["move:P-106", "note:P-103"],
  );
  const batchId = batchIdFor(1, preview.changes, preview.notes);
  const events = eventsForSave({
    preview,
    intents: { "move:P-106": "map-only" },
    batchId,
    now: NOW,
    plantsById: PLANTS_BY_ID,
  });
  assert.equal(events.length, 1, "map-only move logs nothing; the note logs once");
  assert.equal(events[0].kind, "note.update");
  assert.equal(events[0].title, "Note on Marrow: Topped above node 5 (sample).");
});

test("note batches are idempotent and undo restores the previous notes", () => {
  const draftNotes = { "P-103": "first" };
  const preview = buildSavePreview(TODAY_LAYOUT, TODAY_LAYOUT, PLANTS_BY_ID, {}, draftNotes);
  const batchId = batchIdFor(1, preview.changes, preview.notes);
  assert.equal(batchId, batchIdFor(1, preview.changes, preview.notes));
  assert.notEqual(batchId, batchIdFor(1, [], noteChanges({}, { "P-103": "second" })));
  const events = eventsForSave({
    preview,
    intents: {},
    batchId,
    now: NOW,
    plantsById: PLANTS_BY_ID,
  });
  const state0 = {
    savedLayout: { ...TODAY_LAYOUT },
    savedNotes: {},
    events: [],
    appliedBatchIds: [],
    lastBatch: null,
  };
  const saved = applySave(state0, {
    batchId,
    draft: TODAY_LAYOUT,
    notes: draftNotes,
    events,
  }).state;
  assert.deepEqual(saved.savedNotes, { "P-103": "first" });
  assert.equal(
    applySave(saved, { batchId, draft: TODAY_LAYOUT, notes: draftNotes, events }).duplicate,
    true,
  );
  const undone = undoLastSave(saved).state;
  assert.deepEqual(undone.savedNotes, {});
  assert.equal(undone.events[0].undone, true);
});
