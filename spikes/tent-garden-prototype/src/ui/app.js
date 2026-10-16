// UI shell for the Tent Garden prototype. Owns in-memory state and DOM; defers every
// layout/save/history decision to the pure rules modules. Refresh resets all state.

import {
  resolveDrop,
  swapPositions,
  netChanges,
  describePosition,
  TENT,
} from "../rules/layoutRules.js";
import {
  buildSavePreview,
  batchIdFor,
  eventsForSave,
  applySave,
  undoLastSave,
  pushDraft,
  popDraft,
} from "../rules/saveRules.js";
import { timelinePoints, pointAt, evidenceFor } from "../rules/historyRules.js";
import { visualForStage, sexLabel } from "../rules/plantVisualRules.js";
import {
  PLANTS_BY_ID,
  TODAY_LAYOUT,
  TODAY_STAGES,
  SNAPSHOTS,
  SAMPLE_TODAY_DATE,
  plantById,
} from "../data/sampleGarden.js";

const $ = (id) => document.getElementById(id);
const ANIM_KEY = "tent-garden.animations";
const TOAST_MS = 3000;

const points = timelinePoints(SNAPSHOTS, `Today (${SAMPLE_TODAY_DATE})`);
const TODAY_INDEX = points.length - 1;

const state = {
  mode: "view", // "view" | "edit"
  viewIndex: TODAY_INDEX,
  saved: { savedLayout: { ...TODAY_LAYOUT }, events: [], appliedBatchIds: [], lastBatch: null },
  draftHistory: [{ ...TODAY_LAYOUT }],
  saveSeq: 1,
  pendingBatch: null, // a failed save kept for Retry
  saveStatus: "idle", // idle | failed | saved
  selectedId: null,
  animations: readAnimPref(),
  listVisible: false,
};
let scene = null;
let toastTimer = 0;

