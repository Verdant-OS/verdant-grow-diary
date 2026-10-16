import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TENT,
  snapToGrid,
  clampToTent,
  isInBounds,
  potsOverlap,
  findOccupant,
  resolveDrop,
  swapPositions,
  netChanges,
  pairSwaps,
  validateLayout,
} from "../src/rules/layoutRules.js";
import { TODAY_LAYOUT, SNAPSHOTS } from "../src/data/sampleGarden.js";

test("snapToGrid rounds to the 2-inch grid and is null-safe", () => {
  assert.equal(snapToGrid(13.1), 14);
  assert.equal(snapToGrid(12.9), 12);
  assert.equal(snapToGrid(0), 0);
  assert.equal(snapToGrid(NaN), 0);
  assert.equal(snapToGrid(10, 0), 0);
  assert.equal(snapToGrid(10, -2), 0);
});

test("clampToTent keeps the whole pot inside the floor; invalid input lands at the corner", () => {
  const r = TENT.potRadiusIn;
  assert.deepEqual(clampToTent({ x: -40, z: 999 }), { x: r, z: TENT.depthIn - r });
  assert.deepEqual(clampToTent({ x: 24, z: 24 }), { x: 24, z: 24 });
  assert.deepEqual(clampToTent(null), { x: r, z: r });
  assert.deepEqual(clampToTent({ x: NaN, z: undefined }), { x: r, z: r });
});

test("isInBounds respects the pot radius on every edge", () => {
  assert.equal(isInBounds({ x: 6, z: 6 }), true);
  assert.equal(isInBounds({ x: 4, z: 6 }), false);
  assert.equal(isInBounds({ x: 42, z: 42 }), true);
  assert.equal(isInBounds({ x: 44, z: 42 }), false);
  assert.equal(isInBounds(null), false);
  assert.equal(isInBounds({ x: "6", z: 6 }), false);
});

test("potsOverlap: touching rims do not overlap, closer does", () => {
  const d = TENT.potRadiusIn * 2;
  assert.equal(potsOverlap({ x: 0, z: 0 }, { x: d, z: 0 }), false);
  assert.equal(potsOverlap({ x: 0, z: 0 }, { x: d - 0.5, z: 0 }), true);
});

test("findOccupant ignores the moving plant and resolves ties by id", () => {
  const layout = { "P-2": { x: 10, z: 10 }, "P-1": { x: 10, z: 10 } };
  assert.equal(findOccupant(layout, { x: 10, z: 10 }, "P-9"), "P-1");
  assert.equal(findOccupant(layout, { x: 10, z: 10 }, "P-1"), "P-2");
  assert.equal(findOccupant(layout, { x: 40, z: 40 }, "P-1"), null);
});

test("resolveDrop: free cell moves, same cell is a noop, nothing mutates", () => {
  const before = JSON.stringify(TODAY_LAYOUT);
  const moved = resolveDrop(TODAY_LAYOUT, "P-105", { x: 24.4, z: 11.7 });
  assert.equal(moved.kind, "move");
  assert.deepEqual(moved.layout["P-105"], { x: 24, z: 12 });
  const noop = resolveDrop(TODAY_LAYOUT, "P-105", { x: 24.9, z: 23.2 });
  assert.equal(noop.kind, "noop");
  assert.equal(JSON.stringify(TODAY_LAYOUT), before);
});

test("resolveDrop: occupied cell asks for a named swap; out of bounds and bad input reject", () => {
  const swap = resolveDrop(TODAY_LAYOUT, "P-105", { x: 12, z: 12 });
  assert.equal(swap.kind, "swap-needed");
  assert.equal(swap.withId, "P-101");
  assert.deepEqual(swap.target, { x: 12, z: 12 });
  // Dragging across a plant that overlaps only partially also asks, never silently stacks.
  assert.equal(resolveDrop(TODAY_LAYOUT, "P-105", { x: 16, z: 12 }).kind, "swap-needed");
  assert.equal(resolveDrop(TODAY_LAYOUT, "P-105", { x: 2, z: 12 }).reason, "out-of-bounds");
  assert.equal(resolveDrop(TODAY_LAYOUT, "P-999", { x: 2, z: 12 }).reason, "unknown-plant");
  assert.equal(resolveDrop(TODAY_LAYOUT, "P-105", { x: NaN, z: 12 }).reason, "invalid-position");
  assert.equal(resolveDrop(null, "P-105", { x: 2, z: 12 }).kind, "rejected");
});

test("swapPositions exchanges two pots and leaves invalid requests untouched", () => {
  const swapped = swapPositions(TODAY_LAYOUT, "P-101", "P-105");
  assert.deepEqual(swapped["P-101"], { x: 24, z: 24 });
  assert.deepEqual(swapped["P-105"], { x: 12, z: 12 });
  assert.equal(swapPositions(TODAY_LAYOUT, "P-101", "P-101"), TODAY_LAYOUT);
  assert.equal(swapPositions(TODAY_LAYOUT, "P-101", "nope"), TODAY_LAYOUT);
});

test("netChanges reports only final positions: intermediate drags and round trips vanish", () => {
  let draft = resolveDrop(TODAY_LAYOUT, "P-105", { x: 24, z: 12 }).layout;
  draft = resolveDrop(draft, "P-105", { x: 24, z: 8 }).layout;
  draft = resolveDrop(draft, "P-105", { x: 24, z: 24 }).layout; // back home
  assert.deepEqual(netChanges(TODAY_LAYOUT, draft), []);
  draft = resolveDrop(draft, "P-106", { x: 40, z: 24 }).layout;
  assert.deepEqual(netChanges(TODAY_LAYOUT, draft), [
    { plantId: "P-106", from: { x: 24, z: 40 }, to: { x: 40, z: 24 } },
  ]);
});

test("pairSwaps groups a confirmed swap into one item and leaves singles alone", () => {
  const swapped = swapPositions(TODAY_LAYOUT, "P-101", "P-102");
  const moved = resolveDrop(swapped, "P-106", { x: 40, z: 24 }).layout;
  const { swaps, singles } = pairSwaps(netChanges(TODAY_LAYOUT, moved));
  assert.deepEqual(swaps, [{ aId: "P-101", bId: "P-102" }]);
  assert.equal(singles.length, 1);
  assert.equal(singles[0].plantId, "P-106");
});

test("every sample layout is valid: in bounds and non-overlapping", () => {
  assert.deepEqual(validateLayout(TODAY_LAYOUT), { ok: true, problems: [] });
  for (const s of SNAPSHOTS) assert.equal(validateLayout(s.layout).ok, true, s.id);
});

test("validateLayout names the problems deterministically", () => {
  const bad = { "P-b": { x: 10, z: 10 }, "P-a": { x: 12, z: 10 }, "P-c": { x: 1, z: 1 } };
  const result = validateLayout(bad);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [
    { plantId: "P-c", problem: "out-of-bounds" },
    { plantId: "P-a", problem: "overlaps", withId: "P-b" },
  ]);
});
