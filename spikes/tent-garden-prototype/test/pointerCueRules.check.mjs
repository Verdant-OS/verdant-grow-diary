import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pointerCue, EMPTY_DETAILS_HINT } from "../src/rules/pointerCueRules.js";

test("a fine pointer over a pot or a label shows a pointer cursor and a highlight", () => {
  assert.deepEqual(pointerCue({ finePointer: true, overTarget: true }), {
    cursor: "pointer",
    highlight: true,
  });
  assert.deepEqual(pointerCue({ finePointer: true, overTarget: false }), {
    cursor: "default",
    highlight: false,
  });
  assert.deepEqual(pointerCue({ finePointer: false, overTarget: true }), {
    cursor: "default",
    highlight: false,
  });
  assert.deepEqual(pointerCue(null), { cursor: "default", highlight: false });
  assert.deepEqual(pointerCue(undefined), { cursor: "default", highlight: false });
});

test("the empty details hint tells the grower to tap a pot or a label", () => {
  assert.equal(EMPTY_DETAILS_HINT, "Tap a pot or a label to see its recorded details.");
  // @source-scan-justified: the first paint is static HTML, before the rules module runs.
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Tap a pot or a label to see its recorded details\./);
});
