import { describe, it, expect } from "vitest";
import {
  canProceedGrow,
  canProceedTent,
  canProceedPlant,
  canFinish,
  buildStartRoomGrowPayload,
  buildStartRoomTentPayload,
  buildStartRoomPlantPayload,
  nextStepAfter,
  progressLabel,
  plantDetailQuickLogHref,
  shouldPreferStartYourRoom,
  DEFAULT_START_YOUR_ROOM_FORM,
  EMPTY_START_YOUR_ROOM_IDS,
} from "@/lib/startYourRoomRules";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractMountedAppRoutePaths,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const ROOT = resolve(__dirname, "../..");

describe("startYourRoomRules", () => {
  it("validates grow name before proceed", () => {
    expect(canProceedGrow({ ...DEFAULT_START_YOUR_ROOM_FORM, growName: "" })).toBe(false);
    expect(canProceedGrow({ ...DEFAULT_START_YOUR_ROOM_FORM, growName: "  " })).toBe(false);
    expect(canProceedGrow({ ...DEFAULT_START_YOUR_ROOM_FORM, growName: "Spring" })).toBe(true);
  });

  it("tent requires name + growId", () => {
    const form = { ...DEFAULT_START_YOUR_ROOM_FORM, tentName: "4x4" };
    expect(canProceedTent(form, EMPTY_START_YOUR_ROOM_IDS)).toBe(false);
    expect(canProceedTent(form, { ...EMPTY_START_YOUR_ROOM_IDS, growId: "g1" })).toBe(true);
  });

  it("plant requires name + growId + tentId", () => {
    const form = { ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "A" };
    expect(canProceedPlant(form, { growId: "g1", tentId: null, plantId: null })).toBe(false);
    expect(canProceedPlant(form, { growId: "g1", tentId: "t1", plantId: null })).toBe(true);
  });

  it("grow payload never invents user_id", () => {
    const p = buildStartRoomGrowPayload({ ...DEFAULT_START_YOUR_ROOM_FORM, growName: "Run" });
    expect(p).toEqual({ name: "Run", grow_type: "tent", stage: "seedling" });
    expect(p).not.toHaveProperty("user_id");
  });

  it("tent payload always includes grow_id", () => {
    const p = buildStartRoomTentPayload(
      { ...DEFAULT_START_YOUR_ROOM_FORM, tentName: "Tent" },
      { growId: "g1", tentId: null, plantId: null },
    );
    expect(p).toEqual({ name: "Tent", grow_id: "g1", stage: "seedling" });
    expect(Object.keys(p!).sort()).toEqual(["grow_id", "name", "stage"]);
  });

  it("plant payload always includes grow_id and tent_id", () => {
    const p = buildStartRoomPlantPayload(
      { ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "Plant A", plantStage: "veg" },
      { growId: "g1", tentId: "t1", plantId: null },
    );
    expect(p).toEqual({
      name: "Plant A",
      grow_id: "g1",
      tent_id: "t1",
      stage: "veg",
      health: "healthy",
    });
  });

  it("step progression grow→tent→plant→done", () => {
    expect(nextStepAfter("grow")).toBe("tent");
    expect(nextStepAfter("tent")).toBe("plant");
    expect(nextStepAfter("plant")).toBe("done");
    expect(nextStepAfter("done")).toBe("done");
  });

  it("finish requires plantId", () => {
    expect(canFinish({ growId: "g", tentId: "t", plantId: null })).toBe(false);
    expect(canFinish({ growId: "g", tentId: "t", plantId: "p" })).toBe(true);
  });

  it("deep link opens Quick Log", () => {
    expect(plantDetailQuickLogHref("abc")).toBe("/plants/abc?open=quick-log");
  });

  it("prefer start room only when zero grows", () => {
    expect(shouldPreferStartYourRoom(0)).toBe(true);
    expect(shouldPreferStartYourRoom(1)).toBe(false);
  });

  it("progress labels are human-readable", () => {
    expect(progressLabel("grow")).toMatch(/Step 1/);
    expect(progressLabel("done")).toBe("Complete");
  });
});

describe("StartYourRoom page safety surface", () => {
  const PAGE = readFileSync(resolve(ROOT, "src/pages/StartYourRoom.tsx"), "utf8");
  const PERSISTENCE = readFileSync(resolve(ROOT, "src/lib/hierarchyCreatePersistence.ts"), "utf8");
  const APP = readAllRouteModuleSources();
  const ONBOARD = readFileSync(resolve(ROOT, "src/pages/Onboarding.tsx"), "utf8");

  it("is mounted at /start-room", () => {
    expect(extractMountedAppRoutePaths()).toContain("/start-room");
    expect(APP).toMatch(/StartYourRoom/);
  });

  it("onboarding surfaces Start your room for empty accounts", () => {
    expect(ONBOARD).toMatch(/shouldPreferStartYourRoom/);
    expect(ONBOARD).toMatch(/onboarding-start-room-cta/);
    expect(ONBOARD).toMatch(/\/start-room/);
  });

  it("writes only grows/tents/plants inserts — no device control", () => {
    expect(PAGE).toMatch(/persistHierarchyCreateAttempt/);
    expect(PERSISTENCE).toMatch(/return "grows"/);
    expect(PERSISTENCE).toMatch(/return "tents"/);
    expect(PERSISTENCE).toMatch(/return "plants"/);
    expect(`${PAGE}\n${PERSISTENCE}`).not.toMatch(
      /service_role|functions\.invoke|\bmqtt\b|device_control/i,
    );
  });

  it("uses pure payload builders (guaranteed binding)", () => {
    expect(PAGE).toMatch(/buildStartRoomGrowPayload/);
    expect(PAGE).toMatch(/buildStartRoomTentPayload/);
    expect(PAGE).toMatch(/buildStartRoomPlantPayload/);
  });
});
