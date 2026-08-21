import { beforeEach, describe, expect, it } from "vitest";

import { rememberRecentQuickLogTarget } from "@/lib/quickLogRecentTargetStore";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const KEY = "verdant.quickLog.lastTarget.v2.user-1";

beforeEach(() => clearLocalStorageForTest());

describe("rememberRecentQuickLogTarget — narrow local-only schema", () => {
  it("serializes exactly plantId, growId, tentId, and savedAt", () => {
    const target = {
      plantId: "plant-1",
      growId: "grow-1",
      tentId: "tent-1",
      savedAt: "2026-08-20T12:00:00.000Z",
      // Model an accidental wider object reaching the typed boundary. The
      // storage writer must project the approved schema instead of serializing
      // every enumerable field it receives.
      sensor_readings: [{ temperature: 99 }],
      token: "must-not-persist",
    };

    rememberRecentQuickLogTarget(target, "user-1");

    expect(JSON.parse(getLocalStorageItemForTest(KEY) ?? "{}")).toEqual({
      plantId: "plant-1",
      growId: "grow-1",
      tentId: "tent-1",
      savedAt: "2026-08-20T12:00:00.000Z",
    });
  });
});
