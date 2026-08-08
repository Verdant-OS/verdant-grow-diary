/**
 * Pure E2E fixture rotation planner/executor tests (all gap features).
 */
import { describe, it, expect, vi } from "vitest";
import {
  parseRotationArgs,
  isForbiddenRealGrowName,
  isFixtureHuntName,
  isE2eDiaryNote,
  buildE2eHuntName,
  classifyGardenInventory,
  planRotation,
  executeRotationPlan,
  runRotation,
  E2E_GARDEN_NAMES,
  E2E_FIXTURE_ROTATION_JSON_PREFIX,
  buildRotationReceipt,
  renderRotationReceipt,
} from "../../scripts/e2e/e2e-fixture-rotation-core.mjs";

describe("parseRotationArgs", () => {
  it("defaults to dry_run", () => {
    expect(parseRotationArgs([])).toEqual({ mode: "dry_run", pruneDiary: false });
  });
  it("requires both execute and confirm", () => {
    expect(parseRotationArgs(["--execute"]).mode).toBe("blocked");
    expect(parseRotationArgs(["--execute", "--confirm-fixture-rotation"])).toEqual({
      mode: "execute",
      pruneDiary: false,
    });
  });
  it("allows diary prune only with execute+confirm", () => {
    expect(parseRotationArgs(["--prune-e2e-diary"]).reason).toBe(
      "prune_diary_requires_execute_confirm",
    );
    expect(
      parseRotationArgs(["--execute", "--confirm-fixture-rotation", "--prune-e2e-diary"]),
    ).toEqual({ mode: "execute", pruneDiary: true });
  });
});

describe("isFixtureHuntName — concat + legacy residue", () => {
  it("matches E2E prefix and E2E+pheno hunt", () => {
    expect(isFixtureHuntName("E2E paid-journey 2026-08-08")).toBe(true);
    expect(isFixtureHuntName("Codex Pro E2E Pheno Hunt 2026-07-25")).toBe(true);
  });
  it("matches concat without leading E2E (#569)", () => {
    expect(isFixtureHuntName("Starter Grow Pheno HuntClaude E2E Pheno Hunt")).toBe(true);
    expect(isFixtureHuntName("Starter Grow Pheno HuntSomething")).toBe(true);
    expect(isFixtureHuntName("Summer Pheno Hunt Extra Pheno Hunt")).toBe(true);
  });
  it("matches Claude/Codex/DEMO residue", () => {
    expect(isFixtureHuntName("Claude Pheno Hunt")).toBe(true);
    expect(isFixtureHuntName("DEMO — Loud Pack S1 Hunt")).toBe(true);
  });
  it("keeps real grower hunt names", () => {
    expect(isFixtureHuntName("Blue Dream F2")).toBe(false);
    expect(isFixtureHuntName("Summer Pheno Hunt")).toBe(false);
  });
});

describe("isE2eDiaryNote", () => {
  it("matches E2E-prefixed notes only", () => {
    expect(isE2eDiaryNote("E2E paid-journey smoke — safe to delete")).toBe(true);
    expect(isE2eDiaryNote("E2E pheno sweep: vigor evidence")).toBe(true);
    expect(isE2eDiaryNote("Watered 1L — real grower note")).toBe(false);
  });
});

describe("classify + plan — auto-seed + diary", () => {
  it("blocks contaminated accounts", () => {
    const c = classifyGardenInventory({
      grows: [{ id: "g1", name: "Project McDonald" }],
      hunts: [{ id: "h1", name: "E2E leftover" }],
    });
    expect(planRotation(c).status).toBe("blocked");
  });

  it("plans hunt delete, seed, and optional diary", () => {
    const c = classifyGardenInventory({
      grows: [{ id: "g1", name: "E2E Test Grow" }],
      tents: [],
      plants: [{ id: "p1", name: E2E_GARDEN_NAMES.plant }],
      hunts: [{ id: "h1", name: "Starter Grow Pheno HuntClaude" }],
      diary: [
        { id: "d1", plant_id: "p1", note: "E2E paid-journey smoke" },
        { id: "d2", plant_id: "p1", note: "Real watering note" },
      ],
    });
    expect(c.hunts_to_delete).toHaveLength(1);
    expect(c.diary_to_delete).toHaveLength(1);
    expect(c.missing.tent).toBe(true);

    const withoutDiary = planRotation(c, { pruneDiary: false });
    expect(withoutDiary.actions.some((a) => a.op === "delete_e2e_diary")).toBe(false);
    expect(withoutDiary.actions.some((a) => a.op === "seed_missing" && a.kind === "tent")).toBe(
      true,
    );

    const withDiary = planRotation(c, { pruneDiary: true });
    expect(withDiary.actions.filter((a) => a.op === "delete_e2e_diary")).toHaveLength(1);
  });
});

