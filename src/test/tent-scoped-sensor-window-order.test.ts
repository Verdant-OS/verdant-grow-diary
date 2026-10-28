import { describe, expect, it } from "vitest";
import {
  combineTentScopedSensorWindows,
  mergeTentScopedSensorReadings,
} from "@/lib/tentScopedSensorReadingsRules";

const TENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("tent-scoped sensor window order", () => {
  it("orders equal captured_at by ts, then created_at, and sends unparseable times last", () => {
    const merged = mergeTentScopedSensorReadings([
      [
        {
          id: "a",
          captured_at: "2026-09-20T10:00:00Z",
          ts: "2026-09-20T00:00:00Z",
          created_at: "2026-09-20T00:00:00Z",
        },
        {
          id: "z",
          captured_at: "2026-09-20T10:00:00Z",
          ts: "2026-09-21T00:00:00Z",
          created_at: "2026-09-19T00:00:00Z",
        },
        {
          id: "m-new-created",
          captured_at: "2026-09-20T10:00:00Z",
          ts: "2026-09-20T00:00:00Z",
          created_at: "2026-09-22T00:00:00Z",
        },
        {
          id: "bad",
          captured_at: "not-a-time",
          ts: "2026-09-22T00:00:00Z",
          created_at: "2026-09-22T00:00:00Z",
        },
      ],
    ]);
    expect(merged.map((reading) => reading.id)).toEqual(["z", "m-new-created", "a", "bad"]);
    const reversed = mergeTentScopedSensorReadings([[...merged].reverse()]);
    expect(reversed.map((reading) => reading.id)).toEqual(["z", "m-new-created", "a", "bad"]);
  });

  it("does not publish cached rows from a window that is still pending", () => {
    const refreshing = {
      data: [{ id: "a", captured_at: "2026-09-20T00:00:00Z" }],
      isPending: true,
      isError: false,
    };
    expect(combineTentScopedSensorWindows([TENT_A], [refreshing])).toEqual({
      status: "pending",
      data: undefined,
    });
  });

  it("reports an error when a failed window sits beside a pending one", () => {
    const pending = { data: undefined, isPending: true, isError: false };
    const failed = { data: undefined, isPending: false, isError: true };
    expect(combineTentScopedSensorWindows([TENT_A, TENT_B], [failed, pending])).toEqual({
      status: "error",
      data: undefined,
    });
  });
});
