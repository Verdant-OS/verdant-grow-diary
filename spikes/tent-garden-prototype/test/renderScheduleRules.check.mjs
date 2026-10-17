import { test } from "node:test";
import assert from "node:assert/strict";
import { decideFrame, fadeStep, FADE_PER_60FPS_FRAME } from "../src/rules/renderScheduleRules.js";

test("a settled scene with nothing pending does not schedule another frame", () => {
  assert.deepEqual(decideFrame({}), { keepGoing: false });
  assert.deepEqual(
    decideFrame({ controlsChanged: false, tweensActive: false, fadeActive: false, dirty: false }),
    { keepGoing: false },
  );
});

test("each trigger keeps the loop going for one more frame", () => {
  for (const k of ["controlsChanged", "tweensActive", "fadeActive", "dirty"]) {
    assert.deepEqual(decideFrame({ [k]: true }), { keepGoing: true }, k);
  }
});

test("null-safe: missing, null or non-boolean flags count as false", () => {
  assert.deepEqual(decideFrame(null), { keepGoing: false });
  assert.deepEqual(decideFrame(undefined), { keepGoing: false });
  assert.deepEqual(decideFrame({ dirty: null, tweensActive: 0, fadeActive: "" }), {
    keepGoing: false,
  });
});

test("fade step matches the old 0.25-per-frame ease at 60 fps", () => {
  const dt = 1000 / 60;
  assert.equal(FADE_PER_60FPS_FRAME, 0.25);
  assert.ok(Math.abs(fadeStep(1, 0, dt) - 0.75) < 1e-9);
  assert.ok(Math.abs(fadeStep(0, 1, dt) - 0.25) < 1e-9);
});

test("fade step is frame-rate independent: two 30 fps steps equal four 60 fps steps", () => {
  let a = 1;
  for (let i = 0; i < 4; i++) a = fadeStep(a, 0.22, 1000 / 60);
  let b = 1;
  for (let i = 0; i < 2; i++) b = fadeStep(b, 0.22, 1000 / 30);
  assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
});

test("fade step snaps onto the target when within 0.01", () => {
  assert.equal(fadeStep(0.225, 0.22, 1000 / 60), 0.22);
});

test("fade step boundaries: zero, negative, NaN or infinite dt leave the value unchanged; huge dt lands on target", () => {
  for (const dt of [0, -16, NaN, Infinity, undefined, null])
    assert.equal(fadeStep(0.5, 1, dt), 0.5, String(dt));
  assert.equal(fadeStep(0.5, 1, 60_000), 1);
});

test("fade step with invalid current or target is null-safe", () => {
  assert.equal(fadeStep(NaN, 0.3, 16), 0.3);
  assert.equal(fadeStep(0.4, NaN, 16), 0.4);
});

test("deterministic", () => {
  assert.equal(fadeStep(0.9, 0.22, 33), fadeStep(0.9, 0.22, 33));
  assert.deepEqual(decideFrame({ dirty: true }), decideFrame({ dirty: true }));
});
