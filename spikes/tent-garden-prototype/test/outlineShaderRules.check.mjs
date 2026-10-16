import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OUTLINE_WIDTH,
  DEFAULT_OUTLINE_SEED,
  outlineShaderPatch,
} from "../src/rules/outlineShaderRules.js";

/** Apply a patch to a stand-in vertex shader, the way onBeforeCompile does. */
function patched(width, seed) {
  const base = "#include <common>\nvoid main() {\n#include <begin_vertex>\n}";
  let src = base;
  for (const [search, replacement] of outlineShaderPatch(width, seed).replacements) {
    src = src.replace(search, replacement);
  }
  return src;
}

test("GLSL text is identical for different widths and seeds, so every ink material shares one program", () => {
  assert.equal(patched(0.05, 0.5), patched(0.06, 0.5));
  assert.equal(patched(0.03, 0.1), patched(0.045, 0.9));
  const glsl = patched(0.06, 0.5);
  assert.doesNotMatch(glsl, /0\.0600|0\.06\b/, "width must not be baked into shader text");
  assert.match(glsl, /uniform float uOutlineWidth;/);
  assert.match(glsl, /normal \* uOutlineWidth/);
});

test("uniform values carry each material's own width and seed", () => {
  const a = outlineShaderPatch(0.04, 0.2).uniforms;
  const b = outlineShaderPatch(0.06, 0.7).uniforms;
  assert.equal(a.uOutlineWidth.value, 0.04);
  assert.equal(b.uOutlineWidth.value, 0.06);
  assert.equal(a.uOutlineSeed.value, 0.2);
  assert.equal(b.uOutlineSeed.value, 0.7);
  assert.notEqual(a.uOutlineWidth, b.uOutlineWidth, "each call gets its own uniform object");
});

test("jitter stays disabled: the seed term is still multiplied by 0.0", () => {
  assert.match(patched(0.05, 0.5), /1\.0 \+ 0\.0 \* fract\(/);
});

test("invalid or missing width and seed fall back to the documented defaults", () => {
  assert.equal(DEFAULT_OUTLINE_WIDTH, 0.05);
  assert.equal(DEFAULT_OUTLINE_SEED, 0.5);
  for (const bad of [null, undefined, NaN, Infinity, -0.02, 0, "0.05"]) {
    assert.equal(outlineShaderPatch(bad).uniforms.uOutlineWidth.value, DEFAULT_OUTLINE_WIDTH);
  }
  for (const bad of [null, undefined, NaN, -Infinity, "0.5"]) {
    assert.equal(outlineShaderPatch(0.05, bad).uniforms.uOutlineSeed.value, DEFAULT_OUTLINE_SEED);
  }
});

test("deterministic: the same inputs give the same patch", () => {
  assert.deepEqual(outlineShaderPatch(0.045, 0.3), outlineShaderPatch(0.045, 0.3));
  assert.equal(patched(null, null), patched(null, null));
});
