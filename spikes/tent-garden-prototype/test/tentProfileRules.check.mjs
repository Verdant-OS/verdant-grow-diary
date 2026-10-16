import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TENT,
  TENT_PROFILES,
  POT_SIZES,
  tentFor,
  potSizeOptions,
  validateLayout,
  resolveDrop,
} from "../src/rules/layoutRules.js";
import { resolveGardenId, GARDEN_IDS } from "../src/rules/gardenRules.js";
import * as garden4 from "../src/data/sampleGarden.js";
import * as garden5 from "../src/data/sampleGarden5x5.js";

test("tent profiles cover 2×4, 4×4 and 5×5 in inches", () => {
  assert.deepEqual(
    Object.values(TENT_PROFILES).map((p) => [p.id, p.widthIn, p.depthIn]),
    [
      ["2x4", 48, 24],
      ["4x4", 48, 48],
      ["5x5", 60, 60],
    ],
  );
});

test("pot sizes are ascending by gallons and footprint", () => {
  for (let i = 1; i < POT_SIZES.length; i++) {
    assert.ok(POT_SIZES[i].gal > POT_SIZES[i - 1].gal);
    assert.ok(POT_SIZES[i].radiusIn > POT_SIZES[i - 1].radiusIn);
  }
});

test("tentFor builds a full tent from a profile and pot size; unknown inputs return null", () => {
  const t = tentFor("5x5", 7);
  assert.equal(t.widthIn, 60);
  assert.equal(t.depthIn, 60);
  assert.equal(t.potGal, 7);
  assert.equal(t.potRadiusIn, POT_SIZES.find((s) => s.gal === 7).radiusIn);
  assert.equal(t.snapIn, TENT.snapIn);
  assert.equal(tentFor("9x9", 5), null);
  assert.equal(tentFor("5x5", 4), null);
  assert.equal(tentFor(null, null), null);
});

test("the legacy TENT constant is unchanged (existing rules and tests rely on it)", () => {
  assert.equal(TENT.widthIn, 48);
  assert.equal(TENT.depthIn, 48);
  assert.equal(TENT.potRadiusIn, 5.5);
});

test("pot size options: only sizes every recorded layout still fits are allowed, with a reason", () => {
  const layout = { A: { x: 12, z: 12 }, B: { x: 24, z: 12 } }; // 12 in apart
  const opts = potSizeOptions([layout], "4x4");
  const byGal = Object.fromEntries(opts.map((o) => [o.gal, o]));
  assert.equal(byGal[5].ok, true); // 12 in footprint: touching, not overlapping
  assert.equal(byGal[7].ok, false);
  assert.match(byGal[7].reason, /overlap/i);
  assert.match(byGal[7].reason, /A.*B|B.*A/);
});

test("pot size options reject sizes that push a recorded pot out of bounds", () => {
  const layout = { A: { x: 6, z: 30 } }; // 6 in from the left wall
  const byGal = Object.fromEntries(potSizeOptions([layout], "5x5").map((o) => [o.gal, o]));
  assert.equal(byGal[5].ok, true);
  assert.equal(byGal[7].ok, false);
  assert.match(byGal[7].reason, /wall|bounds/i);
});

test("null-safe pot size options: unknown profile → every size unavailable; empty layouts → all fit", () => {
  assert.ok(potSizeOptions([{}], "9x9").every((o) => !o.ok));
  assert.ok(potSizeOptions([], "5x5").every((o) => o.ok));
  assert.ok(potSizeOptions(null, "5x5").every((o) => o.ok));
});

test("resolveDrop honours the tent passed in (5×5 allows x = 54 that 4×4 rejects)", () => {
  const layout = { A: { x: 30, z: 30 } };
  assert.equal(resolveDrop(layout, "A", { x: 54, z: 30 }, tentFor("5x5", 5)).kind, "move");
  assert.equal(resolveDrop(layout, "A", { x: 54, z: 30 }, tentFor("4x4", 5)).kind, "rejected");
});

test("garden id resolution falls back to 4×4 for missing or unknown ids", () => {
  assert.deepEqual([...GARDEN_IDS], ["4x4", "5x5"]);
  assert.equal(resolveGardenId("5x5"), "5x5");
  assert.equal(resolveGardenId("4x4"), "4x4");
  assert.equal(resolveGardenId("../../etc"), "4x4");
  assert.equal(resolveGardenId(null), "4x4");
});

for (const [name, g] of [
  ["4×4", garden4],
  ["5×5", garden5],
]) {
  test(`${name} fixture: default pot fits today's layout and every snapshot`, () => {
    const tent = tentFor(g.TENT_PROFILE_ID, g.DEFAULT_POT_GAL);
    assert.ok(tent, "fixture names a real profile and pot size");
    for (const l of [g.TODAY_LAYOUT, ...g.SNAPSHOTS.map((s) => s.layout)]) {
      const v = validateLayout(l, tent);
      assert.ok(v.ok, JSON.stringify(v.problems));
    }
  });
}

test("5×5 fixture has nine fictional plants, each with a stage record", () => {
  assert.equal(garden5.PLANTS.length, 9);
  assert.equal(Object.keys(garden5.TODAY_LAYOUT).length, 9);
  for (const p of garden5.PLANTS) {
    assert.ok(garden5.TODAY_STAGES[p.id], p.id);
    assert.match(p.longName, /sample/i, "fixture names are marked as sample data");
  }
});
