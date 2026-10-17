// Three.js diorama for the Tent Garden prototype. This module owns the WebGL scene only.
// It receives a "view" (recorded layout + stage records) and emits pointer intents
// (select, drag-move, drop). It never decides whether a drop is valid — rules do.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { TENT, clampToTent } from "../rules/layoutRules.js";
import { visualForStage, labelFor } from "../rules/plantVisualRules.js";
import { layoutLabels } from "../rules/labelLayoutRules.js";
import { hardwareOpacity, HARDWARE_KEYS } from "../rules/hardwareVisibilityRules.js";
import { decideFrame, fadeStep } from "../rules/renderScheduleRules.js";
import {
  STORYBOOK,
  toon,
  outlined,
  seedFor,
  buildStorybookPot,
  buildStorybookPlant,
} from "./storybookPlant.js";

const UNIT = 1; // 1 scene unit = 1 inch
const LABEL_EDGE_INSET = 8; // px between label cards (with shadow and tilt) and the scene edges
const FLOOR_Y = 0;
const POT_H = 7;
const WALL_H = 26;
const TRANSITION_MS = 1500;

// Storybook palette (style B): warm paper, muted greens, terracotta. Shading comes from the
// two-step toon gradient in storybookPlant.js, not from these colours.
const COLORS = {
  sky: STORYBOOK.paper,
  floor: STORYBOOK.ground,
  grid: STORYBOOK.grid,
  wall: STORYBOOK.wall,
  frame: STORYBOOK.frame,
  lamp: STORYBOOK.lamp,
  selectRing: 0xff5c8a,
  ghost: 0x2ec27e,
  door: STORYBOOK.door,
};

const DEFAULT_CAMERA = { azimuthDeg: -30, polarDeg: 58, distance: 125 };

export function isWebGLAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} host
 * @param {{ onSelect:(id:string|null)=>void, onDragMove:(id:string,pos:{x,z})=>void, onDrop:(id:string,pos:{x,z})=>void }} handlers
 */
