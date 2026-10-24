// UI shell for the Tent Garden prototype. Owns in-memory state and DOM; defers every
// layout/save/history decision to the pure rules modules. Refresh resets all state.

import {
  resolveDrop,
  swapPositions,
  netChanges,
  describePosition,
  TENT_PROFILES,
  tentFor,
  potSizeOptions,
  selectedPotOverlapWarning,
} from "../rules/layoutRules.js";
import { GARDEN_IDS, resolveGardenId } from "../rules/gardenRules.js";
import {
  buildSavePreview,
  batchIdFor,
  eventsForSave,
  applySave,
  undoLastSave,
  pushDraft,
  popDraft,
  noteChanges,
  normalizeNote,
  pendingIsCurrent,
  canSave,
} from "../rules/saveRules.js";
import { timelinePoints, pointAt, evidenceFor } from "../rules/historyRules.js";
import {
  resolveModeChange,
  cameraLocked,
  escapeClearsSelection,
  editLeaveControls,
} from "../rules/modeRules.js";
import { EMPTY_DETAILS_HINT } from "../rules/pointerCueRules.js";
import { viewOptionsAfterKey } from "../rules/viewOptionsRules.js";
import { visualForStage, sexLabel } from "../rules/plantVisualRules.js";
// Which fictional garden to load. The query value only ever selects from a fixed map, so no
// user-supplied text reaches an import path.
const GARDEN_ID = resolveGardenId(new URLSearchParams(location.search).get("garden"));
const GARDEN_LOADERS = {
  "4x4": () => import("../data/sampleGarden.js"),
  "5x5": () => import("../data/sampleGarden5x5.js"),
};
const GARDEN = await GARDEN_LOADERS[GARDEN_ID]();
const {
  PLANTS_BY_ID,
  TODAY_LAYOUT,
  TODAY_STAGES,
  TODAY_NOTES,
  SNAPSHOTS,
  SAMPLE_TODAY_DATE,
  plantById,
} = GARDEN;

const $ = (id) => document.getElementById(id);
const ANIM_KEY = "tent-garden.animations";
const TOAST_MS = 3000;

const points = timelinePoints(SNAPSHOTS, `Today (${SAMPLE_TODAY_DATE})`);
const TODAY_INDEX = points.length - 1;

/** The tent every layout rule and the scene use: this garden's footprint + the chosen pot. */
function activeTent() {
  return tentFor(GARDEN.TENT_PROFILE_ID, state.potGal);
}
/** Pot sizes that every recorded layout (history included) and the current draft still fit. */
function currentPotOptions() {
  return potSizeOptions(
    [state.saved.savedLayout, draft(), ...SNAPSHOTS.map((s) => s.layout)],
    GARDEN.TENT_PROFILE_ID,
  );
}

const state = {
  mode: "view", // "view" | "edit"
  viewIndex: TODAY_INDEX,
  saved: {
    savedLayout: { ...TODAY_LAYOUT },
    savedNotes: { ...TODAY_NOTES },
    events: [],
    appliedBatchIds: [],
    lastBatch: null,
  },
  // Each draft entry is { layout, notes }; the first entry mirrors the saved state.
  draftHistory: [{ layout: { ...TODAY_LAYOUT }, notes: { ...TODAY_NOTES } }],
  saveSeq: 1,
  pendingBatch: null, // a failed save kept for Retry
  saveStatus: "idle", // idle | failed | saved
  selectedId: null,
  animations: readAnimPref(),
  potGal: GARDEN.DEFAULT_POT_GAL, // drawn footprint for every pot in this tent (prototype setting)
  listVisible: false,
  viewOptionsOpen: false,
};
let scene = null;
let toastTimer = 0;