function draft() {
  return state.draftHistory[state.draftHistory.length - 1];
}
function isToday() {
  return state.viewIndex === TODAY_INDEX;
}
function dirtyChanges() {
  return netChanges(state.saved.savedLayout, draft());
}
function readAnimPref() {
  try {
    const v = localStorage.getItem(ANIM_KEY);
    if (v === "on") return true;
    if (v === "off") return false;
  } catch {
    /* storage may be unavailable; fall through */
  }
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ---- boot ----------------------------------------------------------------------------------

async function boot() {
  wireControls();
  buildHistoryTicks();
  $("animToggle").checked = state.animations;
  try {
    const mod = await import("../scene/tentScene.js");
    if (!mod.isWebGLAvailable()) throw new Error("WebGL is not available in this browser.");
    scene = mod.createTentScene($("sceneHost"), {
      onSelect: (id) => select(id),
      onDragMove: onDragMove,
      onDrop: onDrop,
    });
    scene.setAnimations(state.animations);
  } catch (err) {
    showFallback(err?.message ?? String(err));
  }
  render({ transition: false });
}

function showFallback(reason) {
  $("fallback").hidden = false;
  $("fallbackReason").textContent = reason;
  state.listVisible = true;
  $("showList").setAttribute("aria-pressed", "true");
  $("rotateLeft").disabled = $("rotateRight").disabled = $("resetView").disabled = true;
}

// ---- view assembly ------------------------------------------------------------------------

function currentView() {
  const point = pointAt(points, state.viewIndex);
  if (point.isToday) {
    const layout = state.mode === "edit" ? draft() : state.saved.savedLayout;
    return { point, layout, stages: TODAY_STAGES, snapshot: null, editable: state.mode === "edit" };
  }
  const snapshot = SNAPSHOTS.find((s) => s.id === point.id);
  return { point, layout: snapshot.layout, stages: snapshot.stages, snapshot, editable: false };
}

function plantsByIdForView(layout) {
  const out = {};
  for (const id of Object.keys(layout))
    out[id] = plantById(id) ?? { id, shortName: id, longName: id };
  return out;
}

function render({ transition = false } = {}) {
  const view = currentView();
  if (scene) {
    scene.setView({
      layout: view.layout,
      stages: view.stages,
      plantsById: plantsByIdForView(view.layout),
      editable: view.editable,
      transition,
    });
    scene.setSelected(view.layout[state.selectedId] ? state.selectedId : null);
  }
  const modeLabel = state.mode === "edit" ? "Edit Layout" : "View";
  $("viewStatus").textContent = view.point.isToday
    ? `${view.point.label} · ${modeLabel}`
    : `Recorded ${view.point.date} · read-only`;

  const banner = $("historyBanner");
  banner.hidden = view.point.isToday;
  if (!view.point.isToday) {
    $("historyBannerText").textContent =
      `Viewing recorded snapshot: ${view.point.label}. Layout editing is off. ${
        transition && state.animations
          ? "The motion you just saw is an orientation aid, not recorded movement."
          : ""
      }`;
  }
  $("editHint").hidden = !(state.mode === "edit" && view.point.isToday);
  $("modeEdit").disabled = !view.point.isToday;
  $("modeView").classList.toggle("is-active", state.mode === "view");
  $("modeEdit").classList.toggle("is-active", state.mode === "edit");
  $("modeView").setAttribute("aria-pressed", String(state.mode === "view"));
  $("modeEdit").setAttribute("aria-pressed", String(state.mode === "edit"));

  $("histRange").value = String(state.viewIndex);
  $("histLabel").textContent = view.point.label;
  $("returnToday").hidden = view.point.isToday;

  renderSaveBar();
  renderList(view);
  renderDetails(view);
  renderEvents();
}

function renderSaveBar() {
  const bar = $("saveBar");
  bar.hidden = state.mode !== "edit";
  if (bar.hidden) return;
  const changes = dirtyChanges();
  const summary = $("draftSummary");
  if (state.saveStatus === "failed" && state.pendingBatch) {
    summary.innerHTML = `<span class="is-failed">Save failed (simulated). Draft kept locally — unsaved.</span>`;
    $("saveBtn").textContent = "Retry save";
    $("saveBtn").disabled = false;
  } else {
    summary.textContent =
      changes.length === 0
        ? "No changes (draft equals saved layout)"
        : `${changes.length} net change${changes.length === 1 ? "" : "s"} · draft, unsaved`;
    $("saveBtn").textContent = "Save…";
    $("saveBtn").disabled = changes.length === 0;
  }
  $("undoDraft").disabled = state.draftHistory.length <= 1;
}

function renderList(view) {
  $("listView").hidden = !state.listVisible;
  $("showList").setAttribute("aria-pressed", String(state.listVisible));
  const body = $("listBody");
  body.innerHTML = "";
  for (const id of Object.keys(view.layout).sort()) {
    const p = plantById(id);
    const v = visualForStage(view.stages?.[id]);
    const tr = document.createElement("tr");
    tr.className = id === state.selectedId ? "is-selected" : "";
    tr.innerHTML = `<td>${esc(id)}</td><td>${esc(p?.longName ?? id)}</td><td>${esc(v.label)}</td><td>${esc(
      describePosition(view.layout[id]),
    )}</td><td><button class="btn btn--small" data-select="${esc(id)}">Details</button></td>`;
    body.appendChild(tr);
  }
}

function renderDetails(view) {
  const host = $("detailsBody");
  const id = state.selectedId;
  if (!id || !view.layout[id]) {
    host.innerHTML = `<p class="muted">${
      id && !view.layout[id]
        ? `${esc(plantById(id)?.shortName ?? id)} (${esc(id)}) has no recorded position in this view.`
        : "Tap or click a plant to see its recorded details."
    }</p>`;
    return;
  }
  const p = plantById(id) ?? { id, shortName: id, longName: id };
  const stageRec = view.stages?.[id];
  const v = visualForStage(stageRec);
  const ev = view.snapshot ? evidenceFor(view.snapshot, id) : null;
  const note = view.snapshot ? ev.note : { value: null, missing: true };
  const photo = view.snapshot ? ev.photo : { value: null, missing: true };
  const when = view.point.isToday ? `Today (${SAMPLE_TODAY_DATE})` : `Recorded ${view.point.date}`;
  const missing = (txt) => `<span class="badge badge--missing">${esc(txt)}</span>`;
  host.innerHTML = `
    <h2>${esc(p.shortName)} <span class="badge">${esc(id)}</span></h2>
    <p class="muted small">${esc(p.longName)} · <span class="badge badge--preview">Sample data</span></p>
    <dl>
      <dt>Viewing</dt><dd>${esc(when)}</dd>
      <dt>Recorded stage</dt><dd>${esc(v.label)}${v.neutral ? " " + missing("not recorded") : ""}</dd>
      <dt>Sex</dt><dd>${esc(sexLabel(stageRec?.sex))}</dd>
      <dt>Position</dt><dd>${esc(describePosition(view.layout[id]))}</dd>
      <dt>Note</dt><dd>${note.missing ? missing("no note recorded") : esc(note.value)}</dd>
    </dl>
    ${
      photo.missing
        ? `<div class="photo-placeholder">No photo recorded for this date</div>`
        : `<div class="photo-placeholder">${esc(photo.value.caption)}</div>`
    }
    <p class="muted small">Artwork shows recorded stage and week only — not measured size, health or yield.</p>
    ${
      state.mode === "edit" && view.point.isToday
        ? `<div class="nudge" role="group" aria-label="Keyboard alternative to dragging">
             <button class="btn btn--small" data-nudge="0,-1">↑ back</button>
             <button class="btn btn--small" data-nudge="-1,0">← left</button>
             <button class="btn btn--small" data-nudge="1,0">→ right</button>
             <button class="btn btn--small" data-nudge="0,1">↓ door</button>
             <span class="muted small">moves ${TENT.snapIn} in per step</span>
           </div>`
        : ""
    }
    <h3>Actions</h3>
    <p class="muted small">
      <button class="btn btn--small" disabled>Open diary — Preview Only</button>
      <button class="btn btn--small" disabled>Add note — Preview Only</button>
    </p>`;
}

function renderEvents() {
  const list = $("eventList");
  list.innerHTML = "";
  const events = [...state.saved.events].reverse();
  if (events.length === 0) {
    list.innerHTML = `<li class="muted">No simulated events yet. Only an "actual physical move" that you Save produces one.</li>`;
  }
  for (const e of events) {
    const li = document.createElement("li");
    li.className = e.undone ? "is-undone" : "";
    li.innerHTML = `${esc(e.title)}${e.undone ? ' <span class="badge">Undone</span>' : ""}<time>${esc(
      e.recordedAt,
    )} · ${esc(e.source)}</time>`;
    list.appendChild(li);
  }
  $("undoSaved").hidden = !state.saved.lastBatch;
}

// ---- interactions -------------------------------------------------------------------------

function select(id) {
  state.selectedId = id;
  render();
}

function setMode(mode) {
  if (mode === "edit" && !isToday()) return;
  if (mode === "view" && state.mode === "edit") {
    const changes = dirtyChanges();
    if (changes.length > 0 || state.pendingBatch) {
      $("dlgCancelText").textContent = `${changes.length} unsaved change${
        changes.length === 1 ? "" : "s"
      } will be discarded. Nothing has been recorded.`;
      $("dlgCancel").returnValue = "keep";
      $("dlgCancel").showModal();
      return;
    }
  }
  state.mode = mode;
  if (mode === "edit") state.draftHistory = [{ ...state.saved.savedLayout }];
  render();
}

function discardDraft() {
  state.draftHistory = [{ ...state.saved.savedLayout }];
  state.pendingBatch = null;
  state.saveStatus = "idle";
  state.mode = "view";
  render();
}

function onDragMove(id, pos) {
  if (state.mode !== "edit") return;
  scene.setPlantPositionLive(id, pos);
  const r = resolveDrop(draft(), id, pos);
  const ok = r.kind !== "rejected";
  const target = r.kind === "swap-needed" ? r.target : (r.layout?.[id] ?? pos);
  scene.showGhost(target, ok);
}

function onDrop(id, pos) {
  if (state.mode !== "edit") return;
  commitDrop(id, pos);
}

/** Shared by drag drop and keyboard nudges: route through resolveDrop, never mutate directly. */
function commitDrop(id, pos) {
  const current = draft();
  const r = resolveDrop(current, id, pos);
  if (r.kind === "move") {
    state.draftHistory = pushDraft(state.draftHistory, r.layout);
    state.pendingBatch = null;
    state.saveStatus = "idle";
    render();
    return;
  }
  if (r.kind === "noop") {
    render();
    return;
  }
  if (r.kind === "swap-needed") {
    const a = plantById(id);
    const b = plantById(r.withId);
    render(); // snap the dragged pot back while the question is open
    $("dlgSwapText").textContent =
      `Put ${a.shortName} (${id}) where ${b.shortName} (${r.withId}) is, and move ${b.shortName} to ${a.shortName}'s current spot? This is a draft until you Save.`;
    const dlg = $("dlgSwap");
    dlg.returnValue = "cancel";
    dlg.onclose = () => {
      if (dlg.returnValue === "swap") {
        state.draftHistory = pushDraft(state.draftHistory, swapPositions(draft(), id, r.withId));
        state.pendingBatch = null;
        state.saveStatus = "idle";
      }
      render();
    };
    dlg.showModal();
    return;
  }
  render();
  toast(
    r.reason === "out-of-bounds" ? "That spot is outside the tent." : "That move was not applied.",
  );
}

function nudgeSelected(dx, dz) {
  if (state.mode !== "edit" || !state.selectedId) return;
  const cur = draft()[state.selectedId];
  if (!cur) return;
  commitDrop(state.selectedId, { x: cur.x + dx * TENT.snapIn, z: cur.z + dz * TENT.snapIn });
}

function openSave() {
  if (state.pendingBatch && state.saveStatus === "failed") {
    retrySave();
    return;
  }
  const preview = buildSavePreview(state.saved.savedLayout, draft(), PLANTS_BY_ID);
  if (preview.isEmpty) return;
  const ul = $("saveItems");
  ul.innerHTML = "";
  for (const item of preview.items) {
    const li = document.createElement("li");
    const k = esc(item.key);
    li.innerHTML = `<div>${esc(item.label)}</div>
      <div class="intent">
        <label><input type="radio" name="intent:${k}" value="map-only" checked /> Correct Map Only (no event)</label>
        <label><input type="radio" name="intent:${k}" value="physical" /> Actual Physical Move (simulated event)</label>
      </div>`;
    ul.appendChild(li);
  }
  const dlg = $("dlgSave");
  dlg.returnValue = "cancel";
  dlg.onclose = () => {
    if (dlg.returnValue !== "save") return;
    const form = $("saveForm");
    const intents = {};
    for (const item of preview.items) {
      intents[item.key] = form.elements[`intent:${item.key}`]?.value ?? "map-only";
    }
    const batchId = batchIdFor(state.saveSeq, preview.changes);
    const events = eventsForSave({
      preview,
      intents,
      batchId,
      now: new Date().toISOString(),
      plantsById: PLANTS_BY_ID,
    });
    state.pendingBatch = { batchId, draft: { ...draft() }, events };
    if ($("simulateFail").checked) {
      state.saveStatus = "failed";
      render();
      toast("Simulated save failure. Your draft is kept locally — nothing recorded. Use Retry.");
      return;
    }
    commitPending();
  };
  dlg.showModal();
}

function retrySave() {
  $("simulateFail").checked = false;
  commitPending();
}

function commitPending() {
  const pending = state.pendingBatch;
  if (!pending) return;
  const { state: next, duplicate } = applySave(state.saved, pending);
  state.saved = next;
  state.pendingBatch = null;
  state.saveStatus = "saved";
  state.saveSeq += 1;
  state.mode = "view";
  state.draftHistory = [{ ...state.saved.savedLayout }];
  render();
  if (duplicate) {
    toast("That save was already applied — no duplicate events created.");
    return;
  }
  const n = pending.events.length;
  toast(`Layout saved locally. ${n} simulated event${n === 1 ? "" : "s"} created.`, {
    label: "Undo",
    onClick: undoSaved,
  });
}

function undoSaved() {
  const { state: next, undone } = undoLastSave(state.saved);
  if (!undone) return;
  state.saved = next;
  if (state.mode === "edit") state.draftHistory = [{ ...state.saved.savedLayout }];
  render();
  toast("Last saved move undone. Its simulated event is marked Undone, not deleted.");
}

function goToIndex(index) {
  const point = pointAt(points, index);
  if (!point) return;
  if (state.mode === "edit" && (dirtyChanges().length > 0 || state.pendingBatch)) {
    toast("Save or cancel your draft before time-travelling.");
    $("histRange").value = String(state.viewIndex);
    return;
  }
  const changed = point.index !== state.viewIndex;
  state.viewIndex = point.index;
  if (!point.isToday) state.mode = "view";
  render({ transition: changed });
}

function toast(text, action) {
  const el = $("toast");
  el.innerHTML = `<span>${esc(text)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.className = "btn btn--small btn--primary";
    b.textContent = action.label;
    b.onclick = () => {
      hideToast();
      action.onClick();
    };
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}
function hideToast() {
  $("toast").hidden = true;
}

function buildHistoryTicks() {
  const range = $("histRange");
  range.max = String(points.length - 1);
  const dl = $("histTicks");
  const labels = $("histTickLabels");
  dl.innerHTML = "";
  labels.innerHTML = "";
  for (const p of points) {
    const opt = document.createElement("option");
    opt.value = String(p.index);
    opt.label = p.isToday ? "Today" : p.date;
    dl.appendChild(opt);
    const span = document.createElement("span");
    span.textContent = p.isToday ? "Today" : p.date.slice(5);
    labels.appendChild(span);
  }
}

function wireControls() {
  $("modeView").onclick = () => setMode("view");
  $("modeEdit").onclick = () => setMode("edit");
  $("rotateLeft").onclick = () => scene?.rotateBy(-90);
  $("rotateRight").onclick = () => scene?.rotateBy(90);
  $("resetView").onclick = () => scene?.resetView();
  $("animToggle").onchange = (e) => {
    state.animations = e.target.checked;
    try {
      localStorage.setItem(ANIM_KEY, state.animations ? "on" : "off");
    } catch {
      /* ignore */
    }
    scene?.setAnimations(state.animations);
  };
  $("showList").onclick = () => {
    state.listVisible = !state.listVisible;
    render();
  };
  $("undoDraft").onclick = () => {
    const { history, undone } = popDraft(state.draftHistory);
    if (!undone) return;
    state.draftHistory = history;
    state.pendingBatch = null;
    state.saveStatus = "idle";
    render();
  };
  $("cancelEdit").onclick = () => setMode("view");
  $("saveBtn").onclick = openSave;
  $("undoSaved").onclick = undoSaved;
  $("returnToday").onclick = () => goToIndex(TODAY_INDEX);
  $("histRange").oninput = (e) => goToIndex(Number(e.target.value));
  $("histPrev").onclick = () => goToIndex(state.viewIndex - 1);
  $("histNext").onclick = () => goToIndex(state.viewIndex + 1);
  $("dlgCancel").addEventListener("close", () => {
    if ($("dlgCancel").returnValue === "discard") discardDraft();
  });
  document.addEventListener("click", (e) => {
    const sel = e.target.closest?.("[data-select]");
    if (sel) select(sel.dataset.select);
    const nudge = e.target.closest?.("[data-nudge]");
    if (nudge) {
      const [dx, dz] = nudge.dataset.nudge.split(",").map(Number);
      nudgeSelected(dx, dz);
    }
  });
  $("sceneHost").addEventListener("keydown", (e) => {
    const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (map[e.key] && state.mode === "edit") {
      e.preventDefault();
      nudgeSelected(...map[e.key]);
    } else if (e.key === "[") scene?.rotateBy(-90);
    else if (e.key === "]") scene?.rotateBy(90);
    else if (e.key === "r" || e.key === "R") scene?.resetView();
    else if (e.key === "Escape") select(null);
  });
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

boot();
