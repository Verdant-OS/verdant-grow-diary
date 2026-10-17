// Leader lines are judged as line segments, not rectangles: a card can sit clear of every other
// card while its leader still runs straight through a neighbour's name. These checks use their
// own geometry (independent of the implementation) so they cannot simply agree with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutLabels } from "../src/rules/labelLayoutRules.js";

/** Does segment p→q pass through the interior of rect r (shrunk by `inset` px)? Liang–Barsky. */
function crossesInterior(p, q, r, inset = 1) {
  const x0 = r.x + inset;
  const y0 = r.y + inset;
  const x1 = r.x + r.w - inset;
  const y1 = r.y + r.h - inset;
  if (x1 <= x0 || y1 <= y0) return false;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  for (const [pp, qq] of [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ]) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}

/** The leader exactly as the scene draws it: rule-provided endpoints, else the old convention. */
function drawnLeader(l) {
  if (Number.isFinite(l.lx1)) return { p: { x: l.lx1, y: l.ly1 }, q: { x: l.lx2, y: l.ly2 } };
  return { p: { x: l.x + l.w / 2, y: l.y + l.h }, q: { x: l.bx, y: l.by } };
}

/** Proper crossing of two segments (independent of the implementation). */
function cross(a1, a2, b1, b2) {
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(b1, b2, a1) * side(b1, b2, a2) < 0 && side(a1, a2, b1) * side(a1, a2, b2) < 0;
}

function onBorder(pt, r, tol = 0.75) {
  const inX = pt.x >= r.x - tol && pt.x <= r.x + r.w + tol;
  const inY = pt.y >= r.y - tol && pt.y <= r.y + r.h + tol;
  const nearV = Math.abs(pt.x - r.x) <= tol || Math.abs(pt.x - (r.x + r.w)) <= tol;
  const nearH = Math.abs(pt.y - r.y) <= tol || Math.abs(pt.y - (r.y + r.h)) <= tol;
  return inX && inY && (nearV || nearH);
}

// Deterministic crowded scenes: a phone-width viewport, 6–9 plants, a Door card near the front.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
function scene(seed) {
  const rnd = lcg(seed);
  const width = 390;
  const height = 300;
  const n = 6 + Math.floor(rnd() * 4);
  const items = [];
  for (let i = 0; i < n; i++) {
    const bx = 40 + rnd() * 310;
    const by = 90 + rnd() * 190;
    items.push({
      id: `P-${100 + i}`,
      ax: bx + (rnd() - 0.5) * 20,
      ay: by - 40 - rnd() * 70,
      bx,
      by,
      w: 100 + rnd() * 40,
      h: 34,
      cw: 52,
      ch: 24,
      occluded: rnd() < 0.2,
    });
  }
  const door = { x: 120 + rnd() * 120, y: 200 + rnd() * 70, w: 81, h: 22 };
  return { items, opts: { width, height, avoid: [door], selectedId: null } };
}

test("a leader never runs through another card or the Door card, and no card sits on a leader", () => {
  let leaders = 0;
  const problems = [];
  for (let seed = 1; seed <= 300; seed++) {
    const { items, opts } = scene(seed);
    const out = layoutLabels(items, opts);
    const shown = out.filter((l) => !l.hidden);
    for (const l of shown) {
      if (!l.leader) continue;
      leaders++;
      const { p, q } = drawnLeader(l);
      for (const o of shown) {
        if (o.id === l.id) continue;
        if (crossesInterior(p, q, o)) problems.push(`seed ${seed}: ${l.id} leader crosses ${o.id}`);
      }
      for (const a of opts.avoid)
        if (crossesInterior(p, q, a)) problems.push(`seed ${seed}: ${l.id} leader crosses Door`);
    }
  }
  assert.ok(leaders >= 50, `scenes must exercise leaders (got ${leaders})`);
  assert.deepEqual(problems.slice(0, 8), [], `${problems.length} crossings`);
});

test("a leader is clipped at its own card's border and ends on its own pot", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { items, opts } = scene(seed);
    for (const l of layoutLabels(items, opts)) {
      if (l.hidden || !l.leader) continue;
      assert.ok(Number.isFinite(l.lx1), `seed ${seed} ${l.id}: rule supplies leader endpoints`);
      const { p, q } = drawnLeader(l);
      assert.ok(onBorder(p, l), `seed ${seed} ${l.id}: starts on its card border`);
      assert.ok(!crossesInterior(p, q, l), `seed ${seed} ${l.id}: never re-enters its own card`);
      // Ends on its own pot — or, when a reserved rect (the Door card) covers the pot or sits within
      // 3 px of it, just
      // outside that rect on the straight line to the pot, never through it.
      const cover = opts.avoid.find(
        (a) => l.bx >= a.x - 3 && l.bx <= a.x + a.w + 3 && l.by >= a.y - 3 && l.by <= a.y + a.h + 3,
      );
      if (!cover) {
        assert.equal(q.x, l.bx);
        assert.equal(q.y, l.by);
      } else {
        const cross = (q.x - p.x) * (l.by - p.y) - (q.y - p.y) * (l.bx - p.x);
        assert.ok(
          Math.abs(cross) < 1e-6 * Math.hypot(l.bx - p.x, l.by - p.y) ** 2 + 1e-6,
          "aims at its pot",
        );
        assert.ok(
          !crossesInterior(p, q, cover, 0),
          `seed ${seed} ${l.id}: stops outside the Door card`,
        );
      }
    }
  }
});

