/**
 * Pure E2E fixture rotation planner/executor tests.
 */
import { describe, it, expect, vi } from "vitest";
import {
  parseRotationArgs,
  isForbiddenRealGrowName,
  isFixtureHuntName,
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
    expect(parseRotationArgs([])).toEqual({ mode: "dry_run" });
    expect(parseRotationArgs(["--dry-run"])).toEqual({ mode: "dry_run" });
  });
  it("requires both execute and confirm", () => {
    expect(parseRotationArgs(["--execute"])).toMatchObject({ mode: "blocked" });
    expect(parseRotationArgs(["--confirm-fixture-rotation"])).toMatchObject({
      mode: "blocked",
    });
    expect(parseRotationArgs(["--execute", "--confirm-fixture-rotation"])).toEqual({
      mode: "execute",
    });
  });
  it("blocks unknown and conflicting flags", () => {
    expect(parseRotationArgs(["--force"])).toMatchObject({ reason: "unknown_flag" });
    expect(parseRotationArgs(["--dry-run", "--execute"])).toMatchObject({
      reason: "conflicting_flags",
    });
  });
});

describe("name classifiers", () => {
  it("denylists real grows without E2E markers", () => {
    expect(isForbiddenRealGrowName("Project McDonald")).toBe(true);
    expect(isForbiddenRealGrowName("Starter Grow")).toBe(true);
    expect(isForbiddenRealGrowName("E2E Starter Grow")).toBe(false);
    expect(isForbiddenRealGrowName("E2E Test Grow")).toBe(false);
  });
  it("identifies fixture hunts by E2E prefix", () => {
    expect(isFixtureHuntName("E2E paid-journey 2026-08-08")).toBe(true);
    expect(isFixtureHuntName("Codex Pro E2E Pheno Hunt 2026-07-25")).toBe(true);
    expect(isFixtureHuntName("Blue Dream F2")).toBe(false);
  });
  it("buildE2eHuntName matches playbook", () => {
    expect(buildE2eHuntName("rotate", new Date("2026-08-08T00:00:00Z"))).toBe(
      "E2E rotate 2026-08-08",
    );
  });
});

describe("classifyGardenInventory + planRotation", () => {
  it("blocks contaminated accounts with McDonald grow", () => {
    const c = classifyGardenInventory({
      grows: [{ id: "g1", name: "Project McDonald" }],
      tents: [],
      plants: [],
      hunts: [{ id: "h1", name: "E2E leftover 2026-07-25" }],
    });
    expect(c.contaminated).toBe(true);
    const plan = planRotation(c);
    expect(plan.status).toBe("blocked");
    expect(plan.reason).toBe("account_contaminated");
    expect(plan.actions).toEqual([]);
  });

  it("plans delete of E2E hunts on a clean garden", () => {
    const c = classifyGardenInventory({
      grows: [{ id: "g1", name: "E2E Test Grow" }],
      tents: [{ id: "t1", name: E2E_GARDEN_NAMES.tent }],
      plants: [{ id: "p1", name: E2E_GARDEN_NAMES.plant }],
      hunts: [
        { id: "h1", name: "E2E paid-journey 2026-08-01" },
        { id: "h2", name: "Real keeper notes hunt" },
      ],
    });
    expect(c.contaminated).toBe(false);
    expect(c.hunts_to_delete).toHaveLength(1);
    expect(c.hunts_kept).toHaveLength(1);
    const plan = planRotation(c);
    expect(plan.status).toBe("ready");
    expect(plan.actions).toEqual([
      { op: "delete_pheno_hunt", hunt_id: "h1", name: "E2E paid-journey 2026-08-01" },
    ]);
  });

  it("reports missing tent/plant seed actions", () => {
    const c = classifyGardenInventory({
      grows: [{ id: "g1", name: "E2E Test Grow" }],
      tents: [],
      plants: [],
      hunts: [],
    });
    const plan = planRotation(c);
    expect(plan.actions.some((a) => a.op === "seed_missing" && a.kind === "tent")).toBe(true);
    expect(plan.actions.some((a) => a.op === "seed_missing" && a.kind === "plant")).toBe(true);
  });
});

describe("executeRotationPlan", () => {
  it("dry-run never calls delete", async () => {
    const del = vi.fn();
    const plan = planRotation(
      classifyGardenInventory({
        grows: [{ id: "g1", name: "E2E Test Grow" }],
        tents: [{ id: "t1", name: E2E_GARDEN_NAMES.tent }],
        plants: [{ id: "p1", name: E2E_GARDEN_NAMES.plant }],
        hunts: [{ id: "h1", name: "E2E x 2026-08-08" }],
      }),
    );
    const r = await executeRotationPlan(plan, "dry_run", { deletePhenoHunt: del });
    expect(r.status).toBe("completed");
    expect(r.reason).toBe("dry_run");
    expect(r.counts.hunts_planned).toBe(1);
    expect(r.counts.hunts_deleted).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("execute deletes only fixture hunts", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const plan = planRotation(
      classifyGardenInventory({
        grows: [{ id: "g1", name: "E2E Test Grow" }],
        tents: [{ id: "t1", name: E2E_GARDEN_NAMES.tent }],
        plants: [{ id: "p1", name: E2E_GARDEN_NAMES.plant }],
        hunts: [{ id: "h1", name: "E2E x 2026-08-08" }],
      }),
    );
    const r = await executeRotationPlan(plan, "execute", { deletePhenoHunt: del });
    expect(r.status).toBe("completed");
    expect(del).toHaveBeenCalledWith("h1");
    expect(r.counts.hunts_deleted).toBe(1);
  });

  it("runRotation end-to-end dry path", async () => {
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

describe("receipt", () => {
  it("renders versioned prefix without secrets", () => {
    const receipt = buildRotationReceipt({
      status: "completed",
      mode: "dry_run",
      counts: {
        hunts_deleted: 0,
        hunts_planned: 2,
        seed_actions_planned: 0,
        forbidden_grows: 0,
        unmarked_grows: 0,
      },
    });
    const line = renderRotationReceipt(receipt);
    expect(line.startsWith(E2E_FIXTURE_ROTATION_JSON_PREFIX)).toBe(true);
    expect(line).not.toMatch(/password|token|Bearer|eyJ/i);
    expect(JSON.parse(line.slice(E2E_FIXTURE_ROTATION_JSON_PREFIX.length)).schema_version).toBe(
      "1",
    );
  });
});
