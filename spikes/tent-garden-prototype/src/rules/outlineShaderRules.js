// Pure rule: the vertex-shader patch for the ink outline shell. No three.js import.
//
// Width and seed travel as uniforms, never as text baked into GLSL. three.js keys compiled
// programs on shader text plus onBeforeCompile.toString(), which is identical for every
// closure, so baked values made every ink material reuse the first compiled program and its
// width. With uniforms the GLSL is the same for every width, all ink materials share one
// program, and each material draws its own width.

/** Outline width in world units (inches) used when a caller passes no valid width. */
export const DEFAULT_OUTLINE_WIDTH = 0.05;
/** Jitter seed used when a caller passes no valid seed. Jitter is currently disabled. */
export const DEFAULT_OUTLINE_SEED = 0.5;

const UNIFORM_DECLARATIONS = `#include <common>
uniform float uOutlineWidth;
uniform float uOutlineSeed;`;

// The `0.0 *` keeps jitter off (clean line); re-enabling it is a separate design decision.
const VERTEX_PUSH = `#include <begin_vertex>
      float jit = 1.0 + 0.0 * fract(sin(dot(position.xy, vec2(12.9898, 78.233)) + uOutlineSeed) * 43758.5453);
      transformed += normal * uOutlineWidth * jit;`;

const REPLACEMENTS = Object.freeze([
  Object.freeze(["#include <common>", UNIFORM_DECLARATIONS]),
  Object.freeze(["#include <begin_vertex>", VERTEX_PUSH]),
]);

/**
 * Shader patch for one ink material.
 * Width must be a finite number > 0, otherwise DEFAULT_OUTLINE_WIDTH. Seed must be a finite
 * number, otherwise DEFAULT_OUTLINE_SEED.
 * @param {unknown} width
 * @param {unknown} [seed]
 * @returns {{ replacements: ReadonlyArray<readonly [string, string]>, uniforms: { uOutlineWidth: { value: number }, uOutlineSeed: { value: number } } }}
 */
export function outlineShaderPatch(width, seed) {
  const w = typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
  const s = typeof seed === "number" && Number.isFinite(seed) ? seed : null;
  return {
    replacements: REPLACEMENTS,
    uniforms: {
      uOutlineWidth: { value: w ?? DEFAULT_OUTLINE_WIDTH },
      uOutlineSeed: { value: s ?? DEFAULT_OUTLINE_SEED },
    },
  };
}