test("constructed case: the straight route would cross a neighbour, so the card moves instead", () => {
  // B sits directly between A's preferred spot and A's pot; A must not draw through B.
  const box = { width: 390, height: 300, avoid: [] };
  const b = { id: "B", ax: 200, ay: 150, bx: 200, by: 230, w: 120, h: 34, cw: 0, ch: 0 };
  const a = { id: "A", ax: 200, ay: 120, bx: 205, by: 260, w: 120, h: 34, cw: 0, ch: 0 };
  const out = layoutLabels([b, a], box);
  const shown = out.filter((l) => !l.hidden);
  for (const l of shown) {
    if (!l.leader) continue;
    const { p, q } = drawnLeader(l);
    for (const o of shown)
      if (o.id !== l.id) assert.ok(!crossesInterior(p, q, o), `${l.id}→${o.id}`);
  }
});

test("leader routing is deterministic and null-safe", () => {
  const { items, opts } = scene(7);
  assert.deepEqual(layoutLabels(items, opts), layoutLabels(items, opts));
  assert.deepEqual(layoutLabels(null, opts), []);
});

// Phones snap a touch to a nearby clickable element (Chrome touch adjustment), so a card merely
// close to another plant's pot steals that pot's tap. Cards keep a touch-slop distance from every
// other plant's pot rim point (bx,by) and pot tap point (tx,ty).
const TOUCH_SLOP = 22;
function distToRect(pt, r) {
  const dx = Math.max(r.x - pt.x, 0, pt.x - (r.x + r.w));
  const dy = Math.max(r.y - pt.y, 0, pt.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}
test("no card sits within touch slop of another plant's pot (rim or tap point)", () => {
  const problems = [];
  for (let seed = 1; seed <= 300; seed++) {
    const { items, opts } = scene(seed);
    for (const it of items) {
      it.tx = it.bx + 3;
      it.ty = it.by + 14;
    }
    const out = layoutLabels(items, opts);
    for (const l of out.filter((o) => !o.hidden)) {
      for (const it of items) {
        if (it.id === l.id) continue;
        for (const pt of [
          { x: it.bx, y: it.by },
          { x: it.tx, y: it.ty },
        ]) {
          const d = distToRect(pt, l);
          if (d < TOUCH_SLOP)
            problems.push(`seed ${seed}: ${l.id} is ${d.toFixed(1)}px from ${it.id}`);
        }
      }
    }
  }
  assert.deepEqual(problems.slice(0, 6), [], `${problems.length} cards inside touch slop`);
});

// The scene passes an 8 px edge inset so no card (shadow and tilt included) touches the toolbar or
// timeline. The inset must hold for every shown card without breaking routing or reachability.
test("with an 8 px edge inset, every card keeps 8 px from each edge and routing still holds", () => {
  const INSET = 8;
  const problems = [];
  for (let seed = 1; seed <= 300; seed++) {
    const { items, opts } = scene(seed);
    for (const it of items) {
      it.tx = it.bx + 3;
      it.ty = it.by + 14;
    }
    const o = { ...opts, inset: INSET };
    const out = layoutLabels(items, o);
    const shown = out.filter((l) => !l.hidden);
    for (const l of shown) {
      if (l.x < INSET || l.y < INSET || l.x + l.w > o.width - INSET || l.y + l.h > o.height - INSET)
        problems.push(
          `seed ${seed}: ${l.id} at ${l.x.toFixed(1)},${l.y.toFixed(1)} breaks the inset`,
        );
      if (!l.leader) continue;
      const { p, q } = drawnLeader(l);
      for (const c of shown)
        if (c.id !== l.id && crossesInterior(p, q, c))
          problems.push(`seed ${seed}: ${l.id}→${c.id}`);
      for (const a of o.avoid)
        if (crossesInterior(p, q, a)) problems.push(`seed ${seed}: ${l.id} crosses Door`);
    }
    for (const it of items.filter((i) => i.occluded)) {
      const l = out.find((x) => x.id === it.id);
      if (!l || l.hidden) problems.push(`seed ${seed}: occluded ${it.id} hidden`);
    }
  }
  assert.deepEqual(problems.slice(0, 6), [], `${problems.length} problems`);
});

// A label is hidden only when its chip genuinely has nowhere to go. Independent oracle: for each
// hidden plant, try every chip position on the same 6 px grid against the FINAL layout, with the
// same rules (6 px card gap, 6 px gap to reserved rects, 24 px pot keep-out squares, no sitting on
// a drawn leader, its own leader crossing no card or reserved rect). Any free position is a fail.
test("a plant's label is hidden only when no chip position anywhere in view is free", () => {
  const INSET = 8;
  const GAP = 6;
  const KEEP = 24;
  const STEP = 6;
  const sep = (a, b, pad) =>
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y;
  const wasted = [];
  let hiddenTotal = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { items, opts } = scene(seed);
    for (const it of items) {
      it.tx = it.bx + 3;
      it.ty = it.by + 14;
    }
    const o = { ...opts, inset: INSET };
    const out = layoutLabels(items, o);
    const shown = out.filter((l) => !l.hidden);
    const leaders = shown.filter((l) => l.leader).map(drawnLeader);
    for (const h of out.filter((l) => l.hidden)) {
      hiddenTotal++;
      const it = items.find((i) => i.id === h.id);
      const keep = items
        .filter((i) => i.id !== it.id)
        .flatMap((i) => [
          { x: i.bx - KEEP, y: i.by - KEEP, w: 2 * KEEP, h: 2 * KEEP },
          { x: i.tx - KEEP, y: i.ty - KEEP, w: 2 * KEEP, h: 2 * KEEP },
        ]);
      outer: for (let y = INSET; y + it.ch <= o.height - INSET; y += STEP) {
        for (let x = INSET; x + it.cw <= o.width - INSET; x += STEP) {
          const r = { x, y, w: it.cw, h: it.ch };
          if (!shown.every((s) => sep(r, s, GAP))) continue;
          if (!o.avoid.every((a) => sep(r, a, GAP))) continue;
          if (!keep.every((k) => sep(r, k, 0))) continue;
          if (leaders.some(({ p, q }) => crossesInterior(p, q, r, -2))) continue;
          const c = { x: x + it.cw / 2, y: y + it.ch / 2 };
          const pot = { x: it.bx, y: it.by };
          if (shown.some((s) => crossesInterior(c, pot, s, -2))) continue;
          if (o.avoid.some((a) => crossesInterior(c, pot, a, -2))) continue;
          if (leaders.some(({ p, q }) => cross(c, pot, p, q))) continue;
          wasted.push(`seed ${seed}: ${it.id} hidden, but a chip fits at ${x},${y}`);
          break outer;
        }
      }
    }
  }
  assert.ok(hiddenTotal > 0, "scenes must still exercise hiding");
  assert.deepEqual(wasted.slice(0, 6), [], `${wasted.length} labels hidden despite free space`);
});

