// Regression for the 1440×900 default view (4×4 tent, 5 gal pots, no plant selected).
// The items are the screen anchors, card sizes and pot radii the scene measured in that view.
// Geometry here is independent of the layout rule, so the check cannot pass by agreeing with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutLabels } from "../src/rules/labelLayoutRules.js";

const LABEL_MIN_GAP = 6;

// Host is 1100×647 inside a 1440×900 window (340 px details column, toolbar and timeline).
const SCENE = {
  w: 1100,
  h: 647,
  avoid: [{ x: 648.3513, y: 473.8184, w: 81.3438, h: 21.9375 }],
  items: [
    { id: "P-101", ax: 396.9878, ay: 72.2092, bx: 414.586, by: 295.8657, tx: 412.999, ty: 275.6963, pr: 46.3966, w: 103, h: 38, cw: 50, ch: 23, occluded: false },
    { id: "P-102", ax: 587.622, ay: 38.4424, bx: 583.6135, by: 249.2351, tx: 583.9781, ty: 230.0605, pr: 39.8753, w: 108, h: 38, cw: 50, ch: 23, occluded: false },
    { id: "P-103", ax: 503.5103, ay: 226.9451, bx: 507.9261, by: 396.9607, tx: 507.3533, ty: 374.9056, pr: 52.2854, w: 111, h: 38, cw: 50, ch: 23, occluded: false },
    { id: "P-104", ax: 704.135, ay: 213.8132, bx: 693.7761, by: 334.9892, tx: 695.5665, ty: 314.0459, pr: 43.9197, w: 121, h: 38, cw: 50, ch: 23, occluded: false },
    { id: "P-105", ax: 550, ay: 264.0543, bx: 550, by: 314.8415, tx: 550, ty: 294.2899, pr: 45.2557, w: 103, h: 38, cw: 50, ch: 23, occluded: false },
    { id: "P-106", ax: 628.8025, ay: 303.9397, bx: 625.1685, by: 382.9312, tx: 626.1721, ty: 361.1156, pr: 48.7566, w: 110, h: 38, cw: 50, ch: 23, occluded: false },
  ],
};

function closestDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function segmentsCross(a1, a2, b1, b2) {
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(b1, b2, a1) * side(b1, b2, a2) < 0 && side(a1, a2, b1) * side(a1, a2, b2) < 0;
}

function cardGap(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  if (dx >= 0 && dy >= 0) return Math.hypot(dx, dy);
  return Math.max(dx, dy);
}

test("1440×900 default view: leaders do not cross, do not pass through another pot, and cards keep the minimum gap", () => {
  const out = layoutLabels(SCENE.items, {
    width: SCENE.w,
    height: SCENE.h,
    inset: 8,
    avoid: SCENE.avoid,
    selectedId: null,
  });
  const shown = out.filter((l) => !l.hidden);
  assert.deepEqual(
    shown.map((l) => l.id).sort(),
    SCENE.items.map((it) => it.id).sort(),
    "every plant keeps a card",
  );
  assert.ok(
    shown.every((l) => !l.compact),
    "this scene fits full cards",
  );
  const leaders = shown.filter((l) => l.leader);
  const problems = [];
  for (let i = 0; i < leaders.length; i++) {
    for (let j = i + 1; j < leaders.length; j++) {
      const a = leaders[i];
      const b = leaders[j];
      if (
        segmentsCross(
          { x: a.lx1, y: a.ly1 },
          { x: a.lx2, y: a.ly2 },
          { x: b.lx1, y: b.ly1 },
          { x: b.lx2, y: b.ly2 },
        )
      )
        problems.push(`leaders cross: ${a.id} × ${b.id}`);
    }
  }
  for (const l of leaders) {
    for (const it of SCENE.items) {
      if (it.id === l.id) continue;
      const d = closestDistance(it.bx, it.by, l.lx1, l.ly1, l.lx2, l.ly2);
      if (d < it.pr) problems.push(`${l.id} leader through ${it.id} pot (${d.toFixed(1)} < ${it.pr})`);
    }
  }
  let minGap = Infinity;
  let gapPair = "";
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const g = cardGap(shown[i], shown[j]);
      if (g < minGap) {
        minGap = g;
        gapPair = `${shown[i].id} ${shown[j].id}`;
      }
    }
  }
  if (minGap < LABEL_MIN_GAP) problems.push(`card gap ${minGap.toFixed(2)} < ${LABEL_MIN_GAP} (${gapPair})`);
  assert.deepEqual(problems, []);
});
