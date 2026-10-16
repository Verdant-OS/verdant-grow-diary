import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sortSnapshots,
  timelinePoints,
  pointAt,
  membershipFor,
  evidenceFor,
  movedBetween,
} from "../src/rules/historyRules.js";
import {
  visualForStage,
  labelFor,
  sexLabel,
  normalizeWeek,
} from "../src/rules/plantVisualRules.js";
import { SNAPSHOTS, TODAY_LAYOUT, PLANTS_BY_ID, plantById } from "../src/data/sampleGarden.js";

test("timelinePoints orders recorded dates and appends Today; no intermediate points", () => {
  const shuffled = [SNAPSHOTS[2], SNAPSHOTS[0], SNAPSHOTS[1]];
  const points = timelinePoints(shuffled);
  assert.deepEqual(
    points.map((p) => p.id),
    ["snap-2026-08-18", "snap-2026-09-08", "snap-2026-09-29", "today"],
  );
  assert.equal(points[3].isToday, true);
  assert.equal(sortSnapshots(shuffled)[0].date, "2026-08-18");
  assert.equal(sortSnapshots(null).length, 0);
});

test("pointAt snaps out-of-range and invalid indexes to Today", () => {
  const points = timelinePoints(SNAPSHOTS);
  assert.equal(pointAt(points, 1).id, "snap-2026-09-08");
  assert.equal(pointAt(points, 99).id, "today");
  assert.equal(pointAt(points, -1).id, "today");
  assert.equal(pointAt(points, 1.5).id, "today");
  assert.equal(pointAt([], 0), null);
});

test("membership follows the snapshot: Cinder appears in history, not today", () => {
  assert.ok(membershipFor(SNAPSHOTS[0].layout).includes("P-107"));
  assert.ok(membershipFor(SNAPSHOTS[1].layout).includes("P-107"));
  assert.ok(!membershipFor(SNAPSHOTS[2].layout).includes("P-107"));
  assert.ok(!membershipFor(TODAY_LAYOUT).includes("P-107"));
  assert.ok(!membershipFor(SNAPSHOTS[0].layout).includes("P-105"));
  assert.equal(plantById("P-107").shortName, "Cinder");
  assert.equal(plantById("P-404"), null);
});

test("evidenceFor reports missing evidence instead of inventing it", () => {
  const e = evidenceFor(SNAPSHOTS[1], "P-103");
  assert.equal(e.position.missing, false);
  assert.equal(e.stage.value.week, 2);
  assert.equal(e.note.missing, true);
  assert.equal(e.photo.missing, true);
  const gone = evidenceFor(SNAPSHOTS[2], "P-107");
  assert.equal(gone.position.missing, true);
  assert.equal(gone.stage.missing, true);
  assert.equal(evidenceFor(null, "P-101").position.missing, true);
});

test("movedBetween lists only pots common to both views whose recorded positions differ", () => {
  assert.deepEqual(movedBetween(SNAPSHOTS[0].layout, SNAPSHOTS[1].layout), [
    "P-102",
    "P-103",
    "P-104",
    "P-107",
  ]);
  assert.deepEqual(movedBetween(SNAPSHOTS[2].layout, TODAY_LAYOUT), []);
  assert.deepEqual(movedBetween(null, TODAY_LAYOUT), []);
});

test("visualForStage: unknown is neutral, veg grows by week and caps, flower fills clusters", () => {
  const unknown = visualForStage({ stage: "nonsense", week: 4 });
  assert.equal(unknown.neutral, true);
  assert.equal(unknown.label, "Stage not recorded");
  assert.equal(unknown.clusterCount, 0);
  assert.deepEqual(visualForStage(null), unknown);
  assert.deepEqual(visualForStage({ stage: "unknown" }), unknown);

  const v2 = visualForStage({ stage: "veg", week: 2 });
  const v6 = visualForStage({ stage: "veg", week: 6 });
  const v12 = visualForStage({ stage: "veg", week: 12 });
  assert.ok(v6.heightIn > v2.heightIn);
  assert.equal(v12.heightIn, visualForStage({ stage: "veg", week: 8 }).heightIn);
  assert.equal(v6.clusterCount, 0);

  const f1 = visualForStage({ stage: "flower", week: 1 });
  const f7 = visualForStage({ stage: "flower", week: 7 });
  assert.equal(f1.heightIn, f7.heightIn, "flower fills in rather than growing taller");
  assert.ok(f7.clusterCount > f1.clusterCount);
  assert.ok(f7.clusterScale > f1.clusterScale);
  assert.ok(f7.clusterScale <= 1);
  assert.equal(visualForStage({ stage: "flower", week: 40 }).clusterScale, 1);
});

test("visualForStage is deterministic and null-safe on week", () => {
  assert.deepEqual(
    visualForStage({ stage: "veg", week: 3 }),
    visualForStage({ stage: "veg", week: 3 }),
  );
  assert.equal(visualForStage({ stage: "veg", week: null }).label, "Veg");
  assert.equal(visualForStage({ stage: "veg", week: -2 }).week, null);
  assert.equal(normalizeWeek(3.9), 3);
  assert.equal(normalizeWeek("3"), null);
});

test("labelFor shows the short name with the stable id; long name is for details/List", () => {
  assert.equal(labelFor(PLANTS_BY_ID["P-102"]), "Juniper · P-102");
  assert.equal(labelFor(PLANTS_BY_ID["P-105"]), `${PLANTS_BY_ID["P-105"].shortName} · P-105`);
  // no short name: fall back to the long name, truncated with the id kept
  assert.equal(
    labelFor({ id: "P-8", longName: "A very long cultivar name here" }),
    "A very long c… · P-8",
  );
  assert.equal(labelFor({ id: "P-9" }), "P-9");
  assert.equal(labelFor(null), "?");
  assert.equal(sexLabel("male"), "Male (recorded)");
  assert.equal(sexLabel(undefined), "Sex not recorded");
});
