// Pure label placement for the diorama. Screen-space in, screen-space out; no DOM, no clock.
// Labels keep their full text size — crowding is solved by moving them, never by shrinking.

const PAD = 6; // gap between labels
const LIFT = 8; // gap between anchor and label bottom
const POT_KEEPOUT = 10; // px around each pot point that other labels must leave clear (they are clickable)

/**
 * @typedef {{ id:string, ax:number, ay:number, bx?:number, by?:number, w?:number, h?:number }} LabelItem
 *   ax/ay: anchor (top of plant) in px; bx/by: base (pot) in px — nearer plants have larger by.
 * @typedef {{ x:number, y:number, w:number, h:number }} Rect
 */

function overlaps(a, b, pad = PAD) {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function inBounds(r, width, height) {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;
}

/** Candidate positions in preference order: above, then nudged sideways, then higher rows. */
function candidates(it, w, h) {
  const cx = it.ax - w / 2;
  const top = it.ay - h - LIFT;
  const out = [];
  for (let row = 0; row < 12; row++) {
    const y = top - row * (h + PAD);
    out.push({ x: cx, y });
    out.push({ x: cx + w * 0.6, y });
    out.push({ x: cx - w * 0.6, y });
    out.push({ x: cx + w * 1.1, y });
    out.push({ x: cx - w * 1.1, y });
  }
  // then beside the anchor, then rows below it (an anchor under the history banner, say)
  out.push({ x: it.ax + 14, y: it.ay - h / 2 });
  out.push({ x: it.ax - w - 14, y: it.ay - h / 2 });
  for (let row = 0; row < 12; row++) {
    const y = it.ay + LIFT + row * (h + PAD);
    out.push({ x: cx, y });
    out.push({ x: cx + w * 0.6, y });
    out.push({ x: cx - w * 0.6, y });
  }
  return out;
}

/**
 * Lay out labels so none overlap each other, reserved rectangles, or the viewport edge.
 * The selected plant is placed first; the rest are placed front-to-back so a label never
 * lands on the plant that is nearer the camera than its own.
 *
 * @param {LabelItem[]} items
 * @param {{ width:number, height:number, avoid?:Rect[], selectedId?:string|null }} opts
 * @returns {{ id:string, x:number, y:number, w:number, h:number, leader:boolean, ax:number, ay:number }[]}
 */
export function layoutLabels(items, opts) {
  // Labels are clickable, so a label resting on another plant's pot captures that pot's tap.
  // If a plant ended up with no label AND a shown label covers its pot, it has been stranded:
  // re-run treating its pot as covered so it claims a label (or chip) first. Bounded passes.
  let input = Array.isArray(items) ? items : [];
  let out = placeOnce(input, opts);
  for (let pass = 0; pass < 2; pass++) {
    const shown = out.filter((l) => !l.hidden);
    const stranded = new Set(
      out
        .filter(
          (l) =>
            l.hidden &&
            Number.isFinite(l.bx) &&
            Number.isFinite(l.by) &&
            shown.some((s) => l.bx >= s.x && l.bx <= s.x + s.w && l.by >= s.y && l.by <= s.y + s.h),
        )
        .map((l) => l.id),
    );
    if (stranded.size === 0) break;
    input = input.map((it) => (it && stranded.has(it.id) ? { ...it, occluded: true } : it));
    out = placeOnce(input, opts);
  }
  return out;
}

function placeOnce(items, opts) {
  const width = Number(opts?.width) || 0;
  const height = Number(opts?.height) || 0;
  const avoid = Array.isArray(opts?.avoid) ? opts.avoid : [];
  const selectedId = opts?.selectedId ?? null;
  const list = (Array.isArray(items) ? items : [])
    .filter(
      (it) => it && typeof it.id === "string" && Number.isFinite(it.ax) && Number.isFinite(it.ay),
    )
    .map((it) => ({
      ...it,
      w: Number.isFinite(it.w) ? it.w : 0,
      h: Number.isFinite(it.h) ? it.h : 0,
      by: Number.isFinite(it.by) ? it.by : it.ay,
    }));
  // stable order: selected, then covered pots, then nearer (larger by) first; id breaks ties
  list.sort((p, q) => {
    if ((p.id === selectedId) !== (q.id === selectedId)) return p.id === selectedId ? -1 : 1;
    // A plant whose pot is covered by another plant can only be reached by its label, so it
    // claims space before plants that can be tapped directly.
    if (!!p.occluded !== !!q.occluded) return p.occluded ? -1 : 1;
    if (p.by !== q.by) return q.by - p.by;
    return p.id < q.id ? -1 : p.id > q.id ? 1 : 0;
  });
  // Labels are clickable: one resting on another plant's pot would capture that pot's tap.
  const pots = list
    .filter((it) => Number.isFinite(it.bx) && Number.isFinite(it.by))
    .map((it) => ({
      id: it.id,
      x: it.bx - POT_KEEPOUT,
      y: it.by - POT_KEEPOUT,
      w: 2 * POT_KEEPOUT,
      h: 2 * POT_KEEPOUT,
    }));
  const placed = [];
  const out = [];
  for (const it of list) {
    const { w, h } = it;
    const coversPot = (r) => pots.some((q) => q.id !== it.id && overlaps(r, q, 0));
    let chosen = null;
    for (const c of candidates(it, w, h)) {
      const r = { x: c.x, y: c.y, w, h };
      if (!inBounds(r, width, height)) continue;
      if (avoid.some((a) => overlaps(r, a, PAD))) continue; // keep a gap: labels are slightly rotated
      if (placed.some((p) => overlaps(r, p))) continue;
      if (coversPot(r)) continue;
      chosen = r;
      break;
    }
    if (!chosen && it.id !== selectedId && it.cw > 0 && it.ch > 0) {
      // No room for the full label: try a compact ID chip (same text size, shorter content)
      // so the plant keeps a visible, tappable handle even when its pot is behind leaves.
      for (const c of candidates(it, it.cw, it.ch)) {
        const r = { x: c.x, y: c.y, w: it.cw, h: it.ch };
        if (!inBounds(r, width, height)) continue;
        if (avoid.some((a) => overlaps(r, a, PAD))) continue;
        if (placed.some((p) => overlaps(r, p))) continue;
        if (coversPot(r)) continue;
        placed.push(r);
        const pref = candidates(it, it.cw, it.ch)[0];
        out.push({
          id: it.id,
          ...r,
          leader: Math.abs(r.x - pref.x) > 1 || Math.abs(r.y - pref.y) > 1,
          hidden: false,
          compact: true,
          ax: it.ax,
          ay: it.ay,
          bx: Number.isFinite(it.bx) ? it.bx : it.ax,
          by: it.by,
        });
        chosen = r;
        break;
      }
      if (chosen) continue;
    }
    if (!chosen && it.id !== selectedId) {
      // Nothing fits, not even a chip: hide this one rather than overlap.
      // The plant stays selectable and its full name is in details and List view.
      out.push({
        id: it.id,
        x: 0,
        y: 0,
        w,
        h,
        leader: false,
        hidden: true,
        ax: it.ax,
        ay: it.ay,
        bx: it.bx,
        by: it.by,
      });
      continue;
    }
    if (!chosen) {
      // The selected plant's label is always shown. Try again ignoring other labels but never
      // the reserved rectangles (banner, controls); labels it lands on are hidden below.
      for (const c of candidates(it, w, h)) {
        const r = { x: c.x, y: c.y, w, h };
        if (!inBounds(r, width, height)) continue;
        if (avoid.some((a) => overlaps(r, a, PAD))) continue;
        chosen = r;
        break;
      }
    }
    if (!chosen) {
      // Last resort: clamp into the viewport, then push below any reserved rect it touches.
      const pref = candidates(it, w, h)[0];
      chosen = {
        x: Math.min(Math.max(pref.x, 0), Math.max(0, width - w)),
        y: Math.min(Math.max(pref.y, 0), Math.max(0, height - h)),
        w,
        h,
      };
      for (const a of avoid) if (overlaps(chosen, a, PAD)) chosen.y = a.y + a.h + PAD;
      chosen.y = Math.min(chosen.y, Math.max(0, height - h));
    }
    placed.push(chosen);
    const preferred = candidates(it, w, h)[0];
    const leader = Math.abs(chosen.x - preferred.x) > 1 || Math.abs(chosen.y - preferred.y) > 1;
    out.push({
      id: it.id,
      x: chosen.x,
      y: chosen.y,
      w,
      h,
      leader,
      hidden: false,
      compact: false,
      ax: it.ax,
      ay: it.ay,
      bx: Number.isFinite(it.bx) ? it.bx : it.ax,
      by: it.by,
    });
  }
  return out;
}
