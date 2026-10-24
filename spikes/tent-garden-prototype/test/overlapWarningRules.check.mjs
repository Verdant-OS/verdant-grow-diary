import { test } from "node:test";
import assert from "node:assert/strict";
import { tentFor, selectedPotOverlapWarning } from "../src/rules/layoutRules.js";
import { TODAY_LAYOUT } from "../src/data/sampleGarden.js";

test("the overlap warning names the pots only when the selected pot size overlaps", () => {
  const seven = selectedPotOverlapWarning(TODAY_LAYOUT, tentFor("4x4", 7));
  assert.equal(seven.show, true);
  assert.deepEqual(seven.plantIds, ["P-103", "P-106"]);
  assert.equal(seven.text, "7 gal pots would overlap (P-103 and P-106)");

  assert.equal(selectedPotOverlapWarning(TODAY_LAYOUT, tentFor("4x4", 5)), null);
  assert.equal(selectedPotOverlapWarning(TODAY_LAYOUT, tentFor("4x4", 3)), null);
  assert.equal(selectedPotOverlapWarning(null, tentFor("4x4", 7)), null);
  assert.equal(selectedPotOverlapWarning(TODAY_LAYOUT, null), null);
});