function draftEntry() {
  return state.draftHistory[state.draftHistory.length - 1];
}
function draft() {
  return draftEntry().layout;
}
function draftNotes() {
  return draftEntry().notes;
}
function freshDraft() {
  return { layout: { ...state.saved.savedLayout }, notes: { ...state.saved.savedNotes } };
}
function isToday() {
  return state.viewIndex === TODAY_INDEX;
}
function dirtyChanges() {
  return netChanges(state.saved.savedLayout, draft());
}
function dirtyNotes() {
  return noteChanges(state.saved.savedNotes, draftNotes());
}
function hasUnsaved() {
  return dirtyChanges().length > 0 || dirtyNotes().length > 0 || !!state.pendingBatch;
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
    await mountScene();
  } catch (err) {
    showFallback(err?.message ?? String(err));
  }
  render({ transition: false });
  // Test hook (prototype only, fictional data): lets scripted browser checks find plants on
  // screen and read state without poking private closures.
  window.__tentGarden = {
    screenPositionOf: (id) => scene?.screenPositionOf(id) ?? null,
    inspectPoint: (x, y) => scene?.inspectPoint(x, y) ?? null,
    isCameraAnimating: () => !!scene?.isCameraAnimating(),
    snapshot: () => ({
      gardenId: GARDEN_ID,
      potGal: state.potGal,
      tent: activeTent(),
      mode: state.mode,
      selectedId: state.selectedId,
      saveStatus: state.saveStatus,
      pendingBatch: state.pendingBatch ? { batchId: state.pendingBatch.batchId } : null,
      savedLayout: { ...state.saved.savedLayout },
      savedNotes: { ...state.saved.savedNotes },
      draft: { ...draft() },
      events: state.saved.events.map((e) => ({ id: e.id, kind: e.kind, undone: e.undone })),
      appliedBatchIds: [...state.saved.appliedBatchIds],
    }),
  };
}

/** (Re)build the 3D scene for the active tent. Pot-size changes call this; state is untouched. */
async function mountScene() {
  const mod = await import("../scene/tentScene.js");
  if (!mod.isWebGLAvailable()) throw new Error("WebGL is not available in this browser.");
  scene?.dispose();
  scene = mod.createTentScene(
    $("sceneHost"),
    { onSelect: (id) => select(id), onDragMove: onDragMove, onDrop: onDrop },
    { tent: activeTent() },
  );
  scene.setAnimations(state.animations);
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
    const editing = state.mode === "edit";
    return {
      point,
      layout: editing ? draft() : state.saved.savedLayout,
      notes: editing ? draftNotes() : state.saved.savedNotes,
      stages: TODAY_STAGES,
      snapshot: null,
      editable: editing,
    };
  }
  const snapshot = SNAPSHOTS.find((s) => s.id === point.id);
  return {
    point,
    layout: snapshot.layout,
    notes: snapshot.notes,
    stages: snapshot.stages,
    snapshot,
    editable: false,
  };
}

function plantsByIdForView(layout) {
  const out = {};
  for (const id of Object.keys(layout))
    out[id] = plantById(id) ?? { id, shortName: id, longName: id };
  return out;
}

function render({ transition = false } = {}) {
  const view = currentView();
  renderTentControls(view.layout);
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
  // Camera is locked for the whole of Edit mode so gestures never fight a drag.
  const locked = cameraLocked(state.mode) || !scene;
  $("rotateLeft").disabled = $("rotateRight").disabled = $("resetView").disabled = locked;
  scene?.setCameraLocked(cameraLocked(state.mode));
  // Labels keep clear of overlays that sit on the canvas; the scene measures them per frame.
  scene?.setLabelAvoid([$("historyBanner"), $("editHint")]);
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
  const notes = dirtyNotes();
  const total = changes.length + notes.length;
  const saveFailed = state.saveStatus === "failed" && !!state.pendingBatch;
  const leave = editLeaveControls({
    changeCount: changes.length,
    noteChangeCount: notes.length,
    saveFailed,
  });
  const clean = leave.kind === "clean";
  $("doneEdit").hidden = !clean;
  $("undoDraft").hidden = clean;
  $("cancelEdit").hidden = clean;
  $("saveBtn").hidden = clean;
  const summary = $("draftSummary");
  if (saveFailed) {
    summary.innerHTML = `<span class="is-failed">Save failed (simulated). Draft kept locally — unsaved.</span>`;
    $("saveBtn").textContent = "Retry save";
    $("saveBtn").disabled = false;
  } else {
    summary.textContent =
      total === 0
        ? "No changes (draft equals saved layout and notes)"
        : `${total} net change${total === 1 ? "" : "s"} (${changes.length} layout, ${notes.length} note) · draft, unsaved`;
    $("saveBtn").textContent = "Save…";
    $("saveBtn").disabled = !canSave({
      changeCount: changes.length,
      noteChangeCount: notes.length,
    });
  }
  $("undoDraft").disabled = state.draftHistory.length <= 1;
}