export function createTentScene(host, handlers, opts = {}) {
  // The tent (footprint + pot size) is data: every size the grower picks redraws from it.
  const tent = opts.tent ?? TENT;
  // Default camera distance scales with the footprint so a 5×5 frames like a 4×4.
  const DEFAULT_CAM = {
    ...DEFAULT_CAMERA,
    distance: DEFAULT_CAMERA.distance * (Math.max(tent.widthIn, tent.depthIn) / 48),
  };
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  host.appendChild(labelRenderer.domElement);
  // Plant labels live in a self-managed layer so a pure rule can place them without overlap.
  const labelLayer = document.createElement("div");
  labelLayer.className = "label-layer";
  host.appendChild(labelLayer);
  const leaderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leaderSvg.setAttribute("class", "leader-layer");
  host.appendChild(leaderSvg);
  let labelAvoid = [];
  const hardware = new Map(); // key -> mesh with its own material (+ door label element)

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 600);
  const target = new THREE.Vector3(tent.widthIn / 2, 6, tent.depthIn / 2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 55;
  controls.maxDistance = 300;
  controls.minPolarAngle = THREE.MathUtils.degToRad(12); // never straight down the pole
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82); // never below the floor
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

  buildTent(scene, hardware, tent);
  buildLights(scene);

  const plants = new Map(); // id -> { group, pot, plant, labelObj, labelEl, ring, from, to, t0 }
  const ghost = buildGhost(tent);
  scene.add(ghost);
  ghost.visible = false;

  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y);
  const pointer = new THREE.Vector2();

  let camAnim = null;
  let userMovedCamera = false;
  controls.addEventListener("start", () => {
    userMovedCamera = true;
  });
  controls.addEventListener("change", requestRender);
  let editable = false;
  let animations = true;
  let selectedId = null;
  let drag = null; // { id, offset:{x,z}, moved:boolean }
  let currentView = null;
  let lastRenderedTick = 0;
  // Render on demand: a frame is drawn only when something changed, and frames continue only
  // while something is still moving (camera ease, tweens, orbit damping, hardware fade).
  let raf = 0;
  let inFrame = false;
  let lastFrameAt = 0;
  function requestRender() {
    if (!raf && !inFrame) raf = requestAnimationFrame(frame);
  }

  // Size the renderer was last fitted to. The browser runs animation frames before it delivers
  // ResizeObserver callbacks, so a frame can see a host that has already changed size (the phone
  // details panel opening or closing) while the camera still has the old aspect. frame() checks
  // this and resizes first, so labels are never laid out against a stale camera.
  let sizedW = 0;
  let sizedH = 0;
  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    sizedW = w;
    sizedH = h;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Keep the fitted default until the grower moves the camera themselves.
    if (!userMovedCamera) setCamera(DEFAULT_CAM, false);
    requestRender();
  }
  /** Fit the renderer and camera to the host now if it changed size since the last fit. */
  function syncSize() {
    if ((host.clientWidth || 1) !== sizedW || (host.clientHeight || 1) !== sizedH) resize();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  setCamera(DEFAULT_CAM, false);

  // ---- pointer handling ---------------------------------------------------------------
  function toPointer(ev) {
    syncSize(); // a tap right after a layout change must not pick with the old camera aspect
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  }
  function pickPlant(ev) {
    toPointer(ev);
    return pickAtPointer();
  }
  /** Plant id under `pointer` (NDC). Pot columns and foliage both count; nearest wins. */
  function pickAtPointer() {
    const hits = pickHitsAtPointer();
    return hits[0] ? hits[0].object.userData.plantId : null;
  }
  /** Ranked selection hits under `pointer`: pot pick-columns and foliage, nearest first. */
  function pickHitsAtPointer() {
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    for (const [id, p] of plants) {
      if (!p.group.visible) continue;
      p.pickMesh.userData.plantId = id;
      meshes.push(p.pickMesh);
    }
    // Pot-height pick cylinders first; then the foliage itself, so clicking the leaves of a
    // back-row plant selects that plant instead of the tall invisible column of a front one.
    const hits = raycaster.intersectObjects(meshes, false);
    const foliage = [];
    for (const [id, p] of plants) {
      if (p.group.visible && p.plantMesh) {
        p.plantMesh.userData.plantId = id;
        foliage.push(p.plantMesh);
      }
    }
    for (const h of raycaster.intersectObjects(foliage, true)) {
      let o = h.object;
      while (o && !o.userData.plantId) o = o.parent;
      if (o) hits.push({ distance: h.distance, object: o });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  // ---- test hook: what a tap at a host point would see, and what it would select ------------
  /** Which plant part an object belongs to (pot, foliage, pick column, ring) or what else it is. */
  function partOf(obj) {
    for (let o = obj; o; o = o.parent) {
      for (const [id, p] of plants) {
        if (o === p.pot) return { plantId: id, part: "pot" };
        if (o === p.plantMesh) return { plantId: id, part: "foliage" };
        if (o === p.pickMesh) return { plantId: id, part: "pick-column" };
        if (o === p.ring) return { plantId: id, part: "ring" };
      }
    }
    return { plantId: null, part: obj.name || obj.type };
  }
  /** Drawn and mostly opaque: what the eye actually sees at a pixel. */
  function seenObject(o) {
    for (let a = o; a; a = a.parent) if (a.visible === false) return false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    return mats.some(
      (m) =>
        m &&
        m.visible !== false &&
        m.side !== THREE.BackSide &&
        (!m.transparent || m.opacity >= 0.5),
    );
  }
  /**
   * Read-only probe for verification: the first drawn surface along the ray (what is visible)
   * and the ranked selection hits (what a tap would select). Does not change state.
   */
  function inspectPoint(hx, hy) {
    syncSize();
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    pointer.set((hx / w) * 2 - 1, -(hy / h) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const seen = raycaster.intersectObject(scene, true).find((x) => seenObject(x.object));
    const ranked = pickHitsAtPointer().map((x) => ({
      ...partOf(x.object),
      plantId: x.object.userData.plantId,
      distance: +x.distance.toFixed(2),
    }));
    return {
      visible: seen
        ? {
            ...partOf(seen.object),
            object: `${seen.object.type}#${seen.object.id}`,
            distance: +seen.distance.toFixed(2),
          }
        : null,
      pick: ranked.slice(0, 4),
      wouldSelect: ranked[0]?.plantId ?? null,
    };
  }
  function floorPoint(ev) {
    toPointer(ev);
    raycaster.setFromCamera(pointer, camera);
    const out = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, out)) return null;
    return { x: out.x / UNIT, z: out.z / UNIT };
  }

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    const id = pickPlant(ev);
    if (!id) return;
    if (!editable) {
      handlers.onSelect(id);
      return;
    }
    const fp = floorPoint(ev);
    const cur = currentView?.layout?.[id];
    if (!fp || !cur) return;
    drag = { id, offset: { x: cur.x - fp.x, z: cur.z - fp.z }, moved: false };
    controls.enabled = false; // orbit must not fight the drag (already off in Edit mode)
    renderer.domElement.setPointerCapture?.(ev.pointerId);
    handlers.onSelect(id);
    ev.preventDefault();
  });
  renderer.domElement.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const fp = floorPoint(ev);
    if (!fp) return;
    const raw = { x: fp.x + drag.offset.x, z: fp.z + drag.offset.z };
    const pos = clampToTent(raw, tent);
    drag.moved = true;
    handlers.onDragMove(drag.id, pos);
  });
  function endDrag(ev) {
    if (!drag) return;
    const d = drag;
    drag = null;
    controls.enabled = !cameraLockedFlag;
    ghost.visible = false;
    if (!d.moved) return;
    const fp = ev ? floorPoint(ev) : null;
    const raw = fp ? { x: fp.x + d.offset.x, z: fp.z + d.offset.z } : currentView.layout[d.id];
    handlers.onDrop(d.id, clampToTent(raw, tent));
  }
  renderer.domElement.addEventListener("pointerup", endDrag);
  renderer.domElement.addEventListener("pointercancel", () => endDrag(null));
  renderer.domElement.addEventListener("dblclick", (ev) => ev.preventDefault());
  renderer.domElement.addEventListener("contextmenu", (ev) => ev.preventDefault());

  // ---- camera helpers -----------------------------------------------------------------
  /** Fitted distance grows when the viewport is narrow so the whole tent stays in frame. */
  function fittedDistance(base) {
    const aspect = camera.aspect || 1;
    return aspect < 1 ? base / Math.max(aspect, 0.45) : base;
  }
  function setCamera({ azimuthDeg, polarDeg, distance }, animate) {
    if (distance === DEFAULT_CAM.distance) distance = fittedDistance(distance);
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const po = THREE.MathUtils.degToRad(polarDeg);
    const dest = new THREE.Vector3(
      target.x + distance * Math.sin(po) * Math.sin(az),
      target.y + distance * Math.cos(po),
      target.z + distance * Math.sin(po) * Math.cos(az),
    );
    if (!animate || !animations) {
      camera.position.copy(dest);
      camAnim = null;
      controls.update();
      requestRender();
      return;
    }
    camAnim = { from: camera.position.clone(), to: dest, t0: performance.now(), ms: 600 };
    requestRender();
  }
  function currentSpherical() {
    const off = camera.position.clone().sub(target);
    const s = new THREE.Spherical().setFromVector3(off);
    return {
      azimuthDeg: THREE.MathUtils.radToDeg(s.theta),
      polarDeg: THREE.MathUtils.radToDeg(s.phi),
      distance: s.radius,
    };
  }

  // ---- plant objects ------------------------------------------------------------------
  function ensurePlant(id, plantRecord) {
    let p = plants.get(id);
    if (p) return p;
    const group = new THREE.Group();
    const pot = buildPot(tent);
    group.add(pot);
    const pickMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tent.potRadiusIn + 1, tent.potRadiusIn + 1, POT_H + 4, 10),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    pickMesh.position.y = (POT_H + 4) / 2;
    group.add(pickMesh);
    // Selection halo at pot-rim height so it reads from every angle (a floor disc hides
    // behind neighbouring pots). Drawn on top so leaves never cover it.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(tent.potRadiusIn + 0.9, 0.5, 8, 48),
      new THREE.MeshBasicMaterial({
        color: COLORS.selectRing,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    ring.renderOrder = 10;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = POT_H + 0.2;
    ring.visible = false;
    group.add(ring);
    // The name label is also a selection target: in a crowded tent a back-row pot can sit
    // behind a front plant's leaves, and the label is the one handle that is always visible.
    const labelEl = document.createElement("div");
    labelEl.className = "plant-label";
    labelEl.setAttribute("role", "button");
    labelEl.tabIndex = 0;
    labelEl.setAttribute("aria-label", `Select ${plantRecord?.shortName ?? id} (${id})`);
    const pick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handlers.onSelect(id);
    };
    // A touch tap fires click after pointerdown. A tap on a pot selects that plant on pointerdown,
    // the phone details panel opens, the scene re-fits and labels move — so the trailing click can
    // land on a different plant's label. Only a gesture that started on this label may select it.
    let pressedHere = null;
    const press = (ev) => {
      pressedHere = ev.currentTarget;
    };
    const clickPick = (ev) => {
      const started = pressedHere === ev.currentTarget;
      pressedHere = null;
      if (started) pick(ev);
    };
    labelEl.addEventListener("pointerdown", press);
    labelEl.addEventListener("click", clickPick);
    labelEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") pick(ev);
    });
    labelLayer.appendChild(labelEl);
    // Compact fallback: the stable id only, same font size, used when the full label cannot fit.
    const chipEl = document.createElement("div");
    chipEl.className = "plant-label plant-chip";
    chipEl.setAttribute("role", "button");
    chipEl.tabIndex = 0;
    chipEl.setAttribute("aria-label", `Select ${plantRecord?.shortName ?? id} (${id})`);
    chipEl.textContent = id;
    chipEl.style.display = "none";
    chipEl.addEventListener("pointerdown", press);
    chipEl.addEventListener("click", clickPick);
    chipEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") pick(ev);
    });
    labelLayer.appendChild(chipEl);
    scene.add(group);
    p = {
      group,
      pot,
      pickMesh,
      ring,
      labelEl,
      chipEl,
      chipSize: null,
      labelAnchorY: POT_H + 2,
      labelSize: null,
      plantMesh: null,
      visualKey: null,
      from: null,
      to: null,
      t0: 0,
      scaleFrom: 1,
      scaleTo: 1,
      record: plantRecord,
    };
    plants.set(id, p);
    return p;
  }

  function setPlantVisual(p, stageRecord, plantRecord) {
    const v = visualForStage(stageRecord);
    const key = JSON.stringify(v);
    if (p.visualKey !== key) {
      if (p.plantMesh) {
        p.group.remove(p.plantMesh);
        disposeDeep(p.plantMesh);
      }
      p.plantMesh = buildPlant(v, plantRecord?.id);
      p.plantMesh.position.y = POT_H - 0.5;
      p.group.add(p.plantMesh);
      p.visualKey = key;
      p.labelAnchorY =
        POT_H + v.heightIn * (v.clusterCount > 0 ? 1.1 : 1) + (v.clusterCount > 0 ? 6 : 3);
      // brief grow-in on first build when animations are on
      if (animations) {
        p.scaleFrom = 0.6;
        p.scaleTo = 1;
        p.scaleT0 = performance.now();
      }
    }
    const html = `${escapeHtml(labelFor(plantRecord))}<small>${escapeHtml(v.label)}</small>`;
    if (p.labelEl.innerHTML !== html) {
      p.labelEl.innerHTML = html;
      p.labelSize = null; // re-measure on next frame
    }
    p.labelEl.classList.toggle("is-neutral", v.neutral);
  }

  /**
   * Apply a view. `view` = { layout, stages, plantsById, editable, transition }.
   * Positions animate only when `transition` is true and animations are on; the caller
   * labels historical transitions as an orientation aid.
   */
  function setView(view) {
    const prev = currentView;
    currentView = view;
    editable = !!view.editable;
    const now = performance.now();
    const ids = new Set(Object.keys(view.layout));
    for (const id of ids) {
      const rec = view.plantsById[id] ?? { id, shortName: id, longName: id };
      const p = ensurePlant(id, rec);
      p.group.visible = true;
      setPlantVisual(p, view.stages?.[id], rec);
      const dest = view.layout[id];
      const cur = p.to ?? dest;
      const wasVisibleBefore = prev && prev.layout[id];
      if (
        view.transition &&
        animations &&
        wasVisibleBefore &&
        (cur.x !== dest.x || cur.z !== dest.z)
      ) {
        p.from = { x: p.group.position.x / UNIT, z: p.group.position.z / UNIT };
        p.to = dest;
        p.t0 = now;
      } else {
        p.from = null;
        p.to = dest;
        p.group.position.set(dest.x * UNIT, FLOOR_Y, dest.z * UNIT);
      }
    }
    for (const [id, p] of plants) {
      if (!ids.has(id)) {
        p.group.visible = false;
        p.ring.visible = false;
        p.labelEl.style.display = "none";
        p.chipEl.style.display = "none";
      }
    }
    applySelection();
    requestRender();
  }

  /** Move one pot immediately (used during a drag). No animation, no record. */
  function setPlantPositionLive(id, pos) {
    const p = plants.get(id);
    if (!p) return;
    p.from = null;
    p.to = pos;
    p.group.position.set(pos.x * UNIT, FLOOR_Y, pos.z * UNIT);
    requestRender();
  }
  function showGhost(pos, ok) {
    ghost.visible = true;
    ghost.position.set(pos.x * UNIT, FLOOR_Y + 0.06, pos.z * UNIT);
    ghost.material.color.setHex(ok ? COLORS.ghost : 0xe5726b);
    requestRender();
  }
  function hideGhost() {
    ghost.visible = false;
    requestRender();
  }
  function applySelection() {
    for (const [id, p] of plants) {
      const sel = id === selectedId && p.group.visible;
      p.ring.visible = sel;
      p.labelEl.classList.toggle("is-selected", sel);
      p.chipEl.classList.toggle("is-selected", sel);
    }
  }
  function setSelected(id) {
    selectedId = id;
    applySelection();
    requestRender();
  }
  function setAnimations(on) {
    animations = !!on;
  }
  let cameraLockedFlag = false;
  /** Lock the camera: cancel any in-flight camera animation and freeze orbit damping. */
  function setCameraLocked(on) {
    cameraLockedFlag = !!on;
    if (cameraLockedFlag) {
      // Rotate followed immediately by Edit: stop where we are, do not glide to the target.
      camAnim = null;
      controls.enabled = false;
    } else {
      controls.enabled = !drag;
    }
    requestRender();
  }

  // ---- hardware fading: whatever is camera-side fades, in every orientation ----------------
  /** Eases hardware opacity toward its target; returns true while any piece is still fading. */
  function updateHardware(dtMs) {
    if (hardware.size === 0) return false;
    let fading = false;
    const target = hardwareOpacity(currentSpherical().azimuthDeg);
    for (const key of HARDWARE_KEYS) {
      const mesh = hardware.get(key);
      if (!mesh) continue;
      const want = target[key];
      const m = mesh.material;
      m.opacity = fadeStep(m.opacity, want, dtMs); // short ease so rotation does not pop
      if (m.opacity !== want) fading = true;
      const ink = mesh.children[0];
      if (ink?.material) {
        ink.material.transparent = true;
        ink.material.opacity = m.opacity;
        ink.visible = m.opacity > 0.9;
      }
    }
    return fading;
  }

  // ---- labels: project anchors, let the pure rule place them, draw leaders ----------------
  const tmpV = new THREE.Vector3();
  function project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h, behind: tmpV.z > 1 };
  }
  // Which pots are covered by another plant from the current camera: a tap at the pot's
  // screen position would pick someone else. Re-checked at most every 300 ms (raycasts).
  let occlusionAt = 0;
  const occlusionV = new THREE.Vector3();
  function refreshOcclusion(now, force) {
    if (!force && now - occlusionAt < 300) return;
    occlusionAt = now;
    for (const [id, p] of plants) {
      if (!p.group.visible) continue;
      const g = p.group.position;
      occlusionV.set(g.x, 10, g.z).project(camera);
      pointer.set(occlusionV.x, occlusionV.y);
      p.occluded = pickAtPointer() !== id;
    }
  }

  function updateLabels(settled) {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    // While moving, occlusion is re-checked at most every 300 ms; on the frame where everything
    // settles it is always re-checked, so the resting layout never uses a stale answer.
    refreshOcclusion(performance.now(), settled);
    const items = [];
    for (const [id, p] of plants) {
      if (!p.group.visible) continue;
      const g = p.group.position;
      const a = project(g.x, p.labelAnchorY, g.z);
      const b = project(g.x, POT_H + 0.2, g.z); // pot rim: where a leader should point
      const t = project(g.x, 10, g.z); // pot body: where a tap lands (same point as screenPositionOf)
      if (a.behind) {
        p.labelEl.style.display = "none";
        p.chipEl.style.display = "none";
        continue;
      }
      if (!p.labelSize) {
        p.labelEl.style.display = "";
        p.labelSize = { w: p.labelEl.offsetWidth, h: p.labelEl.offsetHeight };
      }
      if (!p.chipSize) {
        p.chipEl.style.display = "";
        p.chipSize = { w: p.chipEl.offsetWidth, h: p.chipEl.offsetHeight };
      }
      items.push({
        id,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        tx: t.x,
        ty: t.y,
        w: p.labelSize.w,
        h: p.labelSize.h,
        cw: p.chipSize.w,
        ch: p.chipSize.h,
        occluded: !!p.occluded,
      });
    }
    // Overlays are measured every frame: a banner can re-wrap after the app rendered it.
    const hostRect = host.getBoundingClientRect();
    const avoid = [];
    for (const a of [...labelAvoid, hardware.get("door-label-el")]) {
      if (a && typeof a.getBoundingClientRect === "function") {
        if (a.hidden) continue;
        const r = a.getBoundingClientRect();
        if (r.width > 0 && r.height > 0)
          avoid.push({
            x: r.left - hostRect.left,
            y: r.top - hostRect.top,
            w: r.width,
            h: r.height,
          });
      } else if (a && Number.isFinite(a.w)) avoid.push(a);
    }
    const placed = layoutLabels(items, {
      width: w,
      height: h,
      inset: LABEL_EDGE_INSET,
      avoid,
      selectedId,
    });
    while (leaderSvg.firstChild) leaderSvg.removeChild(leaderSvg.firstChild);
    for (const l of placed) {
      const p = plants.get(l.id);
      const el = l.compact ? p.chipEl : p.labelEl;
      p.labelEl.style.display = !l.hidden && !l.compact ? "" : "none";
      p.chipEl.style.display = !l.hidden && l.compact ? "" : "none";
      if (l.hidden) continue;
      el.style.transform = `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px) rotate(-1.2deg)`;
      if (l.leader) {
        // A leader points at the pot rim, never the canopy top, so a small plant beside a
        // tall neighbour cannot be mistaken for the tall one.
        const sel = l.id === selectedId;
        // Endpoints come from the layout rule: clipped at this card's own border and routed so
        // the line never crosses another card or the Door card.
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", l.lx1.toFixed(1));
        line.setAttribute("y1", l.ly1.toFixed(1));
        line.setAttribute("x2", l.lx2.toFixed(1));
        line.setAttribute("y2", l.ly2.toFixed(1));
        line.setAttribute("data-for", l.id);
        if (sel) line.setAttribute("class", "is-selected");
        leaderSvg.appendChild(line);
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", l.bx.toFixed(1));
        dot.setAttribute("cy", l.by.toFixed(1));
        dot.setAttribute("r", sel ? "4" : "3");
        if (sel) dot.setAttribute("class", "is-selected");
        leaderSvg.appendChild(dot);
      }
    }
  }

  // ---- render loop --------------------------------------------------------------------
  function frame() {
    raf = 0;
    inFrame = true;
    syncSize();
    const now = performance.now();
    const dt = lastFrameAt ? now - lastFrameAt : 1000 / 60;
    lastFrameAt = now;
    if (camAnim) {
      const k = easeInOut(Math.min(1, (now - camAnim.t0) / camAnim.ms));
      camera.position.lerpVectors(camAnim.from, camAnim.to, k);
      if (k >= 1) camAnim = null;
    }
    for (const p of plants.values()) {
      if (p.from && p.to) {
        const k = easeInOut(Math.min(1, (now - p.t0) / TRANSITION_MS));
        const x = p.from.x + (p.to.x - p.from.x) * k;
        const z = p.from.z + (p.to.z - p.from.z) * k;
        p.group.position.set(x * UNIT, FLOOR_Y, z * UNIT);
        if (k >= 1) p.from = null;
      }
      if (p.plantMesh && p.scaleT0) {
        const k = easeInOut(Math.min(1, (now - p.scaleT0) / TRANSITION_MS));
        const s = p.scaleFrom + (p.scaleTo - p.scaleFrom) * k;
        p.plantMesh.scale.setScalar(s);
        if (k >= 1) p.scaleT0 = 0;
      }
    }
    let tweensActive = !!camAnim;
    for (const p of plants.values()) if (p.from || p.scaleT0) tweensActive = true;
    // While locked, skip controls.update() so orbit damping cannot drift the camera.
    const controlsChanged = !cameraLockedFlag && controls.update() === true;
    const fadeActive = updateHardware(dt);
    const { keepGoing } = decideFrame({ controlsChanged, tweensActive, fadeActive });
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    updateLabels(!keepGoing);
    lastRenderedTick = now;
    inFrame = false;
    if (keepGoing) raf = requestAnimationFrame(frame);
    else lastFrameAt = 0;
  }
  requestRender();

  return {
    setView,
    setSelected,
    setAnimations,
    setCameraLocked,
    setPlantPositionLive,
    showGhost,
    hideGhost,
    resetView: () => {
      if (cameraLockedFlag) return;
      userMovedCamera = false;
      setCamera(DEFAULT_CAM, true);
    },
    rotateBy(deg) {
      if (cameraLockedFlag) return;
      userMovedCamera = true;
      const s = currentSpherical();
      setCamera({ ...s, azimuthDeg: s.azimuthDeg + deg }, true);
    },
    /** Overlay elements (or host-px rects) labels must keep clear of: banner, edit hint. */
    setLabelAvoid(items) {
      labelAvoid = Array.isArray(items) ? items : [];
      requestRender();
    },
    /** Screen position (host px) of a plant's pot — for tests and keyboard focus aids. */
    screenPositionOf(id) {
      syncSize();
      const p = plants.get(id);
      if (!p || !p.group.visible) return null;
      const g = p.group.position;
      const s = project(g.x, 10, g.z);
      return { x: s.x, y: s.y };
    },
    inspectPoint,
    isDragging: () => !!drag,
    isCameraAnimating: () => !!camAnim,
    lastRenderedTick: () => lastRenderedTick,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.innerHTML = "";
    },
  };
}

