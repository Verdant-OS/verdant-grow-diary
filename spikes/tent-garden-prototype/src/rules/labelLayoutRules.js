// Pure label placement for the diorama. Screen-space in, screen-space out; no DOM, no clock.
// Labels keep their full text size — crowding is solved by moving them, never by shrinking.

const PAD = 6; // gap between labels
const LIFT = 8; // gap between anchor and label bottom
// px every card keeps from other plants' pots. Cards are clickable, and phones snap a touch to a
// nearby clickable element (Chrome touch adjustment), so a card merely close to a pot steals the
// pot's tap. Half of a 44 px touch target (22 px) plus 2 px for the cards' 1.2° tilt.
const POT_KEEPOUT = 24;
const GRID_STEP = 6; // px between positions tried when an occluded plant needs a card anywhere

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

const LEADER_GAP = 2; // px a leader keeps from any card or reserved rect it passes

/**
 * Where a leader leaves its card: the point on the card border along the line from the card's
 * centre to `target`. Null when the target is inside the card (no line needed).
 * @param {Rect} r @param {{x:number,y:number}} target
 */
export function leaderStart(r, target) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const tx = dx > 0 ? (r.x + r.w - cx) / dx : dx < 0 ? (r.x - cx) / dx : Infinity;
  const ty = dy > 0 ? (r.y + r.h - cy) / dy : dy < 0 ? (r.y - cy) / dy : Infinity;
  const t = Math.min(tx, ty);
  if (!(t < 1)) return null; // target inside (or on) the card
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Do segments a1→a2 and b1→b2 cross at a point strictly inside both? (Touching ends do not.) */
export function segmentsCross(a1, a2, b1, b2) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(b1, b2, a1);
  const d2 = o(b1, b2, a2);
  const d3 = o(a1, a2, b1);
  const d4 = o(a1, a2, b2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Does segment p→q touch rect r grown by `pad`? Liang–Barsky clip. */
export function segmentHitsRect(p, q, r, pad = 0) {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Parameter t∈[0,1] where segment p→q first enters rect r grown by `pad`; null if it never does. */
function entryParam(p, q, r, pad) {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;
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
      if (qq < 0) return null;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return Math.max(0, t0 - 1e-6);
}

/** b is the usable area: the viewport shrunk by the edge inset on every side. */
function inBounds(r, b) {
  return r.x >= b.x0 && r.y >= b.y0 && r.x + r.w <= b.x1 && r.y + r.h <= b.y1;
}

/**
 * Every grid position in the viewport, nearest to the anchor first (ties: higher, then left).
 * Used only for an occluded plant, whose card is its sole tap handle, after the usual spots fail.
 */
function gridCandidates(it, w, h, b) {
  const out = [];
  for (let y = b.y0; y + h <= b.y1; y += GRID_STEP) {
    for (let x = b.x0; x + w <= b.x1; x += GRID_STEP) {
      const d = Math.hypot(x + w / 2 - it.ax, y + h / 2 - (it.ay - h / 2 - LIFT));
      out.push({ x, y, d });
    }
  }
  out.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return out;
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
  // Cards keep this many px from every viewport edge (shadow and tilt included), so a card
  // never touches the toolbar or timeline. Default 0 keeps callers without it unchanged.
  const inset = Math.max(0, Number(opts?.inset) || 0);
  const b = { x0: inset, y0: inset, x1: width - inset, y1: height - inset };
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
  // Two points per pot: the rim point leaders aim at (bx,by) and the pot-body point a tap lands
  // on (tx,ty, when the scene supplies it).
  const keep = (id, x, y) => ({
    id,
    x: x - POT_KEEPOUT,
    y: y - POT_KEEPOUT,
    w: 2 * POT_KEEPOUT,
    h: 2 * POT_KEEPOUT,
  });
  const pots = [];
  for (const it of list) {
    if (Number.isFinite(it.bx) && Number.isFinite(it.by)) pots.push(keep(it.id, it.bx, it.by));
    if (Number.isFinite(it.tx) && Number.isFinite(it.ty)) pots.push(keep(it.id, it.tx, it.ty));
  }
  const placed = [];
  const segs = []; // leaders already drawn: later cards may not sit on them
  const out = [];
  const deferred = []; // { slot, it, tryGrid }: tappable pots whose usual spots were all taken
  const hiddenEntry = (it) => ({
    id: it.id,
    x: 0,
    y: 0,
    w: it.w,
    h: it.h,
    leader: false,
    hidden: true,
    ax: it.ax,
    ay: it.ay,
    bx: it.bx,
    by: it.by,
  });
  for (const it of list) {
    const { w, h } = it;
    const coversPot = (r) => pots.some((q) => q.id !== it.id && overlaps(r, q, 0));
    const pot = { x: Number.isFinite(it.bx) ? it.bx : it.ax, y: it.by };
    // A displaced card draws a leader from its own border to its pot. That line may not pass
    // through another card or a reserved rect (the Door card, banner), and the card itself may
    // not sit on a leader already drawn — rectangles alone miss a line through a name.
    // A pot under a reserved rect (the Door card sits at floor level by the front pots): the
    // leader stops just outside that rect on its way to the pot instead of crossing it.
    const COVER_PAD = LEADER_GAP + 1;
    const potCover = avoid.find(
      (a) =>
        pot.x >= a.x - COVER_PAD &&
        pot.x <= a.x + a.w + COVER_PAD &&
        pot.y >= a.y - COVER_PAD &&
        pot.y <= a.y + a.h + COVER_PAD,
    );
    const endFor = (start) => {
      if (!potCover) return pot;
      const t = entryParam(start, pot, potCover, COVER_PAD);
      if (t === null) return pot;
      return { x: start.x + (pot.x - start.x) * t, y: start.y + (pot.y - start.y) * t };
    };
    const leaderOf = (r, pref) => {
      const displaced = Math.abs(r.x - pref.x) > 1 || Math.abs(r.y - pref.y) > 1;
      if (!displaced) return { leader: false, seg: null };
      const start = leaderStart(r, pot);
      return { leader: true, seg: start ? { p: start, q: endFor(start) } : null };
    };
    const routeClear = (r, seg, allowLeaderCross = false) =>
      !segs.some((s) => segmentHitsRect(s.p, s.q, r, LEADER_GAP)) &&
      (!seg ||
        (!placed.some((o) => segmentHitsRect(seg.p, seg.q, o, LEADER_GAP)) &&
          !avoid.some((a) => segmentHitsRect(seg.p, seg.q, a, LEADER_GAP)) &&
          // Two crossing leaders make it unclear which pot each card points at.
          (allowLeaderCross || !segs.some((s) => segmentsCross(seg.p, seg.q, s.p, s.q)))));
    const commitLeader = (seg) => {
      if (seg) segs.push(seg);
    };
    const leaderFields = (lead) =>
      lead.seg
        ? { lx1: lead.seg.p.x, ly1: lead.seg.p.y, lx2: lead.seg.q.x, ly2: lead.seg.q.y }
        : {};
    let chosen = null;
    let chosenLead = null;
    const prefFull = candidates(it, w, h)[0];
    for (const c of candidates(it, w, h)) {
      const r = { x: c.x, y: c.y, w, h };
      if (!inBounds(r, b)) continue;
      if (avoid.some((a) => overlaps(r, a, PAD))) continue; // keep a gap: labels are slightly rotated
      if (placed.some((p) => overlaps(r, p))) continue;
      if (coversPot(r)) continue;
      const lead = leaderOf(r, prefFull);
      if (!routeClear(r, lead.seg)) continue;
      chosen = r;
      chosenLead = lead;
      break;
    }
    if (!chosen && it.id !== selectedId && it.cw > 0 && it.ch > 0) {
      // No room for the full label: try a compact ID chip (same text size, shorter content)
      // so the plant keeps a visible, tappable handle even when its pot is behind leaves.
      const prefChip = candidates(it, it.cw, it.ch)[0];
      for (const c of candidates(it, it.cw, it.ch)) {
        const r = { x: c.x, y: c.y, w: it.cw, h: it.ch };
        if (!inBounds(r, b)) continue;
        if (avoid.some((a) => overlaps(r, a, PAD))) continue;
        if (placed.some((p) => overlaps(r, p))) continue;
        if (coversPot(r)) continue;
        const lead = leaderOf(r, prefChip);
        if (!routeClear(r, lead.seg)) continue;
        placed.push(r);
        commitLeader(lead.seg);
        out.push({
          id: it.id,
          ...r,
          leader: lead.leader && !!lead.seg,
          ...leaderFields(lead),
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
    // Search the whole view for a chip (same rules: no overlap, no pot, no crossing leaders).
    // It reads the shared placed/segs state when it runs, so a deferred call sees later cards.
    const tryGrid = (allowLeaderCross = false) => {
      const cw = it.cw > 0 ? it.cw : w;
      const ch = it.ch > 0 ? it.ch : h;
      const pref = candidates(it, cw, ch)[0];
      for (const c of gridCandidates(it, cw, ch, b)) {
        const r = { x: c.x, y: c.y, w: cw, h: ch };
        if (avoid.some((a) => overlaps(r, a, PAD))) continue;
        if (placed.some((p) => overlaps(r, p))) continue;
        if (coversPot(r)) continue;
        const lead = leaderOf(r, pref);
        if (!routeClear(r, lead.seg, allowLeaderCross)) continue;
        const crossesLeader =
          !!lead.seg && segs.some((s) => segmentsCross(lead.seg.p, lead.seg.q, s.p, s.q));
        placed.push(r);
        commitLeader(lead.seg);
        return {
          ...(crossesLeader ? { crossesLeader: true } : {}),
          id: it.id,
          ...r,
          leader: lead.leader && !!lead.seg,
          ...leaderFields(lead),
          hidden: false,
          compact: it.cw > 0,
          ax: it.ax,
          ay: it.ay,
          bx: Number.isFinite(it.bx) ? it.bx : it.ax,
          by: it.by,
        };
      }
      return null;
    };
    if (!chosen && it.id !== selectedId && it.occluded) {
      // Its pot is behind a neighbour's leaves, so its card is the only way to tap it: search the
      // whole view now, before plants that can be tapped directly.
      // Reachability beats tidy lines: if no spot avoids every other leader, accept one that
      // crosses (flagged crossesLeader) rather than leave this plant with no tap target.
      out.push(tryGrid() ?? tryGrid(true) ?? hiddenEntry(it));
      continue;
    }
    if (!chosen && it.id !== selectedId) {
      // Its pot can be tapped directly. Search the whole view too, but only after every plant
      // has had its usual spots, so this chip uses leftover space and never displaces a card.
      deferred.push({ slot: out.length, it, tryGrid });
      out.push(null);
      continue;
    }
    if (!chosen) {
      // The selected plant's label is always shown. Try again ignoring other labels but never
      // the reserved rectangles (banner, controls); labels it lands on are hidden below.
      for (const c of candidates(it, w, h)) {
        const r = { x: c.x, y: c.y, w, h };
        if (!inBounds(r, b)) continue;
        if (avoid.some((a) => overlaps(r, a, PAD))) continue;
        const lead = leaderOf(r, prefFull);
        if (lead.seg && avoid.some((a) => segmentHitsRect(lead.seg.p, lead.seg.q, a, LEADER_GAP)))
          continue;
        chosen = r;
        chosenLead = lead;
        break;
      }
    }
    if (!chosen) {
      // Last resort: clamp into the viewport, then push below any reserved rect it touches.
      const pref = candidates(it, w, h)[0];
      // A reserved rect wins over the edge inset when the viewport is too small for both.
      chosen = {
        x: Math.min(Math.max(pref.x, b.x0), Math.max(0, b.x1 - w)),
        y: Math.min(Math.max(pref.y, b.y0), Math.max(0, b.y1 - h)),
        w,
        h,
      };
      for (const a of avoid) if (overlaps(chosen, a, PAD)) chosen.y = a.y + a.h + PAD;
      chosen.y = Math.min(chosen.y, Math.max(0, height - h));
      chosenLead = leaderOf(chosen, prefFull);
    }
    placed.push(chosen);
    commitLeader(chosenLead.seg);
    out.push({
      id: it.id,
      x: chosen.x,
      y: chosen.y,
      w,
      h,
      leader: chosenLead.leader && !!chosenLead.seg,
      ...leaderFields(chosenLead),
      hidden: false,
      compact: false,
      ax: it.ax,
      ay: it.ay,
      bx: Number.isFinite(it.bx) ? it.bx : it.ax,
      by: it.by,
    });
  }
  // Nothing fits even in leftover space: hide it rather than overlap. The plant stays tappable
  // through its pot, and its full name is in details and List view.
  for (const d of deferred) out[d.slot] = d.tryGrid() ?? hiddenEntry(d.it);
  return out;
}
