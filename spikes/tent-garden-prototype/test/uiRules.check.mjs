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
  // Leaders are clipped at the card's own border: a displaced card either draws a clipped leader
  // to its pot, or already sits on its own pot and needs no line at all.
  const containsPot = j.bx >= j.x && j.bx <= j.x + j.w && j.by >= j.y && j.by <= j.y + j.h;
  assert.ok(j.leader ? Number.isFinite(j.lx1) : containsPot, JSON.stringify(j));
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

test("regression: the selected label's fallback never covers a reserved rect, even when crowded", () => {
  const banner = { x: 0, y: 0, w: 200, h: 60 };
  const tiny = { width: 200, height: 95, avoid: [banner], selectedId: "S" }; // nothing fits cleanly
  const items = ["A", "B", "C", "S"].map((id, i) => item(id, 100, 50 + i * 4, 120, 30));
  const s = layoutLabels(items, tiny).find((l) => l.id === "S");
  assert.equal(s.hidden, false);
  assert.ok(s.y >= banner.h, `selected label y ${s.y} must clear the banner`);
  assert.ok(s.x >= 0 && s.x + s.w <= 200);
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
    const faded = HARDWARE_KEYS.filter((k) => k !== "bar" && o[k] < 1).sort();
    assert.ok(faded.length >= 2, `az ${az} fades something`);
    assert.ok(faded.length < HARDWARE_KEYS.length, `az ${az} does not fade everything`);
    seen.add(faded.join(","));
    for (const k of HARDWARE_KEYS) assert.ok(o[k] > 0 && o[k] <= 1);
  }
  assert.equal(seen.size, 4, "each orientation fades a different foreground set");
});

test("the overhead light bar is translucent at every orientation (it crosses the back row from any side)", () => {
  for (const az of [-30, 60, 150, 240]) {
    const o = hardwareOpacity(az);
    assert.ok(o.bar < 0.5 && o.bar > 0, `bar opacity at ${az}° is ${o.bar}`);
  }
});

test("default view (az −30°) fades the front-left pole and front rail, keeps the back-right pole", () => {
  const o = hardwareOpacity(-30);
  assert.ok(o["pole:x0:zD"] < 1);
  assert.ok(o["rail:zD"] < 1);
  assert.equal(o["pole:xW:z0"], 1);
});

test("crowded labels fall back to a compact ID chip (same text size) before being hidden", () => {
  const tiny = { width: 200, height: 120, avoid: [] };
  const items = ["A", "B", "C", "D", "E"].map((id, i) => ({
    ...item(id, 60 + i * 20, 70, 110, 30),
    cw: 40,
    ch: 22,
  }));
  const out = layoutLabels(items, tiny);
  const compact = out.filter((l) => l.compact && !l.hidden);
  assert.ok(compact.length > 0, "at least one label degrades to a chip");
  for (const c of compact) {
    assert.equal(c.w, 40);
    assert.equal(c.h, 22);
  }
  const shown = out.filter((l) => !l.hidden);
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i];
      const b = shown[j];
      assert.ok(
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
        `${a.id}/${b.id}`,
      );
    }
});

test("a plant whose pot is covered gets label priority over a nearer, directly tappable plant", () => {
  // Same anchor, room for exactly one label: the occluded (farther) plant must keep it.
  const box1 = { width: 120, height: 80, avoid: [] };
  const near = { ...item("NEAR", 60, 60, 100, 30, 200), cw: 0, ch: 0 };
  const far = { ...item("FAR", 60, 60, 100, 30, 100), cw: 0, ch: 0, occluded: true };
  const out = layoutLabels([near, far], box1);
  assert.equal(out.find((l) => l.id === "FAR").hidden, false);
  assert.equal(out.find((l) => l.id === "NEAR").hidden, true);
});

test("regression: a label never strands a plant by covering its pot while that plant has no label", () => {
  // B's label (placed first: nearer) lands on A's pot; only one label fits, so A must win it.
  const box1 = { width: 140, height: 90, avoid: [] };
  const a = { id: "A", ax: 70, ay: 52, bx: 70, by: 40, w: 100, h: 30, cw: 0, ch: 0 };
  const b = { id: "B", ax: 70, ay: 78, bx: 70, by: 200, w: 100, h: 30, cw: 0, ch: 0 };
  const out = layoutLabels([a, b], box1);
  const shown = out.filter((l) => !l.hidden);
  const stranded = out.filter(
    (l) =>
      l.hidden &&
      shown.some((s) => l.bx >= s.x && l.bx <= s.x + s.w && l.by >= s.y && l.by <= s.y + s.h),
  );
  assert.deepEqual(
    stranded.map((l) => l.id),
    [],
  );
});

test("regression: a shown label never covers another plant's pot, so tapping a pot selects that plant", () => {
  // Measured in the browser: Sprout's label sat on P-103's pot, so a tap on P-103 selected Sprout.
  const box = { width: 400, height: 300, avoid: [] };
  const a = { id: "A", ax: 200, ay: 150, bx: 200, by: 200, w: 100, h: 30, cw: 0, ch: 0 };
  // B's pot is exactly where A's preferred label would sit (centred above A's anchor).
  const b = { id: "B", ax: 330, ay: 60, bx: 200, by: 125, w: 100, h: 30, cw: 0, ch: 0 };
  const out = layoutLabels([a, b], box);
  const covering = out.filter(
    (l) =>
      !l.hidden &&
      out.some(
        (o) =>
          o.id !== l.id && o.bx >= l.x && o.bx <= l.x + l.w && o.by >= l.y && o.by <= l.y + l.h,
      ),
  );
  assert.deepEqual(
    covering.map((l) => l.id),
    [],
  );
  assert.ok(
    out.find((l) => l.id === "A" && !l.hidden),
    "A still gets a label, just not on B's pot",
  );
});
