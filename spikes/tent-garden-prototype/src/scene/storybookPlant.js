// Storybook plant artwork (style B, direction approved 2026-10-16). Pure geometry builders: given the
// silhouette parameters from plantVisualRules and a seed, return Three.js groups. No scene
// state, no clock, no Math.random — the same inputs always draw the same plant.
//
// These shapes describe *recorded stage and week*. They are not a measurement of size,
// health or yield, and they must never be read as one.

import * as THREE from "three";
import { outlineShaderPatch } from "../rules/outlineShaderRules.js";

export const STORYBOOK = Object.freeze({
  paper: 0xf3e7cf,
  ground: 0xd9bb8c,
  grid: 0xb89a6a,
  wall: 0xa9c3a6,
  frame: 0x4e4034,
  lamp: 0x6b7a85,
  pot: 0xd3804f,
  potRim: 0xe39a66,
  soil: 0x5c3b26,
  stem: 0x6f9a4a,
  stemDark: 0x5c8440,
  seedling: 0xb9d98a,
  veg: 0x7cb45a,
  flower: 0x6aa353,
  sugar: 0x8fbe68,
  calyx: 0xc3d96c, // soft lime, fictional artwork — not a maturity or health claim
  calyxDeep: 0xa3bf58,
  pistil: 0xe0893a, // warm amber hair
  pistilTip: 0xf6c98a, // lighter hair tip
  neutral: 0xb7bbab,
  neutralStem: 0x9aa49c,
  ink: 0x3f3327,
  door: 0xffd23f,
});