describe("executeRotationPlan — auto-seed", () => {
  it("dry-run never mutates", async () => {
    const del = vi.fn();
    const seed = vi.fn();
    const plan = planRotation(
      classifyGardenInventory({
        grows: [{ id: "g1", name: "E2E Test Grow" }],
        tents: [],
        plants: [],
        hunts: [{ id: "h1", name: "E2E x 2026-08-08" }],
      }),
    );
    const r = await executeRotationPlan(plan, "dry_run", {
      deletePhenoHunt: del,
      seedGarden: seed,
    });
    expect(r.reason).toBe("dry_run");
    expect(del).not.toHaveBeenCalled();
    expect(seed).not.toHaveBeenCalled();
  });

  it("execute deletes hunts and seeds missing garden", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const seed = vi.fn().mockResolvedValue({ seeded: ["tent", "plant"] });
    const plan = planRotation(
      classifyGardenInventory({
        grows: [{ id: "g1", name: "E2E Test Grow" }],
        tents: [],
        plants: [],
        hunts: [{ id: "h1", name: "E2E x 2026-08-08" }],
      }),
    );
    const r = await executeRotationPlan(plan, "execute", {
      deletePhenoHunt: del,
      seedGarden: seed,
    });
    expect(r.status).toBe("completed");
    expect(del).toHaveBeenCalledWith("h1");
    expect(seed).toHaveBeenCalled();
    expect(r.counts.seed_actions_completed).toBe(2);
  });

  it("execute prunes diary when planned", async () => {
    const delHunt = vi.fn();
    const delDiary = vi.fn().mockResolvedValue(undefined);
    const plan = planRotation(
      classifyGardenInventory({
        grows: [{ id: "g1", name: "E2E Test Grow" }],
        tents: [{ id: "t1", name: E2E_GARDEN_NAMES.tent }],
        plants: [{ id: "p1", name: E2E_GARDEN_NAMES.plant }],
        hunts: [],
        diary: [{ id: "d1", plant_id: "p1", note: "E2E smoke note" }],
      }),
      { pruneDiary: true },
    );
    const r = await executeRotationPlan(plan, "execute", {
      deletePhenoHunt: delHunt,
      deleteDiaryEntry: delDiary,
    });
    expect(delDiary).toHaveBeenCalledWith("d1");
    expect(r.counts.diary_deleted).toBe(1);
  });
});

describe("receipt schema v2", () => {
  it("includes seed and diary counts", () => {
    const line = renderRotationReceipt(
      buildRotationReceipt({
        status: "completed",
        mode: "execute",
        counts: {
          hunts_deleted: 1,
          hunts_planned: 1,
          seed_actions_planned: 1,
          seed_actions_completed: 1,
          diary_deleted: 2,
          diary_planned: 2,
          forbidden_grows: 0,
          unmarked_grows: 0,
        },
      }),
    );
    expect(line.startsWith(E2E_FIXTURE_ROTATION_JSON_PREFIX)).toBe(true);
    const body = JSON.parse(line.slice(E2E_FIXTURE_ROTATION_JSON_PREFIX.length));
    expect(body.schema_version).toBe("2");
    expect(body.counts.diary_deleted).toBe(2);
    expect(body.counts.seed_actions_completed).toBe(1);
  });
});

describe("buildE2eHuntName", () => {
  it("prefixes E2E and date", () => {
    expect(buildE2eHuntName("rotate", new Date("2026-08-08T00:00:00Z"))).toBe(
      "E2E rotate 2026-08-08",
    );
  });
});

describe("runRotation", () => {
  it("end-to-end dry path", async () => {
    const r = await runRotation({
      inventory: {
        grows: [{ id: "g1", name: "E2E Test Grow" }],
        tents: [{ id: "t1", name: E2E_GARDEN_NAMES.tent }],
        plants: [{ id: "p1", name: E2E_GARDEN_NAMES.plant }],
        hunts: [],
      },
      mode: "dry_run",
    });
    expect(r.status).toBe("completed");
  });
});
