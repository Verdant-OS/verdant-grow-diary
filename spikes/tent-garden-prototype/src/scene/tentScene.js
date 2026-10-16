// Three.js diorama for the Tent Garden prototype. This module owns the WebGL scene only.
// It receives a "view" (recorded layout + stage records) and emits pointer intents
// (select, drag-move, drop). It never decides whether a drop is valid — rules do.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { TENT, clampToTent } from "../rules/layoutRules.js";
import { visualForStage, labelFor } from "../rules/plantVisualRules.js";

const UNIT = 1; // 1 scene unit = 1 inch
const FLOOR_Y = 0;
const POT_H = 7;
const WALL_H = 30;
const TRANSITION_MS = 1500;

const COLORS = {
  floor: 0x1d2420,
  grid: 0x2e3b33,
  wall: 0x141a16,
  frame: 0x3a4a40,
  pot: 0x3c3431,
  potRim: 0x4a403c,
  soil: 0x2b1f17,
  stem: 0x4f7a3a,
  seedling: 0x9be08a,
  veg: 0x4caf63,
  flower: 0x3f8f52,
  cluster: 0xcfe7a8,
  pistil: 0xf0b56b,
  neutral: 0x7a8a80,
  selectRing: 0x7bd389,
  ghost: 0x7bd389,
  door: 0xf2c14e,
};

