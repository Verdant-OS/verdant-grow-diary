import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  usesViewOptionsDisclosure,
  viewOptionsAfterKey,
  VIEW_OPTIONS_CONTROLS,
  ALWAYS_VISIBLE_CONTROLS,
} from "../src/rules/viewOptionsRules.js";

test("below 640 px the tent, pots, animation and list controls move into View options", () => {
  assert.equal(usesViewOptionsDisclosure(639), true);
  assert.equal(usesViewOptionsDisclosure(390), true);
  assert.equal(usesViewOptionsDisclosure(640), false);
  assert.equal(usesViewOptionsDisclosure(1440), false);
  assert.equal(usesViewOptionsDisclosure(null), false);
  assert.deepEqual(VIEW_OPTIONS_CONTROLS, ["tent", "pots", "animation", "list"]);
  assert.deepEqual(ALWAYS_VISIBLE_CONTROLS, ["view", "edit", "rotate-left", "rotate-right", "reset"]);
});

test("Escape closes View options; other keys leave it as it is", () => {
  assert.equal(viewOptionsAfterKey(true, "Escape"), false);
  assert.equal(viewOptionsAfterKey(false, "Escape"), false);
  assert.equal(viewOptionsAfterKey(true, "Enter"), true);
  assert.equal(viewOptionsAfterKey(true, "Tab"), true);
  assert.equal(viewOptionsAfterKey(false, "Enter"), false);
  assert.equal(viewOptionsAfterKey(null, null), false);
});

test("the phone disclosure holds Tent, Pots, Animation and List view, and the desktop bar does not", () => {
  // @source-scan-justified: the disclosure is HTML structure; the open/close decision is the pure rule.
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const panel = html.slice(html.indexOf('id="viewOptionsPanel"'), html.indexOf('id="canvasWrap"'));
  assert.match(html, /id="viewOptionsBtn"/);
  assert.match(html, />View options</);
  assert.match(panel, /id="gardenSelect"/);
  assert.match(panel, /id="potSize"/);
  assert.match(panel, /id="animToggle"/);
  assert.match(panel, /id="showList"/);
  assert.doesNotMatch(panel, /id="modeView"/);
  assert.doesNotMatch(panel, /id="rotateLeft"/);
  assert.match(css, /\.view-options\s*\{[^}]*display:\s*contents/);
  assert.match(css, /@media\s*\(max-width:\s*639px\)/);
});
