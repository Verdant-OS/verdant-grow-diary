// Pure rules for render-on-demand. No three.js, no DOM, no clock: the caller passes flags and dt.
//
// The diorama draws a frame only when something changed and keeps drawing only while something
// is still moving (a camera ease, a layout or grow-in tween, orbit damping, a hardware fade).
// Once all of that settles it stops, so an idle tent costs no GPU work.

/** The hardware fade used to close 25% of the gap per frame; that is now its 60 fps rate. */
export const FADE_PER_60FPS_FRAME = 0.25;
const FRAME_60_MS = 1000 / 60;
const SNAP = 0.01;

/**
 * Whether the loop must schedule another frame after this one.
 * @param {{ controlsChanged?: unknown, tweensActive?: unknown, fadeActive?: unknown, dirty?: unknown } | null | undefined} flags
 * @returns {{ keepGoing: boolean }}
 */
export function decideFrame(flags) {
  const f = flags ?? {};
  const on = (v) => v === true;
  return {
    keepGoing: on(f.controlsChanged) || on(f.tweensActive) || on(f.fadeActive) || on(f.dirty),
  };
}

/**
 * One time-based step of an exponential ease toward `target`, equal to the old fixed 0.25 step
 * at 60 fps and independent of frame rate. Snaps onto the target within 0.01.
 * dt that is not a positive finite number leaves `current` unchanged.
 * @param {number} current
 * @param {number} target
 * @param {number} dtMs
 */
export function fadeStep(current, target, dtMs) {
  if (!Number.isFinite(target)) return current;
  if (!Number.isFinite(current)) return target;
  if (!(typeof dtMs === "number" && Number.isFinite(dtMs) && dtMs > 0)) return current;
  const k = 1 - Math.pow(1 - FADE_PER_60FPS_FRAME, dtMs / FRAME_60_MS);
  const next = current + (target - current) * Math.min(1, k);
  return Math.abs(next - target) < SNAP ? target : next;
}