const DEFAULT_CAMERA = { azimuthDeg: -32, polarDeg: 52, distance: 135 };

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
export function createTentScene(host, handlers) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  host.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 600);
  const target = new THREE.Vector3(TENT.widthIn / 2, 6, TENT.depthIn / 2);

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

  buildTent(scene);
  buildLights(scene);

  const plants = new Map(); // id -> { group, pot, plant, labelObj, labelEl, ring, from, to, t0 }
  const ghost = buildGhost();
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
  let editable = false;
  let animations = true;
  let selectedId = null;
  let drag = null; // { id, offset:{x,z}, moved:boolean }
  let currentView = null;
  let lastRenderedTick = 0;

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Keep the fitted default until the grower moves the camera themselves.
    if (!userMovedCamera) setCamera(DEFAULT_CAMERA, false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  setCamera(DEFAULT_CAMERA, false);

  // ---- pointer handling ---------------------------------------------------------------
  function toPointer(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  }
  function pickPlant(ev) {
    toPointer(ev);
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    for (const [id, p] of plants) {
      if (!p.group.visible) continue;
      p.pickMesh.userData.plantId = id;
      meshes.push(p.pickMesh);
    }
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.plantId : null;
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
    controls.enabled = false; // orbit must not fight the drag
    renderer.domElement.setPointerCapture?.(ev.pointerId);
    handlers.onSelect(id);
    ev.preventDefault();
  });
  renderer.domElement.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const fp = floorPoint(ev);
    if (!fp) return;
    const raw = { x: fp.x + drag.offset.x, z: fp.z + drag.offset.z };
    const pos = clampToTent(raw);
    drag.moved = true;
    handlers.onDragMove(drag.id, pos);
  });
  function endDrag(ev) {
    if (!drag) return;
    const d = drag;
    drag = null;
    controls.enabled = true;
    ghost.visible = false;
    if (!d.moved) return;
    const fp = ev ? floorPoint(ev) : null;
    const raw = fp ? { x: fp.x + d.offset.x, z: fp.z + d.offset.z } : currentView.layout[d.id];
    handlers.onDrop(d.id, clampToTent(raw));
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
    if (distance === DEFAULT_CAMERA.distance) distance = fittedDistance(distance);
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
      return;
    }
    camAnim = { from: camera.position.clone(), to: dest, t0: performance.now(), ms: 600 };
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
    const pot = buildPot();
    group.add(pot);
    const pickMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(TENT.potRadiusIn + 1.5, TENT.potRadiusIn + 1.5, 26, 10),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    pickMesh.position.y = 13;
    group.add(pickMesh);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(TENT.potRadiusIn + 0.8, TENT.potRadiusIn + 2.2, 40),
      new THREE.MeshBasicMaterial({
        color: COLORS.selectRing,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = FLOOR_Y + 0.05;
    ring.visible = false;
    group.add(ring);
    const labelEl = document.createElement("div");
    labelEl.className = "plant-label";
    const labelObj = new CSS2DObject(labelEl);
    labelObj.position.set(0, POT_H + 2, 0);
    group.add(labelObj);
    scene.add(group);
    p = {
      group,
      pot,
      pickMesh,
      ring,
      labelEl,
      labelObj,
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
      p.plantMesh = buildPlant(v);
      p.plantMesh.position.y = POT_H - 0.5;
      p.group.add(p.plantMesh);
      p.visualKey = key;
      p.labelObj.position.y = POT_H + v.heightIn * 0.55 + 2;
      // brief grow-in on first build when animations are on
      if (animations) {
        p.scaleFrom = 0.6;
        p.scaleTo = 1;
        p.scaleT0 = performance.now();
      }
    }
    p.labelEl.innerHTML = `${escapeHtml(labelFor(plantRecord))}<small>${escapeHtml(v.label)}</small>`;
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
      }
    }
    applySelection();
  }

  /** Move one pot immediately (used during a drag). No animation, no record. */
  function setPlantPositionLive(id, pos) {
    const p = plants.get(id);
    if (!p) return;
    p.from = null;
    p.to = pos;
    p.group.position.set(pos.x * UNIT, FLOOR_Y, pos.z * UNIT);
  }
  function showGhost(pos, ok) {
    ghost.visible = true;
    ghost.position.set(pos.x * UNIT, FLOOR_Y + 0.06, pos.z * UNIT);
    ghost.material.color.setHex(ok ? COLORS.ghost : 0xe5726b);
  }
  function hideGhost() {
    ghost.visible = false;
  }
  function applySelection() {
    for (const [id, p] of plants) {
      const sel = id === selectedId && p.group.visible;
      p.ring.visible = sel;
      p.labelEl.classList.toggle("is-selected", sel);
    }
  }
  function setSelected(id) {
    selectedId = id;
    applySelection();
  }
  function setAnimations(on) {
    animations = !!on;
  }

  // ---- render loop --------------------------------------------------------------------
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
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
      if (p.ring.visible) {
        const pulse = animations ? 0.75 + 0.15 * Math.sin(now / 350) : 0.85;
        p.ring.material.opacity = pulse;
      }
    }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    lastRenderedTick = now;
  }
  frame();

  return {
    setView,
    setSelected,
    setAnimations,
    setPlantPositionLive,
    showGhost,
    hideGhost,
    resetView: () => {
      userMovedCamera = false;
      setCamera(DEFAULT_CAMERA, true);
    },
    rotateBy(deg) {
      userMovedCamera = true;
      const s = currentSpherical();
      setCamera({ ...s, azimuthDeg: s.azimuthDeg + deg }, true);
    },
    isDragging: () => !!drag,
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

function buildTent(scene) {
  const w = TENT.widthIn * UNIT;
  const d = TENT.depthIn * UNIT;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, FLOOR_Y, d / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(w, TENT.widthIn / TENT.snapIn, COLORS.grid, COLORS.grid);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.set(w / 2, FLOOR_Y + 0.02, d / 2);
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    roughness: 1,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
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

  // frame poles and a light bar so the box reads as a tent, cut away at the front (door)
  const poleMat = new THREE.MeshStandardMaterial({
    color: COLORS.frame,
    metalness: 0.4,
    roughness: 0.6,
  });
  for (const [x, z] of [
    [0, 0],
    [w, 0],
    [0, d],
    [w, d],
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, WALL_H + 6, 8), poleMat);
    pole.position.set(x, (WALL_H + 6) / 2, z);
    scene.add(pole);
  }
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.8, 1.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a2f2c, metalness: 0.5, roughness: 0.5 }),
  );
  bar.position.set(w / 2, WALL_H + 5, d / 2);
  scene.add(bar);
  const barGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.78, 9),
    new THREE.MeshBasicMaterial({ color: 0xfff1d0 }),
  );
  barGlow.rotation.x = Math.PI / 2;
  barGlow.position.set(w / 2, WALL_H + 4.3, d / 2);
  scene.add(barGlow);

  // door strip at the front edge with an upright label
  const doorStrip = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.4, 1.2),
    new THREE.MeshBasicMaterial({ color: COLORS.door }),
  );
  doorStrip.position.set(w / 2, FLOOR_Y + 0.2, d + 0.6);
  scene.add(doorStrip);
  const doorEl = document.createElement("div");
  doorEl.className = "door-label";
  doorEl.textContent = "Door (front)";
  const doorLabel = new CSS2DObject(doorEl);
  doorLabel.position.set(w / 2, 2, d + 3);
  scene.add(doorLabel);
}

