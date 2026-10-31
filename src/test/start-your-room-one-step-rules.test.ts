import { describe, it, expect } from "vitest";
import {
  canSubmitRoom,
  buildStartRoomGrowPayload,
  buildStartRoomTentPayload,
  buildStartRoomPlantPayload,
  firstMissingStep,
  isValidRoomName,
  oneStepProgressLabel,
  startRoomFormWithDefaults,
  DEFAULT_START_YOUR_ROOM_FORM,
  EMPTY_START_YOUR_ROOM_IDS,
  START_YOUR_ROOM_COPY,
  START_YOUR_ROOM_DEFAULT_GROW_NAME,
  START_YOUR_ROOM_DEFAULT_TENT_NAME,
} from "@/lib/startYourRoomRules";

/** VER-296 one-step pure rules — regression fence for canSubmitRoom and defaults. */

describe("startYourRoomRules one-step (VER-296)", () => {
  it("room names must be 1–80 trimmed characters", () => {
    expect(isValidRoomName("")).toBe(false);
    expect(isValidRoomName("   ")).toBe(false);
    expect(isValidRoomName("a")).toBe(true);
    expect(isValidRoomName("a".repeat(80))).toBe(true);
    expect(isValidRoomName("a".repeat(81))).toBe(false);
    expect(isValidRoomName(null)).toBe(false);
  });

  it("firstMissingStep follows grow → tent → plant → done from ids", () => {
    expect(firstMissingStep(EMPTY_START_YOUR_ROOM_IDS)).toBe("grow");
    expect(firstMissingStep({ growId: "g1", tentId: null, plantId: null })).toBe("tent");
    expect(firstMissingStep({ growId: "g1", tentId: "t1", plantId: null })).toBe("plant");
    expect(firstMissingStep({ growId: "g1", tentId: "t1", plantId: "p1" })).toBe("done");
  });

  it("startRoomFormWithDefaults fills blank grow and tent names only", () => {
    const blank = startRoomFormWithDefaults(DEFAULT_START_YOUR_ROOM_FORM);
    expect(blank.growName).toBe(START_YOUR_ROOM_DEFAULT_GROW_NAME);
    expect(blank.tentName).toBe(START_YOUR_ROOM_DEFAULT_TENT_NAME);
    expect(blank.plantName).toBe("");

    const custom = startRoomFormWithDefaults({
      ...DEFAULT_START_YOUR_ROOM_FORM,
      growName: "  Spring  ",
      tentName: "4x4",
      plantName: "A",
    });
    expect(custom.growName).toBe("  Spring  ");
    expect(custom.tentName).toBe("4x4");
  });

  it("canSubmitRoom requires plant name and valid names for items still to create", () => {
    const emptyIds = EMPTY_START_YOUR_ROOM_IDS;
    expect(canSubmitRoom({ ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "" }, emptyIds)).toBe(false);
    expect(canSubmitRoom({ ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "Plant A" }, emptyIds)).toBe(
      true,
    );

    const growOnly = { growId: "g1", tentId: null, plantId: null };
    expect(
      canSubmitRoom(
        { ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "Plant A", tentName: "a".repeat(81) },
        growOnly,
      ),
    ).toBe(false);
    expect(canSubmitRoom({ ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "Plant A" }, growOnly)).toBe(
      true,
    );

    const tentOnly = { growId: "g1", tentId: "t1", plantId: null };
    expect(canSubmitRoom({ ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "Plant A" }, tentOnly)).toBe(
      true,
    );
  });

  it("payload builders work with defaulted form for one-step submit", () => {
    const form = startRoomFormWithDefaults({
      ...DEFAULT_START_YOUR_ROOM_FORM,
      plantName: "Plant A",
    });
    expect(buildStartRoomGrowPayload(form)).toEqual({
      name: START_YOUR_ROOM_DEFAULT_GROW_NAME,
      grow_type: "tent",
      stage: "seedling",
    });
    expect(buildStartRoomTentPayload(form, { growId: "g1", tentId: null, plantId: null })).toEqual({
      name: START_YOUR_ROOM_DEFAULT_TENT_NAME,
      grow_id: "g1",
      stage: "seedling",
    });
    expect(buildStartRoomPlantPayload(form, { growId: "g1", tentId: "t1", plantId: null })).toEqual(
      {
        name: "Plant A",
        grow_id: "g1",
        tent_id: "t1",
        stage: "seedling",
      },
    );
  });

  it("oneStepProgressLabel matches the one-step UI copy", () => {
    expect(oneStepProgressLabel("grow")).toBe(START_YOUR_ROOM_COPY.oneStepProgress);
    expect(oneStepProgressLabel("plant")).toBe(START_YOUR_ROOM_COPY.oneStepProgress);
    expect(oneStepProgressLabel("done")).toBe("Complete");
  });
});
