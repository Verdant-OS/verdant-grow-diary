// Pure label placement for the diorama. Screen-space in, screen-space out; no DOM, no clock.
// Labels keep their full text size — crowding is solved by moving them, never by shrinking.

const PAD = 6; // gap between labels
const LIFT = 8; // gap between anchor and label bottom

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
  // stable order: selected first, then nearer (larger by) first, id as tie-breaker
  list.sort((p, q) => {
    if ((p.id === selectedId) !== (q.id === selectedId)) return p.id === selectedId ? -1 : 1;
    if (p.by !== q.by) return q.by - p.by;
    return p.id < q.id ? -1 : p.id > q.id ? 1 : 0;
  });
  const placed = [];
  const out = [];
  for (const it of list) {
    const { w, h } = it;
    let chosen = null;
    for (const c of candidates(it, w, h)) {
      const r = { x: c.x, y: c.y, w, h };
      if (!inBounds(r, width, height)) continue;
      if (avoid.some((a) => overlaps(r, a, PAD))) continue; // keep a gap: labels are slightly rotated
      if (placed.some((p) => overlaps(r, p))) continue;
      chosen = r;
      break;
    }
    if (!chosen && it.id !== selectedId) {
      // Nothing fits without covering another label: hide this one rather than overlap.
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
      ax: it.ax,
      ay: it.ay,
      bx: Number.isFinite(it.bx) ? it.bx : it.ax,
      by: it.by,
    });
  }
  return out;
}
