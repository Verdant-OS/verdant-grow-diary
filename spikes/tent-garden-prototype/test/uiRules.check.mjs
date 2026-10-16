import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutLabels } from "../src/rules/labelLayoutRules.js";
import { hardwareOpacity, HARDWARE_KEYS } from "../src/rules/hardwareVisibilityRules.js";

// ---- [hidden] attribute must win over author display rules ------------------------------------
// Confirmed defect: `.fallback { display: grid }` and `.history-banner { display: flex }` beat the
// UA `[hidden] { display: none }`, so hidden panels stayed visible, focusable and clickable.
// @source-scan-justified: a stylesheet has no resolved value to import; the rule's presence is the contract.
test("regression: styles.css resets [hidden] with !important so hidden panels cannot show", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

// ---- label layout ------------------------------------------------------------------------------
const item = (id, ax, ay, w = 100, h = 30, by = ay + 60) => ({ id, ax, ay, bx: ax, by, w, h });
const box = { width: 600, height: 400, avoid: [] };

test("non-overlapping labels stay centred above their anchors with no leader", () => {
  const out = layoutLabels([item("A", 100, 200), item("B", 400, 200)], box);
  const a = out.find((l) => l.id === "A");
  assert.equal(a.x, 50);
  assert.equal(a.y, 200 - 30 - 8);
  assert.equal(a.leader, false);
});

test("colliding labels never overlap each other and the displaced one gets a leader", () => {
  const out = layoutLabels([item("A", 200, 200), item("B", 230, 205)], box);
  const [a, b] = ["A", "B"].map((id) => out.find((l) => l.id === id));
  const overlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  assert.equal(overlap, false);
  assert.ok(a.leader || b.leader);
});

test("the selected plant is placed first and keeps its preferred spot", () => {
  const out = layoutLabels([item("A", 200, 200), item("B", 230, 205)], { ...box, selectedId: "B" });
  const b = out.find((l) => l.id === "B");
  assert.equal(b.x, 230 - 50);
  assert.equal(b.leader, false);
});

test("labels avoid reserved rectangles (history banner, controls) and the viewport edges", () => {
  const banner = { x: 0, y: 0, w: 600, h: 50 };
  const out = layoutLabels([item("A", 300, 60)], { ...box, avoid: [banner] });
  const a = out[0];
  assert.ok(a.y >= banner.h, `label y ${a.y} must sit below the banner`);
  const edge = layoutLabels([item("E", 5, 300)], box)[0];
  assert.ok(edge.x >= 0);
});

test("regression: an anchor inside a reserved rectangle gets its label placed below it", () => {
  const banner = { x: 0, y: 0, w: 600, h: 70 };
  const out = layoutLabels([item("J", 300, 45)], { ...box, avoid: [banner] });
  const j = out[0];
  assert.ok(j.y >= banner.h, `label y ${j.y} must clear the banner`);
  assert.equal(j.leader, true);
});

test("regression: on a crowded narrow viewport labels hide rather than overlap; selected always shows", () => {
  const tiny = { width: 180, height: 120, avoid: [], selectedId: "C" };
  const items = ["A", "B", "C", "D", "E", "F"].map((id, i) =>
    item(id, 60 + i * 12, 70 + (i % 2) * 6, 100, 30),
  );
  const out = layoutLabels(items, tiny);
  const shown = out.filter((l) => !l.hidden);
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i],
        b = shown[j];
      const overlap = !(
        a.x + a.w <= b.x ||
        b.x + b.w <= a.x ||
        a.y + a.h <= b.y ||
        b.y + b.h <= a.y
      );
      assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
    }
  assert.equal(out.find((l) => l.id === "C").hidden, false);
  assert.ok(
    out.some((l) => l.hidden),
    "some labels are hidden when they cannot fit",
  );
});

test("layout is deterministic for identical input", () => {
  const items = [item("A", 200, 200), item("B", 230, 205), item("C", 260, 190)];
  assert.deepEqual(layoutLabels(items, box), layoutLabels(items, box));
});

test("null-safe: empty input and missing sizes do not throw", () => {
  assert.deepEqual(layoutLabels([], box), []);
  const out = layoutLabels([{ id: "X", ax: 10, ay: 10 }], box);
  assert.equal(out.length, 1);
});

// ---- hardware fading by camera orientation ---------------------------------------------------
test("camera-side hardware fades and the set changes across all four 90° orientations", () => {
  const seen = new Set();
  for (const az of [-30, 60, 150, 240]) {
    const o = hardwareOpacity(az);
    const faded = HARDWARE_KEYS.filter((k) => o[k] < 1).sort();
    assert.ok(faded.length >= 2, `az ${az} fades something`);
    assert.ok(faded.length < HARDWARE_KEYS.length, `az ${az} does not fade everything`);
    seen.add(faded.join(","));
    for (const k of HARDWARE_KEYS) assert.ok(o[k] > 0 && o[k] <= 1);
  }
  assert.equal(seen.size, 4, "each orientation fades a different foreground set");
});

test("default view (az −30°) fades the front-left pole and front rail, keeps the back-right pole", () => {
  const o = hardwareOpacity(-30);
  assert.ok(o["pole:x0:zD"] < 1);
  assert.ok(o["rail:zD"] < 1);
  assert.equal(o["pole:xW:z0"], 1);
});
