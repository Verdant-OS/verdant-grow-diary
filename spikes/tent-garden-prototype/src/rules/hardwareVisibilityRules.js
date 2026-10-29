// Pure rule: which tent hardware sits between the camera and the plants for a given camera
// azimuth, and how transparent it should be drawn. No fixed "front pole": the set follows the
// camera through every orientation. Selection is unaffected either way — picking only
// raycasts plant pick meshes, never hardware.

export const FADED_OPACITY = 0.22;
/** The light bar hangs over the canopy centre, so it crosses the back row from every side. */
export const BAR_OPACITY = 0.3;

/** Hardware pieces keyed by position; poles at the four corners, rails along the four top edges. */
export const HARDWARE_KEYS = Object.freeze([
  "pole:x0:z0",
  "pole:xW:z0",
  "pole:x0:zD",
  "pole:xW:zD",
  "rail:z0",
  "rail:zD",
  "rail:x0",
  "rail:xW",
  "bar",
]);

// Offsets from the tent centre, in half-tent units. Three.js spherical theta: 0 = camera on +z.
const OFFSET = {
  "pole:x0:z0": [-1, -1],
  "pole:xW:z0": [1, -1],
  "pole:x0:zD": [-1, 1],
  "pole:xW:zD": [1, 1],
  "rail:z0": [0, -1],
  "rail:zD": [0, 1],
  "rail:x0": [-1, 0],
  "rail:xW": [1, 0],
  bar: [0, 0],
};

/**
 * @param {number} azimuthDeg camera azimuth (Three.js spherical theta, degrees)
 * @returns {Record<string, number>} opacity per hardware key (1 = solid)
 */
export function hardwareOpacity(azimuthDeg) {
  const az = Number.isFinite(azimuthDeg) ? (azimuthDeg * Math.PI) / 180 : 0;
  const dx = Math.sin(az);
  const dz = Math.cos(az);
  const out = {};
  for (const key of HARDWARE_KEYS) {
    const [ox, oz] = OFFSET[key];
    // Pieces on the camera's side of the tent centre are foreground and fade.
    const facing = ox * dx + oz * dz;
    out[key] = key === "bar" ? BAR_OPACITY : facing > 0.05 ? FADED_OPACITY : 1;
  }
  return out;
}
