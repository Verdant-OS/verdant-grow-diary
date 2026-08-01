import { describe, it, expect } from "vitest";
import {
  buildCreateGrowHardStopView,
  canWriteCreateGrowId,
  START_YOUR_ROOM_HREF,
} from "@/lib/createDialogGrowHardStopRules";

describe("createDialogGrowHardStopRules", () => {
  it("blocks and points to Start your room when growCount is 0", () => {
    const v = buildCreateGrowHardStopView({ targetGrowId: null, growCount: 0 }, "plant");
    expect(v.blockSubmit).toBe(true);
    expect(v.showStartRoomHardStop).toBe(true);
    expect(v.startRoomHref).toBe(START_YOUR_ROOM_HREF);
    expect(v.toastMessage).toMatch(/Start your room/i);
  });

  it("blocks when grows exist but no target selected", () => {
    const v = buildCreateGrowHardStopView({ targetGrowId: null, growCount: 2 }, "tent");
    expect(v.blockSubmit).toBe(true);
    expect(v.showPickGrowHint).toBe(true);
    expect(v.showStartRoomHardStop).toBe(false);
  });

  it("allows submit when target grow is set", () => {
    const v = buildCreateGrowHardStopView({ targetGrowId: "g1", growCount: 1 }, "tent");
    expect(v.blockSubmit).toBe(false);
    expect(canWriteCreateGrowId("g1")).toBe(true);
    expect(canWriteCreateGrowId(null)).toBe(false);
  });
});
