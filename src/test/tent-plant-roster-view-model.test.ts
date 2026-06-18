import { describe, it, expect } from "vitest";
import {
  buildTentPlantRosterViewModel,
  TENT_PLANT_ROSTER_SHARED_ENVIRONMENT_COPY,
  TENT_PLANT_ROSTER_TENT_SENSOR_CONTEXT_NOTE,
  TENT_PLANT_ROSTER_EMPTY_COPY,
  TENT_PLANT_ROSTER_UNKNOWN_RELATIONSHIP_COPY,
  TENT_PLANT_ROSTER_HARVEST_WATCH_FALLBACK_COPY,
} from "@/lib/tentPlantRosterViewModel";

const TENT = "tent-1";

describe("tentPlantRosterViewModel", () => {
  it("groups only plants matching the selected tent", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [
        { id: "p1", name: "Alpha", tentId: TENT, strain: "Blue" },
        { id: "p2", name: "Beta", tentId: "other-tent" },
        { id: "p3", name: "Gamma", tentId: TENT },
      ],
    });
    expect(vm.state).toBe("loaded");
    expect(vm.rows.map((r) => r.id)).toEqual(["p1", "p3"]);
  });

  it("excludes archived plants by default", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [
        { id: "p1", name: "Alpha", tentId: TENT },
        { id: "p2", name: "Beta", tentId: TENT, isArchived: true },
      ],
    });
    expect(vm.rows.map((r) => r.id)).toEqual(["p1"]);
  });

  it("renders empty state when no plants match", () => {
    const vm = buildTentPlantRosterViewModel({ tentId: TENT, plants: [] });
    expect(vm.state).toBe("empty");
    expect(vm.emptyCopy).toBe(TENT_PLANT_ROSTER_EMPTY_COPY);
    expect(vm.rows).toEqual([]);
  });

  it("renders unknown-relationship state when relationshipKnown=false", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [{ id: "p1", name: "Alpha", tentId: TENT }],
      relationshipKnown: false,
    });
    expect(vm.state).toBe("unknown-relationship");
    expect(vm.unknownRelationshipCopy).toBe(
      TENT_PLANT_ROSTER_UNKNOWN_RELATIONSHIP_COPY,
    );
    expect(vm.rows).toEqual([]);
  });

  it("projects name/strain/stage when available", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [
        {
          id: "p1",
          name: "Alpha",
          strain: "Blue Dream",
          stage: "flower",
          tentId: TENT,
        },
      ],
    });
    expect(vm.rows[0]).toMatchObject({
      id: "p1",
      name: "Alpha",
      strain: "Blue Dream",
      stage: "flower",
    });
  });

  it("renders latest log date and photo indicator when available", () => {
    const iso = "2026-06-01T12:00:00.000Z";
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [
        {
          id: "p1",
          name: "Alpha",
          tentId: TENT,
          latestLogAt: iso,
          hasRecentPhoto: true,
        },
      ],
    });
    expect(vm.rows[0].latestLogAt).toBe(iso);
    expect(vm.rows[0].hasRecentPhoto).toBe(true);
  });

  it("provides a Plant Detail link href for each plant", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [{ id: "p1", name: "Alpha", tentId: TENT }],
    });
    expect(vm.rows[0].plantDetailHref).toContain("p1");
  });

  it("falls back to Harvest Watch handoff copy when no public state given", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [{ id: "p1", name: "Alpha", tentId: TENT }],
    });
    expect(vm.rows[0].harvestWatchPublicState).toBeNull();
    expect(vm.rows[0].harvestWatchFallbackCopy).toBe(
      TENT_PLANT_ROSTER_HARVEST_WATCH_FALLBACK_COPY,
    );
  });

  it("exposes shared environment copy and tent sensor context note", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [{ id: "p1", name: "Alpha", tentId: TENT }],
      tentSensorContextLabel: "Live",
    });
    expect(vm.sharedEnvironmentCopy).toBe(
      TENT_PLANT_ROSTER_SHARED_ENVIRONMENT_COPY,
    );
    expect(vm.tentSensorContextNote).toBe(
      TENT_PLANT_ROSTER_TENT_SENSOR_CONTEXT_NOTE,
    );
    expect(vm.tentSensorContextLabel).toBe("Live");
  });

  it("does not invent latestLogAt/photo from missing fields", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [{ id: "p1", name: "Alpha", tentId: TENT }],
    });
    expect(vm.rows[0].latestLogAt).toBeNull();
    expect(vm.rows[0].hasRecentPhoto).toBe(false);
  });

  it("sorts rows deterministically by name", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [
        { id: "p2", name: "Charlie", tentId: TENT },
        { id: "p1", name: "alpha", tentId: TENT },
        { id: "p3", name: "Bravo", tentId: TENT },
      ],
    });
    expect(vm.rows.map((r) => r.name)).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("ignores plants without a tentId match", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [{ id: "p1", name: "Alpha", tentId: null }],
    });
    expect(vm.state).toBe("empty");
  });

  it("treats missing tentId input as empty when plants exist", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: null,
      plants: [{ id: "p1", name: "Alpha", tentId: TENT }],
    });
    expect(vm.state).toBe("empty");
  });

  it("includes archived plants when includeArchived=true and marks isArchived", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      includeArchived: true,
      plants: [
        { id: "p1", name: "Alpha", tentId: TENT },
        { id: "p2", name: "Beta", tentId: TENT, isArchived: true },
      ],
    });
    expect(vm.includeArchived).toBe(true);
    expect(vm.rows.map((r) => r.id)).toEqual(["p1", "p2"]);
    const beta = vm.rows.find((r) => r.id === "p2");
    expect(beta?.isArchived).toBe(true);
    const alpha = vm.rows.find((r) => r.id === "p1");
    expect(alpha?.isArchived).toBe(false);
  });

  it("counts archived plants hidden by default", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [
        { id: "p1", name: "Alpha", tentId: TENT },
        { id: "p2", name: "Beta", tentId: TENT, isArchived: true },
        { id: "p3", name: "Gamma", tentId: TENT, isArchived: true },
      ],
    });
    expect(vm.archivedHiddenCount).toBe(2);
    expect(vm.includeArchived).toBe(false);
  });

  it("emits empty archived hint when active set is empty but archived exist", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [
        { id: "p2", name: "Beta", tentId: TENT, isArchived: true },
      ],
    });
    expect(vm.state).toBe("empty");
    expect(vm.archivedHiddenCount).toBe(1);
    expect(vm.emptyArchivedHintCopy).toContain("Archived plants");
  });

  it("does not emit archived hint when no archived plants exist", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      plants: [],
    });
    expect(vm.emptyArchivedHintCopy).toBeNull();
  });

  it("preserves deterministic sort when archived plants are included", () => {
    const vm = buildTentPlantRosterViewModel({
      tentId: TENT,
      includeArchived: true,
      plants: [
        { id: "p2", name: "Charlie", tentId: TENT },
        { id: "p1", name: "alpha", tentId: TENT, isArchived: true },
        { id: "p3", name: "Bravo", tentId: TENT },
      ],
    });
    expect(vm.rows.map((r) => r.name)).toEqual(["alpha", "Bravo", "Charlie"]);
  });
});