function renderTentControls(layout) {
  const garden = $("gardenSelect");
  if (!garden.options.length) {
    for (const id of GARDEN_IDS) garden.add(new Option(`${TENT_PROFILES[id].label} (sample)`, id));
  }
  garden.value = GARDEN_ID;
  garden.disabled = hasUnsaved();
  garden.title = garden.disabled
    ? "Save or cancel the layout draft before switching tents."
    : "Switch to another fictional sample tent (reloads the prototype).";

  const pot = $("potSize");
  const opts = currentPotOptions();
  pot.innerHTML = "";
  for (const o of opts) {
    const opt = new Option(`${o.gal} gal pots`, String(o.gal));
    opt.disabled = !o.ok;
    if (!o.ok) opt.title = o.reason;
    pot.add(opt);
  }
  pot.value = String(state.potGal);
  pot.disabled = state.mode === "edit" || !isToday();
  pot.title =
    state.mode === "edit"
      ? "Finish or cancel the layout edit before changing pot size."
      : "Drawn pot footprint for this tent. Sizes that would make a recorded layout overlap or cross a wall are disabled. Prototype setting — nothing is recorded.";
  const warning = selectedPotOverlapWarning(layout, activeTent());
  $("potSizeNote").textContent = warning?.text ?? "";
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
        : EMPTY_DETAILS_HINT
    }</p>`;
    return;
  }
  const p = plantById(id) ?? { id, shortName: id, longName: id };
  const stageRec = view.stages?.[id];
  const v = visualForStage(stageRec);
  const ev = view.snapshot ? evidenceFor(view.snapshot, id) : null;
  const noteText = normalizeNote(view.notes?.[id]);
  const note = { value: noteText, missing: noteText === "" };
  const savedNote = normalizeNote(state.saved.savedNotes?.[id]);
  const noteDirty = state.mode === "edit" && savedNote !== noteText;
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
      <dt>Note</dt><dd>${
        state.mode === "edit" && view.point.isToday
          ? `<textarea id="noteDraft" rows="3" maxlength="280" aria-label="Draft note for ${esc(p.shortName)}" placeholder="Draft note (saved only when you Save)">${esc(noteText)}</textarea>
             <span class="muted small">${noteDirty ? "Changed in this draft — unsaved" : "Matches saved note"}</span>`
          : note.missing
            ? missing("no note recorded")
            : esc(note.value)
      }</dd>
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
             <span class="muted small">moves ${activeTent().snapIn} in per step</span>
           </div>`
        : ""
    }
    <h3>Actions</h3>
    <p class="muted small">
      <button class="btn btn--small" disabled>Open diary — Preview Only</button>
      <button class="btn btn--small" disabled>Attach photo — Preview Only</button>
    </p>`;
}

function renderEvents() {
  const list = $("eventList");
  list.innerHTML = "";
  const events = [...state.saved.events].reverse();
  if (events.length === 0) {
    list.innerHTML = `<li class="muted">No simulated events yet. A saved note, or a move you mark "actual physical move", produces one.</li>`;
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
  const r = resolveModeChange(
    { mode: state.mode, hasUnsaved: hasUnsaved(), isToday: isToday() },
    mode,
  );
  if (r.action === "noop") return;
  if (r.action === "confirm-discard") {
    const n = dirtyChanges().length + dirtyNotes().length;
    $("dlgCancelText").textContent =
      `${n} unsaved change${n === 1 ? "" : "s"} will be discarded. Nothing has been recorded.`;
    $("dlgCancel").returnValue = "keep";
    $("dlgCancel").showModal();
    return;
  }
  if (r.action === "start-draft") state.draftHistory = [freshDraft()];
  state.mode = r.mode;
  render();
}

function discardDraft() {
  state.draftHistory = [freshDraft()];
  state.pendingBatch = null;
  state.saveStatus = "idle";
  state.mode = "view";
  render();
}

function onDragMove(id, pos) {
  if (state.mode !== "edit") return;
  scene.setPlantPositionLive(id, pos);
  const r = resolveDrop(draft(), id, pos, activeTent());
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
  const r = resolveDrop(current, id, pos, activeTent());
  if (r.kind === "move") {
    state.draftHistory = pushDraft(state.draftHistory, { ...draftEntry(), layout: r.layout });
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
        state.draftHistory = pushDraft(state.draftHistory, {
          ...draftEntry(),
          layout: swapPositions(draft(), id, r.withId),
        });
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

/** Commit the note textarea into the draft as one undoable step. No-op when unchanged. */
function commitNoteDraft(id, text) {
  if (state.mode !== "edit" || !id) return;
  const next = normalizeNote(text);
  if (normalizeNote(draftNotes()[id]) === next) return;
  state.draftHistory = pushDraft(state.draftHistory, {
    ...draftEntry(),
    notes: { ...draftNotes(), [id]: next },
  });
  state.pendingBatch = null;
  state.saveStatus = "idle";
  render();
}

function nudgeSelected(dx, dz) {
  if (state.mode !== "edit" || !state.selectedId) return;
  const cur = draft()[state.selectedId];
  if (!cur) return;
  const step = activeTent().snapIn;
  commitDrop(state.selectedId, { x: cur.x + dx * step, z: cur.z + dz * step });
}

function pendingContext() {
  return {
    saveSeq: state.saveSeq,
    baseline: state.saved.savedLayout,
    draft: draft(),
    baselineNotes: state.saved.savedNotes,
    draftNotes: draftNotes(),
  };
}

/** Drop a pending (failed) save whenever the baseline or draft it was built from changes. */
function invalidatePendingIfStale() {
  if (state.pendingBatch && !pendingIsCurrent(state.pendingBatch, pendingContext())) {
    state.pendingBatch = null;
    state.saveStatus = "idle";
    return true;
  }
  return false;
}

function openSave() {
  // A note typed but not yet blurred must be part of what gets saved.
  const ta = $("noteDraft");
  if (ta && state.selectedId) commitNoteDraft(state.selectedId, ta.value);
  if (state.pendingBatch && state.saveStatus === "failed") {
    if (invalidatePendingIfStale()) {
      render();
      toast("The draft changed since that save failed. Review the new preview before saving.");
      return;
    }
    retrySave();
    return;
  }
  const preview = buildSavePreview(
    state.saved.savedLayout,
    draft(),
    PLANTS_BY_ID,
    state.saved.savedNotes,
    draftNotes(),
  );
  if (preview.isEmpty) return;
  const ul = $("saveItems");
  ul.innerHTML = "";
  for (const item of preview.items) {
    const li = document.createElement("li");
    const k = esc(item.key);
    li.innerHTML =
      item.kind === "note"
        ? `<div>${esc(item.label)}</div><div class="intent"><span>Saving a note logs one simulated event.</span></div>`
        : `<div>${esc(item.label)}</div>
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
    const batchId = batchIdFor(state.saveSeq, preview.changes, preview.notes);
    const events = eventsForSave({
      preview,
      intents,
      batchId,
      now: new Date().toISOString(),
      plantsById: PLANTS_BY_ID,
    });
    state.pendingBatch = { batchId, draft: { ...draft() }, notes: { ...draftNotes() }, events };
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
  if (invalidatePendingIfStale()) {
    render();
    return;
  }
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
  state.draftHistory = [freshDraft()];
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
  // The saved baseline moved: any pending (failed) save was built on the old one.
  state.pendingBatch = null;
  if (state.saveStatus === "failed") state.saveStatus = "idle";
  if (state.mode === "edit") state.draftHistory = [freshDraft()];
  render();
  toast("Last saved batch undone. Its simulated event is marked Undone, not deleted.");
}