// ---- geometry builders ------------------------------------------------------------------

function buildTent(scene, hardware, tent) {
  const w = tent.widthIn * UNIT;
  const d = tent.depthIn * UNIT;
  scene.background = new THREE.Color(COLORS.sky);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toon(COLORS.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, FLOOR_Y, d / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Rectangular snap grid (GridHelper is square and would spill past a 2×4 floor).
  const pts = [];
  const step = tent.snapIn * UNIT;
  for (let x = 0; x <= w + 1e-6; x += step) pts.push(x, 0, 0, x, 0, d);
  for (let z = 0; z <= d + 1e-6; z += step) pts.push(0, 0, z, w, 0, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: COLORS.grid, transparent: true, opacity: 0.3 }),
  );
  grid.position.y = FLOOR_Y + 0.02;
  scene.add(grid);

  const wallMat = toon(COLORS.wall, { side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, WALL_H), wallMat);
  back.position.set(w / 2, WALL_H / 2, 0);
  scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, WALL_H), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(0, WALL_H / 2, d / 2);
  scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, WALL_H), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(w, WALL_H / 2, d / 2);
  scene.add(right);

  // slim frame poles and rails. Each piece carries its own material so the camera-side set
  // can fade (hardwareVisibilityRules); which set that is changes with every rotation.
  const hwMesh = (geometry) => {
    const mesh = new THREE.Mesh(geometry, toon(COLORS.frame, { transparent: true, opacity: 1 }));
    outlined(mesh, 0.06);
    mesh.children[0].material.transparent = true;
    return mesh;
  };
  for (const [key, x, z] of [
    ["pole:x0:z0", 0, 0],
    ["pole:xW:z0", w, 0],
    ["pole:x0:zD", 0, d],
    ["pole:xW:zD", w, d],
  ]) {
    const pole = hwMesh(new THREE.CylinderGeometry(0.65, 0.65, WALL_H + 6, 10));
    pole.position.set(x, (WALL_H + 6) / 2, z);
    scene.add(pole);
    hardware.set(key, pole);
  }
  for (const [key, z] of [
    ["rail:z0", 0],
    ["rail:zD", d],
  ]) {
    const rail = hwMesh(new THREE.BoxGeometry(w, 1.0, 1.0));
    rail.position.set(w / 2, WALL_H + 5.2, z);
    scene.add(rail);
    hardware.set(key, rail);
  }
  for (const [key, x] of [
    ["rail:x0", 0],
    ["rail:xW", w],
  ]) {
    const rail = hwMesh(new THREE.BoxGeometry(1.0, 1.0, d));
    rail.position.set(x, WALL_H + 5.2, d / 2);
    scene.add(rail);
    hardware.set(key, rail);
  }
  // overhead light bar: always translucent (hardwareVisibilityRules "bar"); no glow plane,
  // which read as a solid slab over the back row from every orientation
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.7, 1.0, 6),
    toon(COLORS.lamp, { transparent: true, opacity: 0.3 }),
  );
  bar.position.set(w / 2, WALL_H + 4.2, d / 2);
  scene.add(bar);
  hardware.set("bar", bar);

  // door mat at the front edge with an upright label
  const doorStrip = outlined(
    new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, 2.4), toon(COLORS.door)),
    0.06,
  );
  doorStrip.position.set(w / 2, FLOOR_Y + 0.4, d + 1.2);
  scene.add(doorStrip);
  const doorEl = document.createElement("div");
  doorEl.className = "door-label";
  doorEl.textContent = "Door (front)";
  const doorLabel = new CSS2DObject(doorEl);
  hardware.set("door-label-el", doorEl);
  doorLabel.position.set(w / 2, 2, d + 4);
  scene.add(doorLabel);
}

function buildLights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0xb8a888, 1.05));
  const key = new THREE.DirectionalLight(0xfff0c8, 1.35);
  key.position.set(20, 60, 34);
  key.target.position.set(24, 0, 24);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 2;
  key.shadow.bias = -0.0006;
  const sc = key.shadow.camera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 40;
  sc.bottom = -40;
  sc.near = 5;
  sc.far = 140;
  scene.add(key);
  scene.add(key.target);
}

function buildPot(tent) {
  return buildStorybookPot(tent.potRadiusIn, POT_H);
}

function buildGhost(tent) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(tent.potRadiusIn - 0.6, tent.potRadiusIn + 0.6, 40),
    new THREE.MeshBasicMaterial({
      color: COLORS.ghost,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Storybook plant for a visual record; deterministic per plant id. */
function buildPlant(v, id) {
  return buildStorybookPlant(v, seedFor(id));
}

function disposeDeep(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