/** Two-step gradient: the hand-drawn look shades in one shadow band. */
const GRADIENT = (() => {
  const data = new Uint8Array([128, 128, 128, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...extra });
}

export const OUTLINE = 0.05; // world units (inches); clean line, no jitter

/**
 * Ink outline: a back-face shell pushed out along vertex normals, with a little per-vertex
 * jitter so the line reads as drawn, not computed. Works on tubes and lathes where a uniform
 * scale would drift off-centre.
 */
export function outlined(mesh, width = OUTLINE, seed = 0.5) {
  const ink = new THREE.MeshBasicMaterial({ color: STORYBOOK.ink, side: THREE.BackSide });
  const patch = outlineShaderPatch(width, seed);
  ink.onBeforeCompile = (s) => {
    for (const [search, replacement] of patch.replacements) {
      s.vertexShader = s.vertexShader.replace(search, replacement);
    }
    Object.assign(s.uniforms, patch.uniforms);
  };
  const shell = new THREE.Mesh(mesh.geometry, ink);
  shell.renderOrder = -1;
  mesh.add(shell);
  return mesh;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic seed from a plant id so each plant keeps its own leaf angles. */
export function seedFor(id) {
  let h = 7;
  for (const c of String(id ?? "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- leaves ---------------------------------------------------------------------------------

/** One lanceolate leaflet: light serration, soft tip, gentle droop, shallow V-fold. */
function leafletGeo(len, maxW, teeth, rand) {
  const N = 18;
  const right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // blunter tip: the width curve is raised to <1 so it stays wide longer and rounds off
    let w =
      Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.8) * maxW * (1 - 0.1 * Math.pow(t, 8));
    if (i % 2 === 1 && t > 0.15 && t < 0.88) w *= 1 - teeth;
    right.push(new THREE.Vector2(w, t * len));
  }
  const left = right
    .slice(1, -1)
    .reverse()
    .map((p) => new THREE.Vector2(-p.x, p.y));
  const shape = new THREE.Shape([...right, ...left]);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 3,
  });
  g.rotateX(Math.PI / 2); // length along +z
  const pos = g.attributes.position;
  const bow = 0.1 + rand() * 0.06;
  const droop = 0.1 + rand() * 0.08;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const x = pos.getX(i);
    const t = Math.max(0, Math.min(1, z / len));
    const arch = bow * len * Math.sin(Math.PI * t) * 0.35; // gentle upward bow mid-blade
    const roll = (Math.abs(x) / Math.max(maxW, 0.01)) ** 2 * maxW * 0.45; // edges roll down
    pos.setY(i, pos.getY(i) + arch - (droop * z * z * 0.9) / len - roll);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Fingered fan leaf: 3, 5 or 7 leaflets from one point; centre leaflet is `size` long. */
function fingeredLeaf(fingers, size, color, rand, sugar = false) {
  const g = new THREE.Group();
  const m = toon(color, { side: THREE.DoubleSide });
  const spread = sugar ? 0.55 : 0.62;
  const half = (fingers - 1) / 2;
  for (let i = 0; i < fingers; i++) {
    const k = i - half;
    const len = size * (1 - ((0.28 * Math.abs(k)) / (half + 0.0001)) * 1.2);
    const w = len * (sugar ? 0.11 : 0.16);
    const lf = outlined(
      new THREE.Mesh(leafletGeo(len, w, sugar ? 0.04 : 0.06, rand), m),
      OUTLINE * 0.8,
      rand(),
    );
    lf.rotation.order = "YXZ";
    lf.rotation.y = -k * spread;
    lf.rotation.x = -0.12 - Math.abs(k) * 0.05;
    lf.rotation.z = k * 0.07; // outer fingers roll outward a touch
    lf.castShadow = false; // soft grounding shadows come from pot and stems only
    g.add(lf);
  }
  return g;
}

/** Tapered, gently bent stalk from a to b. */
function tube(a, b, r0, r1, color, bendDir, bendAmt) {
  const mid = a.clone().lerp(b, 0.5).add(bendDir.clone().multiplyScalar(bendAmt));
  const curve = new THREE.CatmullRomCurve3([a, mid, b]);
  const geo = new THREE.TubeGeometry(curve, 8, r0, 10, false);
  const pos = geo.attributes.position;
  const pts = curve.getPoints(8);
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / 11);
    const t = Math.min(seg / 8, 1);
    const c = pts[Math.min(seg, 8)];
    const v = V(pos.getX(i), pos.getY(i), pos.getZ(i))
      .sub(c)
      .multiplyScalar((r0 + (r1 - r0) * t) / r0)
      .add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const m = outlined(new THREE.Mesh(geo, toon(color)), OUTLINE * 0.9, 0.3);
  m.castShadow = false; // stems do not cast: keeps the ground shadow a soft pot blob
  return m;
}

/** Tapered hair: a short curved tube whose radius falls to a point. Never outlined. */
function hair(a, c, b, r0, material) {
  const curve = new THREE.QuadraticBezierCurve3(a, c, b);
  const geo = new THREE.TubeGeometry(curve, 5, r0, 4, false);
  const pos = geo.attributes.position;
  const pts = curve.getPoints(5);
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / 5);
    const t = Math.min(seg / 5, 1);
    const ctr = pts[Math.min(seg, 5)];
    const v = V(pos.getX(i), pos.getY(i), pos.getZ(i))
      .sub(ctr)
      .multiplyScalar(1 - 0.85 * t)
      .add(ctr);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/** Flower cluster: stacked calyx bumps in two greens, orange pistils, one sugar leaf. */
function flowerCluster(len, girth, rand) {
  const g = new THREE.Group();
  const cm = toon(STORYBOOK.calyx);
  const dm = toon(STORYBOOK.calyxDeep);
  const pm = toon(STORYBOOK.pistil);
  const n = Math.round(len * 1.8) + 3;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = t * len;
    const r = girth * (0.55 + 0.5 * Math.sin(Math.PI * Math.min(t * 1.15, 1))) * (1 - 0.25 * t);
    const k = 3 + (i % 2);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + i * 0.9;
      const b = outlined(
        new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), (i + j) % 3 === 0 ? dm : cm),
        OUTLINE * 0.6,
        rand(),
      );
      b.scale.y = 1.25;
      b.position.set(Math.cos(a) * r * 0.6, y, Math.sin(a) * r * 0.6);
      b.castShadow = true;
      g.add(b);
      if (rand() < 0.3) {
        // sparse, thin, gently curved, tapered amber hair — no outline, no bead
        const base = V(Math.cos(a) * r * 0.95, y + r * 0.3, Math.sin(a) * r * 0.95);
        const out = V(Math.cos(a), 0.55 + rand() * 0.3, Math.sin(a)).normalize();
        const hl = r * 1.25;
        const tipPt = base.clone().add(out.clone().multiplyScalar(hl));
        tipPt.y -= hl * 0.22; // droops a touch at the end
        const ctrl = base.clone().add(out.clone().multiplyScalar(hl * 0.55));
        ctrl.y += hl * 0.12;
        g.add(hair(base, ctrl, tipPt, 0.075, pm));
      }
    }
  }
  const top = outlined(
    new THREE.Mesh(new THREE.SphereGeometry(girth * 0.4, 8, 6), cm),
    OUTLINE * 0.6,
    0.1,
  );
  top.scale.y = 1.4;
  top.position.y = len + girth * 0.3;
  g.add(top);
  const sl = fingeredLeaf(3, len * 0.55, STORYBOOK.sugar, rand, true);
  sl.position.y = len * 0.25;
  sl.rotation.y = rand() * 6.28;
  sl.rotation.x = -0.5;
  g.add(sl);
  return g;
}

