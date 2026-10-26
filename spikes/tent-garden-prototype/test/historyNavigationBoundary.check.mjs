import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timelinePoints, pointAt } from "../src/rules/historyRules.js";

// @source-extraction-justified: importing app.js initializes location/document,
// localStorage and the standalone scene (Three.js resolves through a CDN import
// map). Execute its actual navigation function and control bindings instead;
// keep the real history rules and replace only DOM lookup, rendering and toast.
// Removing the Earlier caller boundary must make the oldest-snapshot case fail.
const source = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `navigation source section: ${startMarker}`);
  return source.slice(start, end);
}

const navigationSource = section("function goToIndex(", "function toast(");
const bindingSource = section('  $("returnToday").onclick', '  $("dlgCancel").addEventListener');
const snapshots = [
  { id: "oldest", date: "2026-01-01", label: "Oldest" },
  { id: "middle", date: "2026-01-02", label: "Middle" },
];

function navigation({ recorded = snapshots, index = 2, mode = "view", unsaved = false } = {}) {
  const points = timelinePoints(recorded);
  const state = { mode, viewIndex: index };
  const elements = Object.fromEntries(
    ["histPrev", "histNext", "histRange", "returnToday"].map((id) => [id, {}]),
  );
  const lookup = (id) => {
    assert.ok(Object.hasOwn(elements, id), `unexpected navigation element: ${id}`);
    return elements[id];
  };
  const renders = [];
  const notices = [];
  const goToIndex = Function(
    "pointAt",
    "points",
    "state",
    "hasUnsaved",
    "toast",
    "render",
    "$",
    `return (${navigationSource});`,
  )(
    pointAt,
    points,
    state,
    () => unsaved,
    (text) => notices.push(text),
    (options) => renders.push(options),
    lookup,
  );
  Function(
    "$",
    "goToIndex",
    "state",
    "TODAY_INDEX",
    bindingSource,
  )(lookup, goToIndex, state, points.length - 1);
  return { state, elements, renders, notices, current: () => pointAt(points, state.viewIndex) };
}

test("Earlier at the oldest snapshot stays there across repeated clicks", () => {
  const nav = navigation({ index: 0 });
  for (let i = 0; i < 3; i++) {
    nav.elements.histPrev.onclick();
    assert.equal(nav.state.viewIndex, 0);
    assert.equal(nav.current().id, "oldest");
    assert.equal(nav.current().isToday, false);
  }
});

test("Earlier and Later traverse recorded points; Later at Today stays at Today", () => {
  const nav = navigation();
  nav.elements.histPrev.onclick();
  assert.equal(nav.current().id, "middle");
  nav.elements.histPrev.onclick();
  assert.equal(nav.current().id, "oldest");
  nav.elements.histNext.onclick();
  assert.equal(nav.current().id, "middle");
  nav.elements.histNext.onclick();
  assert.equal(nav.current().id, "today");
  nav.elements.histNext.onclick();
  assert.equal(nav.state.viewIndex, 2);
  assert.equal(nav.current().isToday, true);
});

test("the bound slider and Return To Today controls still select their requested points", () => {
  const nav = navigation();
  nav.elements.histRange.oninput({ target: { value: "0" } });
  assert.equal(nav.current().id, "oldest");
  nav.elements.returnToday.onclick();
  assert.equal(nav.state.viewIndex, 2);
  assert.equal(nav.current().id, "today");
});

test("a history with no recorded snapshots keeps both arrows on its only Today point", () => {
  const nav = navigation({ recorded: [], index: 0 });
  nav.elements.histPrev.onclick();
  assert.equal(nav.state.viewIndex, 0);
  assert.equal(nav.current().id, "today");
  nav.elements.histNext.onclick();
  assert.equal(nav.state.viewIndex, 0);
});

test("Earlier preserves an unsaved edit draft and restores the slider to its current point", () => {
  const nav = navigation({ mode: "edit", unsaved: true });
  nav.elements.histPrev.onclick();
  assert.equal(nav.state.viewIndex, 2);
  assert.equal(nav.state.mode, "edit");
  assert.equal(nav.elements.histRange.value, "2");
  assert.equal(nav.renders.length, 0);
  assert.equal(nav.notices.length, 1);
});
