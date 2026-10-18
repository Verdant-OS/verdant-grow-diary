import { test } from "node:test";
import assert from "node:assert/strict";
import { editLeaveControls } from "../src/rules/modeRules.js";

test("Edit Layout with no draft changes offers Done, which returns to View", () => {
  assert.deepEqual(editLeaveControls({ changeCount: 0, noteChangeCount: 0, saveFailed: false }), {
    kind: "clean",
    buttons: ["done"],
  });
  assert.deepEqual(editLeaveControls({ changeCount: 0, noteChangeCount: 0 }), {
    kind: "clean",
    buttons: ["done"],
  });
  assert.deepEqual(editLeaveControls(null), { kind: "clean", buttons: ["done"] });
});

test("Edit Layout with draft changes keeps Undo, Cancel and Save", () => {
  assert.deepEqual(editLeaveControls({ changeCount: 1, noteChangeCount: 0, saveFailed: false }), {
    kind: "draft",
    buttons: ["undo", "cancel", "save"],
  });
  assert.deepEqual(editLeaveControls({ changeCount: 0, noteChangeCount: 2, saveFailed: false }), {
    kind: "draft",
    buttons: ["undo", "cancel", "save"],
  });
  assert.deepEqual(editLeaveControls({ changeCount: 0, noteChangeCount: 0, saveFailed: true }), {
    kind: "draft",
    buttons: ["undo", "cancel", "save"],
  });
});