test("no two leader lines cross, so each card clearly points at one pot", () => {
  const problems = [];
  let pairs = 0;
  let allowed = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { items, opts } = scene(seed);
    for (const it of items) {
      it.tx = it.bx + 3;
      it.ty = it.by + 14;
    }
    for (const o of [opts, { ...opts, inset: 8 }]) {
      const ls = layoutLabels(items, o).filter((l) => !l.hidden && l.leader);
      for (let i = 0; i < ls.length; i++)
        for (let j = i + 1; j < ls.length; j++) {
          pairs++;
          const a = drawnLeader(ls[i]);
          const b = drawnLeader(ls[j]);
          if (!cross(a.p, a.q, b.p, b.q)) continue;
          // Allowed only as the last resort for a covered pot, and then flagged.
          const flagged = [ls[i], ls[j]].find((l) => l.crossesLeader);
          const coveredPot = flagged && items.find((it) => it.id === flagged.id)?.occluded;
          if (coveredPot) {
            allowed++;
            continue;
          }
          problems.push(`seed ${seed}: ${ls[i].id} × ${ls[j].id}`);
        }
    }
  }
  assert.ok(pairs >= 100, `scenes must exercise leader pairs (got ${pairs})`);
  assert.deepEqual(problems.slice(0, 6), [], `${problems.length} crossing leader pairs`);
  assert.ok(allowed <= 3, `last-resort crossings for covered pots stay rare (got ${allowed})`);
});

test("inset defaults to 0: callers that omit it keep the old edge behaviour", () => {
  const { items, opts } = scene(11);
  assert.deepEqual(layoutLabels(items, opts), layoutLabels(items, { ...opts, inset: 0 }));
});

// A plant whose pot is covered by a neighbour's leaves (occluded) can only be reached through its
// card, so it must never end up hidden while the viewport still has room for its chip.
test("an occluded plant is never left hidden: it gets a label or chip somewhere in view", () => {
  const stranded = [];
  for (let seed = 1; seed <= 300; seed++) {
    const { items, opts } = scene(seed);
    for (const it of items) {
      it.tx = it.bx + 3;
      it.ty = it.by + 14;
    }
    const out = layoutLabels(items, opts);
    for (const it of items.filter((i) => i.occluded)) {
      const l = out.find((o) => o.id === it.id);
      if (!l || l.hidden) stranded.push(`seed ${seed}: ${it.id}`);
    }
  }
  assert.deepEqual(stranded.slice(0, 6), [], `${stranded.length} occluded plants hidden`);
});
