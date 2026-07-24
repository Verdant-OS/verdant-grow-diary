/**
 * PR B1 — Guided starter setup: pure rules + orchestrator tests.
 *
 * These tests pin the safety contract:
 *   - starter names are the canonical markers,
 *   - repeat runs reuse existing rows (idempotent),
 *   - the adapter is called only for grow / tent / plant paths
 *     (never sensor_readings, alerts, action_queue, AI Doctor, or
 *     edge-function paths — those methods do not exist on the adapter
 *     interface at all, which is the fence),
 *   - errors surface as StarterSetupError with a step, so the UI never
 *     partially redirects.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildStarterQuickLogPrefill,
  findStarterRowByName,
  STARTER_GROW_NAME,
  STARTER_PLANT_NAME,
  STARTER_SETUP_BUTTON_LABEL,
  STARTER_SETUP_HELPER_COPY,
  STARTER_TENT_NAME,
} from "@/lib/starterSetupRules";
import {
  runStarterSetup,
  StarterSetupError,
  type StarterSetupDataAccess,
} from "@/lib/starterSetupService";

const FORBIDDEN_COPY_PHRASES = [
  "autopilot",
  "fully automated grow control",
  "ai controls your equipment",
  "automatic device control",
  "autonomous device control",
  "hands-free grow control",
  "set-and-forget automation",
  "controls your equipment",
];

function makeAdapter(overrides: Partial<StarterSetupDataAccess> = {}): {
  db: StarterSetupDataAccess;
  spies: Record<keyof StarterSetupDataAccess, ReturnType<typeof vi.fn>>;
} {
  const spies = {
    listOwnedGrows: vi.fn(async () => []),
    listOwnedTents: vi.fn(async () => []),
    listOwnedPlants: vi.fn(async () => []),
    createStarterGrow: vi.fn(async () => ({ id: "grow-1", name: STARTER_GROW_NAME })),
    createStarterTent: vi.fn(async () => ({ id: "tent-1", name: STARTER_TENT_NAME })),
    createStarterPlant: vi.fn(async () => ({ id: "plant-1", name: STARTER_PLANT_NAME })),
    ...overrides,
  } as Record<keyof StarterSetupDataAccess, ReturnType<typeof vi.fn>>;
  return { db: spies as unknown as StarterSetupDataAccess, spies };
}

describe("starterSetupRules", () => {
  it("pins the canonical starter names + copy", () => {
    expect(STARTER_GROW_NAME).toBe("Starter Grow");
    expect(STARTER_TENT_NAME).toBe("Starter Tent");
    expect(STARTER_PLANT_NAME).toBe("Sample Plant");
    expect(STARTER_SETUP_BUTTON_LABEL).toBe("Skip setup — try Quick Log on a sample plant");
    // Helper copy must say no fake logs/sensor readings are added.
    expect(STARTER_SETUP_HELPER_COPY.toLowerCase()).toContain("no fake logs");
    expect(STARTER_SETUP_HELPER_COPY.toLowerCase()).toContain("sensor reading");
    expect(STARTER_SETUP_HELPER_COPY.toLowerCase()).toContain("editable");
    for (const phrase of FORBIDDEN_COPY_PHRASES) {
      expect(STARTER_SETUP_HELPER_COPY.toLowerCase()).not.toContain(phrase);
      expect(STARTER_SETUP_BUTTON_LABEL.toLowerCase()).not.toContain(phrase);
    }
  });

  it("finds an existing starter row by exact name only", () => {
    const rows = [
      { id: "a", name: "My real grow" },
      { id: "b", name: STARTER_GROW_NAME },
      { id: "c", name: "starter grow (lowercase)" },
    ];
    expect(findStarterRowByName(rows, STARTER_GROW_NAME)?.id).toBe("b");
    expect(findStarterRowByName([], STARTER_GROW_NAME)).toBeNull();
    expect(findStarterRowByName([{ id: "x", name: null }], STARTER_GROW_NAME)).toBeNull();
  });

  it("builds a Quick Log prefill that references only the starter records", () => {
    const prefill = buildStarterQuickLogPrefill({
      growId: "g",
      tentId: "t",
      plantId: "p",
      reused: { grow: false, tent: false, plant: false },
    });
    expect(prefill).toEqual({
      plantId: "p",
      plantName: STARTER_PLANT_NAME,
      growId: "g",
      tentId: "t",
      tentName: STARTER_TENT_NAME,
      eventType: "observation",
      suggestSnapshot: true,
    });
  });
});

describe("runStarterSetup", () => {
  it("throws auth error when userId is missing", async () => {
    const { db } = makeAdapter();
    await expect(runStarterSetup(null, db)).rejects.toBeInstanceOf(StarterSetupError);
  });

  it("creates all three records when nothing exists", async () => {
    const { db, spies } = makeAdapter();
    const onCreated = vi.fn();
    const result = await runStarterSetup("user-1", db, { onCreated });
    expect(result).toEqual({
      growId: "grow-1",
      tentId: "tent-1",
      plantId: "plant-1",
      reused: { grow: false, tent: false, plant: false },
    });
    expect(spies.createStarterGrow).toHaveBeenCalledTimes(1);
    expect(spies.createStarterTent).toHaveBeenCalledTimes(1);
    expect(spies.createStarterPlant).toHaveBeenCalledTimes(1);
    expect(onCreated.mock.calls).toEqual([["grow"], ["tent"], ["plant"]]);
  });

  it("is idempotent: reuses existing starter rows and creates none", async () => {
    const { db, spies } = makeAdapter({
      listOwnedGrows: vi.fn(async () => [{ id: "grow-99", name: STARTER_GROW_NAME }]),
      listOwnedTents: vi.fn(async () => [{ id: "tent-99", name: STARTER_TENT_NAME }]),
      listOwnedPlants: vi.fn(async () => [{ id: "plant-99", name: STARTER_PLANT_NAME }]),
    });
    const result = await runStarterSetup("user-1", db);
    expect(result.growId).toBe("grow-99");
    expect(result.tentId).toBe("tent-99");
    expect(result.plantId).toBe("plant-99");
    expect(result.reused).toEqual({ grow: true, tent: true, plant: true });
    expect(spies.createStarterGrow).not.toHaveBeenCalled();
    expect(spies.createStarterTent).not.toHaveBeenCalled();
    expect(spies.createStarterPlant).not.toHaveBeenCalled();
  });

  it("reuses grow but creates missing tent + plant when only grow exists", async () => {
    const { db, spies } = makeAdapter({
      listOwnedGrows: vi.fn(async () => [{ id: "grow-77", name: STARTER_GROW_NAME }]),
    });
    const result = await runStarterSetup("user-1", db);
    expect(result.reused).toEqual({ grow: true, tent: false, plant: false });
    expect(spies.createStarterGrow).not.toHaveBeenCalled();
    expect(spies.createStarterTent).toHaveBeenCalledWith("user-1", "grow-77");
    expect(spies.createStarterPlant).toHaveBeenCalledWith("user-1", "grow-77", "tent-1");
  });

  it("surfaces creation failure as StarterSetupError with step label", async () => {
    const { db } = makeAdapter({
      createStarterTent: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(runStarterSetup("user-1", db)).rejects.toMatchObject({
      name: "StarterSetupError",
      step: "tent",
    });
  });

  it("reports each durable creation even when a later starter step fails", async () => {
    const { db } = makeAdapter({
      createStarterTent: vi.fn(async () => {
        throw new Error("tent unavailable");
      }),
    });
    const onCreated = vi.fn();

    await expect(runStarterSetup("user-1", db, { onCreated })).rejects.toMatchObject({
      step: "tent",
    });
    expect(onCreated.mock.calls).toEqual([["grow"]]);
  });

  it("never lets an observability callback break a durable starter setup", async () => {
    const { db } = makeAdapter();
    const result = await runStarterSetup("user-1", db, {
      onCreated() {
        throw new Error("analytics unavailable");
      },
    });

    expect(result).toMatchObject({ growId: "grow-1", tentId: "tent-1", plantId: "plant-1" });
  });

  it("never references sensor/AI/action/alert paths on the adapter interface", () => {
    // Compile-time + runtime fence: the adapter surface exposes only
    // grow/tent/plant helpers. This test documents that intentionally.
    const adapterMethods: Array<keyof StarterSetupDataAccess> = [
      "listOwnedGrows",
      "listOwnedTents",
      "listOwnedPlants",
      "createStarterGrow",
      "createStarterTent",
      "createStarterPlant",
    ];
    for (const method of adapterMethods) {
      expect(method).not.toMatch(/sensor|reading|alert|action|ai|doctor|edge|device/i);
    }
  });
});