function buildLights(scene) {
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x1a2a1f, 0.9));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
  key.position.set(24, 60, 30);
  key.target.position.set(24, 0, 24);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  const sc = key.shadow.camera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 40;
  sc.bottom = -40;
  sc.near = 5;
  sc.far = 140;
  scene.add(key);
  scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xcfe3ff, 0.35);
  fill.position.set(-30, 30, -10);
  scene.add(fill);
}

function buildPot() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(TENT.potRadiusIn, TENT.potRadiusIn - 1, POT_H, 28),
    new THREE.MeshStandardMaterial({ color: COLORS.pot, roughness: 0.95 }),
  );
  body.position.y = POT_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(TENT.potRadiusIn - 0.1, 0.35, 8, 36),
    new THREE.MeshStandardMaterial({ color: COLORS.potRim, roughness: 0.9 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = POT_H;
  g.add(rim);
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(TENT.potRadiusIn - 0.5, 28),
    new THREE.MeshStandardMaterial({ color: COLORS.soil, roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = POT_H - 0.4;
  g.add(soil);
  return g;
}

function buildGhost() {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(TENT.potRadiusIn - 0.6, TENT.potRadiusIn + 0.6, 40),
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

/**
 * Stylised plant from visual parameters. One consistent design: a stem, leaf whorls whose
 * count/size follow recorded stage, and flower clusters that fill in by recorded week.
 */
function buildPlant(v) {
  const g = new THREE.Group();
  const leafColor = v.neutral ? COLORS.neutral : COLORS[v.colorKey];
  const stemMat = new THREE.MeshStandardMaterial({
    color: v.neutral ? 0x6b7a72 : COLORS.stem,
    roughness: 0.9,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: leafColor,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, v.heightIn, 8), stemMat);
  stem.position.y = v.heightIn / 2;
  stem.castShadow = true;
  g.add(stem);

  const leafGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let tier = 0; tier < v.leafTiers; tier++) {
    const frac = (tier + 1) / (v.leafTiers + 1);
    const y = v.heightIn * frac;
    const radius = v.canopyRadiusIn * (1 - frac * 0.45);
    const leaves = v.stage === "seedling" ? 2 : 5;
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + tier * 0.6;
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.scale.set(radius * 0.32, 0.18, radius * 0.9);
      leaf.position.set(Math.cos(a) * radius * 0.5, y, Math.sin(a) * radius * 0.5);
      leaf.rotation.y = -a + Math.PI / 2;
      leaf.rotation.x = v.neutral ? -0.1 : -0.25;
      leaf.castShadow = true;
      g.add(leaf);
    }
  }

  if (v.clusterCount > 0) {
    const clusterMat = new THREE.MeshStandardMaterial({ color: COLORS.cluster, roughness: 0.8 });
    const pistilMat = new THREE.MeshStandardMaterial({ color: COLORS.pistil, roughness: 0.8 });
    const clusterGeo = new THREE.IcosahedronGeometry(1, 1);
    // apex cola
    const cola = new THREE.Mesh(clusterGeo, clusterMat);
    cola.scale.set(
      1.4 * v.clusterScale + 0.4,
      2.6 * v.clusterScale + 0.8,
      1.4 * v.clusterScale + 0.4,
    );
    cola.position.y = v.heightIn + cola.scale.y * 0.5;
    cola.castShadow = true;
    g.add(cola);
    // side clusters ring the upper canopy, filling in with recorded week
    for (let i = 0; i < v.clusterCount; i++) {
      const a = (i / v.clusterCount) * Math.PI * 2 + 0.3;
      const ringR = v.canopyRadiusIn * (0.35 + 0.25 * (i % 2));
      const y = v.heightIn * (0.55 + 0.35 * ((i % 3) / 2));
      const c = new THREE.Mesh(clusterGeo, i % 4 === 3 ? pistilMat : clusterMat);
      const s = 0.5 + v.clusterScale * 0.9;
      c.scale.set(s, s * 1.5, s);
      c.position.set(Math.cos(a) * ringR, y, Math.sin(a) * ringR);
      c.castShadow = true;
      g.add(c);
    }
  }

  if (v.neutral) {
    // unknown stage: a small neutral marker so the record reads as "not recorded"
    const tag = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1, 0),
      new THREE.MeshStandardMaterial({ color: 0x9aa7a0, roughness: 0.6 }),
    );
    tag.position.y = v.heightIn + 2.2;
    g.add(tag);
  }
  return g;
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