// ---- pot ------------------------------------------------------------------------------------

/** Rounded, slightly chunky terracotta pot with a soft rim. */
export function buildStorybookPot(radius, potH) {
  const g = new THREE.Group();
  const prof = [
    [0.7, 0],
    [0.8, 0.6],
    [0.9, potH * 0.3],
    [0.97, potH * 0.62],
    [1, potH * 0.86],
    [0.99, potH],
  ].map(([a, b]) => new THREE.Vector2(a * radius, b));
  const body = outlined(
    new THREE.Mesh(new THREE.LatheGeometry(prof, 36), toon(STORYBOOK.pot)),
    OUTLINE,
    0.2,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const rim = outlined(
    new THREE.Mesh(new THREE.TorusGeometry(radius * 0.97, 1.05, 14, 40), toon(STORYBOOK.potRim)),
    OUTLINE,
    0.4,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = potH;
  g.add(rim);
  const soil = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.88, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    toon(STORYBOOK.soil),
  );
  soil.scale.y = 0.16;
  soil.position.y = potH - 0.2;
  g.add(soil);
  return g;
}

// ---- plant ----------------------------------------------------------------------------------

/**
 * Build the plant for a visual record from plantVisualRules.
 * @param {{stage:string, heightIn:number, canopyRadiusIn:number, leafTiers:number, clusterCount:number, clusterScale:number, neutral:boolean}} v
 * @param {number} seed deterministic per plant (see seedFor)
 */
export function buildStorybookPlant(v, seed = 7) {
  const rand = rng(seed);
  const P = new THREE.Group();
  const neutral = !!v.neutral;
  const stemColor = neutral ? STORYBOOK.neutralStem : STORYBOOK.stem;
  const stalkColor = neutral ? STORYBOOK.neutralStem : STORYBOOK.stemDark;

  const leafAt = (pos, yaw, pitch, fingers, size, color, petiole) => {
    const dir = V(Math.cos(yaw), Math.sin(pitch), Math.sin(yaw)).normalize();
    const end = pos.clone().add(dir.clone().multiplyScalar(petiole));
    P.add(tube(pos, end, 0.13, 0.1, stalkColor, V(0, 1, 0), petiole * 0.12));
    const lf = fingeredLeaf(fingers, size, color, rand);
    lf.position.copy(end);
    lf.rotation.order = "YXZ";
    lf.rotation.y = Math.PI / 2 - yaw;
    lf.rotation.x = -pitch - 0.15 + (rand() - 0.5) * 0.5; // vary pitch per leaf
    lf.rotation.z = (rand() - 0.5) * 0.4; // and roll, so blades are not one flat shelf
    P.add(lf);
  };

  if (v.stage === "seedling") {
    const h = Math.max(3, v.heightIn);
    const c = STORYBOOK.seedling;
    P.add(tube(V(0, 0, 0), V(0.15, h, 0), 0.24, 0.17, stemColor, V(1, 0, 0), 0.1));
    for (const s of [-1, 1]) {
      const geo = new THREE.SphereGeometry(1, 10, 8);
      geo.scale(1.15, 0.16, 0.7);
      const cot = outlined(new THREE.Mesh(geo, toon(c)), OUTLINE * 0.7, 0.5);
      cot.position.set(s * 1.35, h * 0.5, 0.1);
      cot.rotation.z = -s * 0.35;
      P.add(cot);
    }
    const k = v.canopyRadiusIn / 2.5;
    leafAt(V(0.1, h * 0.95, 0), Math.PI * 0.5 + 0.25, 0.35, 3, 3.3 * k, c, 1.1 * k);
    leafAt(V(0.1, h * 0.95, 0), Math.PI * 1.5 + 0.25, 0.35, 3, 3.3 * k, c, 1.1 * k);
    leafAt(V(0.15, h + 0.2, 0), Math.PI * 0.05, 0.9, 3, 1.2 * k, c, 0.3);
    leafAt(V(0.15, h + 0.2, 0), Math.PI * 1.05, 0.9, 3, 1.2 * k, c, 0.3);
    return P;
  }

  const flowering = v.stage === "flower" && v.clusterCount > 0;
  // Artwork proportion only: flowering draws 10% taller than its rule height. The rule value is a
  // constant per stage (20 in), so this does not grow with later recorded weeks.
  const h = v.heightIn * (flowering ? 1.1 : 1);
  const leafColor = neutral ? STORYBOOK.neutral : flowering ? STORYBOOK.flower : STORYBOOK.veg;
  const nodes = neutral ? 2 : Math.max(2, Math.min(v.leafTiers, 5));
  const reach = v.canopyRadiusIn * 0.68; // branch length scale
  const sway = V(0.9, 0, 0.3);
  const topPt = V(0.5, h, 0.2);
  P.add(tube(V(0, 0, 0), topPt, Math.min(0.55, 0.3 + h * 0.015), 0.3, stemColor, sway, h * 0.06));
  const stemAt = (t) =>
    V(0, 0, 0)
      .lerp(topPt, t)
      .add(sway.clone().multiplyScalar(h * 0.06 * 2 * t * (1 - t)));

  const tips = [];
  const first = 0.22;
  const step = (0.9 - first) / nodes;
  for (let i = 0; i < nodes; i++) {
    const base = stemAt(first + i * step);
    const yaw0 = i * (Math.PI / 2) * 1.1 + rand() * 0.3;
    for (const s of [0, 1]) {
      const yaw = yaw0 + s * Math.PI + (rand() - 0.5) * 0.4;
      const len = reach * (1 - (0.42 * i) / nodes) * (0.9 + rand() * 0.2);
      const pitch = 0.55 + 0.25 * (i / nodes) + rand() * 0.15;
      const dir = V(
        Math.cos(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.sin(yaw) * Math.cos(pitch),
      );
      const tip = base.clone().add(dir.multiplyScalar(len));
      P.add(tube(base, tip, 0.3, 0.16, stemColor, V(0, 1, 0), -len * 0.14));
      tips.push({ tip, yaw, i });
      // one mid-branch leaf per node, alternating sides, so the canopy stays open
      // (flowering keeps both so the branches under the clusters do not read as bare)
      if (!flowering && s !== i % 2) continue;
      const mid = base.clone().lerp(tip, 0.55);
      mid.y -= len * 0.14 * 0.6;
      leafAt(
        mid,
        yaw + (s ? -0.9 : 0.9),
        0.15,
        neutral ? 3 : 5,
        reach * 0.72 * (1 - (0.2 * i) / nodes),
        leafColor,
        1.4,
      );
    }
  }

  const clusterTips = flowering ? Math.min(v.clusterCount, tips.length) : 0;
  tips.forEach(({ tip, yaw, i }, idx) => {
    if (flowering && idx < clusterTips) {
      const fill = v.clusterScale;
      const cl = flowerCluster(
        (2.6 * (1 - (0.25 * i) / nodes) + 0.8) * (0.6 + 0.4 * fill),
        0.8 * (0.7 + 0.3 * fill),
        rand,
      );
      cl.position.copy(tip);
      cl.rotation.y = yaw;
      cl.rotation.z = (rand() - 0.5) * 0.2;
      P.add(cl);
      leafAt(tip.clone().add(V(0, -0.6, 0)), yaw + 1.2, -0.1, 5, reach * 0.5, leafColor, 0.9);
    } else {
      leafAt(
        tip,
        yaw,
        0.25,
        neutral ? 3 : i < 2 ? 7 : 5,
        reach * 0.82 * (1 - (0.18 * i) / nodes),
        leafColor,
        1.1,
      );
      if (!neutral && i === nodes - 1) leafAt(tip, yaw + 1.6, 0.5, 5, reach * 0.54, leafColor, 0.7);
    }
  });

  const top = stemAt(1);
  if (flowering) {
    const cola = flowerCluster(
      4.2 * (0.6 + 0.4 * v.clusterScale),
      1.0 * (0.7 + 0.3 * v.clusterScale),
      rand,
    );
    cola.position.copy(top).add(V(0, -1.0, 0));
    P.add(cola);
    leafAt(top.clone().add(V(0, -1.2, 0)), 0.6, 0.2, 5, reach * 0.54, leafColor, 1.0);
    leafAt(top.clone().add(V(0, -1.2, 0)), 0.6 + Math.PI, 0.2, 5, reach * 0.54, leafColor, 1.0);
  } else {
    leafAt(top, 0.3, 0.55, neutral ? 3 : 5, reach * 0.63, leafColor, 0.9);
    leafAt(top, 0.3 + Math.PI, 0.55, neutral ? 3 : 5, reach * 0.63, leafColor, 0.9);
    if (!neutral) leafAt(top.clone().add(V(0, 0.6, 0)), 1.9, 1.0, 3, reach * 0.28, leafColor, 0.4);
  }

  if (neutral) {
    // unknown stage: a tag above the plant so the record reads as "not recorded"
    const tag = outlined(
      new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), toon(0xe4e9e5)),
      OUTLINE,
      0.6,
    );
    tag.position.y = h + 2.6;
    P.add(tag);
  }
  return P;
}