function goToIndex(index) {
  const point = pointAt(points, index);
  if (!point) return;
  if (state.mode === "edit" && hasUnsaved()) {
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
  $("gardenSelect").onchange = (e) => {
    const id = resolveGardenId(e.target.value);
    if (hasUnsaved()) {
      e.target.value = GARDEN_ID;
      toast("Save or cancel the layout draft before switching tents.");
      return;
    }
    if (id !== GARDEN_ID) location.search = `?garden=${encodeURIComponent(id)}`;
  };
  $("potSize").onchange = async (e) => {
    const gal = Number(e.target.value);
    const opt = currentPotOptions().find((o) => o.gal === gal);
    if (!opt?.ok || state.mode === "edit") {
      e.target.value = String(state.potGal);
      toast(opt?.reason ?? "That pot size is not available here.");
      return;
    }
    state.potGal = gal;
    try {
      await mountScene();
    } catch (err) {
      showFallback(err?.message ?? String(err));
    }
    render({ transition: false });
    toast(`${gal} gal pots — drawn footprint for this tent. Prototype setting; nothing recorded.`);
  };
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
  $("doneEdit").onclick = () => setMode("view");
  $("saveBtn").onclick = openSave;
  $("viewOptionsBtn").onclick = () => {
    state.viewOptionsOpen = !state.viewOptionsOpen;
    syncViewOptions();
  };
  syncViewOptions();
  $("undoSaved").onclick = undoSaved;
  $("returnToday").onclick = () => goToIndex(TODAY_INDEX);
  $("histRange").oninput = (e) => goToIndex(Number(e.target.value));
  $("histPrev").onclick = () => goToIndex(state.viewIndex - 1);
  $("histNext").onclick = () => goToIndex(state.viewIndex + 1);
  $("dlgCancel").addEventListener("close", () => {
    if ($("dlgCancel").returnValue === "discard") discardDraft();
  });
  document.addEventListener("change", (e) => {
    if (e.target?.id === "noteDraft") commitNoteDraft(state.selectedId, e.target.value);
  });
  // While a note is being typed it is not yet in the draft (that happens on change/blur or
  // when Save opens), but Save must already be clickable straight from the field.
  document.addEventListener("input", (e) => {
    if (e.target?.id !== "noteDraft" || state.mode !== "edit" || !state.selectedId) return;
    const liveNoteDirty =
      normalizeNote(e.target.value) !== normalizeNote(draftNotes()[state.selectedId]);
    const changes = dirtyChanges().length;
    const notes = dirtyNotes().length;
    if (state.saveStatus === "failed" && state.pendingBatch) return;
    $("saveBtn").disabled = !canSave({
      changeCount: changes,
      noteChangeCount: notes,
      liveNoteDirty,
    });
    if (liveNoteDirty && changes + notes === 0) {
      $("draftSummary").textContent = "1 note change (typing) · draft, unsaved";
    }
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
  });
  // Escape clears the selection from anywhere on the page, not only with focus in the 3D view.
  // Escape closes View options first, and then it does not also clear the selection.
  document.addEventListener("keydown", (e) => {
    const dialogOpen = !!document.querySelector("dialog[open]");
    if (!dialogOpen && state.viewOptionsOpen && !viewOptionsAfterKey(true, e.key)) {
      state.viewOptionsOpen = false;
      syncViewOptions();
      $("viewOptionsBtn").focus();
      e.preventDefault();
      return;
    }
    const t = e.target;
    const editableTarget =
      !!t &&
      ((t.tagName === "INPUT" && !/^(checkbox|radio|range|button|submit|reset)$/.test(t.type)) ||
        /^(TEXTAREA|SELECT)$/.test(t.tagName || "") ||
        t.isContentEditable === true);
    if (
      escapeClearsSelection({
        key: e.key,
        defaultPrevented: e.defaultPrevented,
        dialogOpen,
        editableTarget,
        hasSelection: state.selectedId != null,
      })
    )
      select(null);
  });
}

function syncViewOptions() {
  const open = !!state.viewOptionsOpen;
  $("viewOptionsBtn").setAttribute("aria-expanded", String(open));
  $("viewOptionsPanel").classList.toggle("is-open", open);
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

boot();
